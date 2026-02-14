import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { generateChatCompletionStream, generateEmbedding, cosineSimilarity, rewriteQueryForSearch } from "./openai";
import { type SearchResult, type Message } from "@shared/schema";
import path from "path";
import { promises as fs } from "fs";
import { setupAuth, isAuthenticated, getSession } from "./sessionAuth";
import { setupSocialAuth } from "./socialAuth";
import { PLAN_LIMITS } from "./stripe";
import { chunkingQueue } from "./chunkingQueue";
import { expirationScheduler } from "./scheduler";
import { supabaseStorageService } from "./supabaseStorage";
import {
  decodeFilename,
  isObjectStoragePath,
  isDocumentFile,
  extractDocumentContentFromBuffer,
  getFileBufferFromStorage,
  detectPdfConversionRequest,
  isConvertibleToPdf,
  convertToPdf,
} from "./utils/fileProcessing";
import { randomUUID } from "crypto";

// Import domain routers
import {
  authRouter,
  projectsRouter,
  foldersRouter,
  conversationsRouter,
  filesRouter,
  searchRouter,
  stripeRouter,
  adminRouter,
  trashRouter,
} from "./routes/index";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Authentication (session + passport)
  await setupAuth(app);

  // Setup social OAuth login routes (Google, Naver, Kakao)
  setupSocialAuth(app);

  // Health check endpoint for deployment
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Register domain routers
  app.use("/api", authRouter);
  app.use("/api", projectsRouter);
  app.use("/api", foldersRouter);
  app.use("/api", conversationsRouter);
  app.use("/api", filesRouter);
  app.use("/api", searchRouter);
  app.use("/api", stripeRouter);
  app.use("/api", adminRouter);
  app.use("/api", trashRouter);

  // Ensure uploads directory exists
  const uploadDir = path.join(process.cwd(), "uploads");
  await fs.mkdir(uploadDir, { recursive: true });

  // Chat with streaming - OPTIMIZED for low latency
  app.post("/api/chat", isAuthenticated, async (req, res) => {
    const startTime = Date.now();
    try {
      const user = req.user as any;
      const userId = user.id;
      const { conversationId, message, attachments } = req.body;

      if (!conversationId || (!message && !attachments)) {
        res.status(400).json({ error: "Missing conversationId or message" });
        return;
      }

      // Set up SSE headers immediately
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("Content-Encoding", "identity");
      res.flushHeaders();

      if (res.socket) {
        res.socket.setNoDelay(true);
      }

      // PARALLEL PHASE 1: Fetch conversation + history + files simultaneously
      const [conversation, conversationHistory, files] = await Promise.all([
        storage.getConversation(conversationId, userId),
        storage.getMessages(conversationId, userId),
        storage.getFilesByConversation(conversationId, userId),
      ]);

      if (!conversation) {
        res.write(`data: ${JSON.stringify({ type: "error", error: "Conversation not found" })}\n\n`);
        res.end();
        return;
      }

      // Create user message (fast DB operation)
      const userMessage = await storage.createMessage({
        conversationId,
        role: "user",
        content: message || "",
        attachments,
      }, userId);

      // Build chat messages for OpenAI (process attachments in parallel)
      const chatMessages = await Promise.all(conversationHistory.map(async (m) => {
        if (m.attachments && Array.isArray(m.attachments) && m.attachments.length > 0) {
          const contentParts: Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> = [];

          for (const attachment of m.attachments as any[]) {
            if (attachment.mimeType?.startsWith("image/")) {
              const imagePath = path.join(uploadDir, attachment.filename);
              try {
                const imageBuffer = await fs.readFile(imagePath);
                const base64Image = imageBuffer.toString('base64');
                const dataUrl = `data:${attachment.mimeType};base64,${base64Image}`;
                contentParts.push({
                  type: "image_url",
                  image_url: { url: dataUrl },
                });
              } catch (error) {
                console.error(`Failed to read image ${imagePath}:`, error);
              }
            }
          }

          if (m.content) {
            contentParts.push({ type: "text", text: m.content });
          }

          return { role: m.role, content: contentParts.length > 0 ? contentParts : m.content };
        }
        return { role: m.role, content: m.content };
      }));

      // Build base system prompt (fast, no async)
      const markdownInstructions = `

FORMAT INSTRUCTIONS:
- Always format responses using Markdown for better readability
- Use headers (## or ###) to organize sections  
- Use bullet points (-) or numbered lists (1. 2. 3.) for multiple items
- Use **bold** for emphasis on important terms
- Use \`code\` for technical terms, commands, or code snippets
- Use code blocks with language specification for multi-line code
- Use > for quotes or important callouts
- Break long responses into clear sections with headers
- Keep paragraphs concise and well-spaced
`;
      let systemPrompt = (conversation.instructions || "You are a helpful AI assistant.") + markdownInstructions;

      // Add knowledge base files
      const filesWithContent = files.filter(f => f.content);
      if (filesWithContent.length > 0) {
        const knowledgeBase = filesWithContent
          .map((file, idx) => `File ${idx + 1} (${file.originalName}):\n${file.content}`)
          .join("\n\n---\n\n");
        systemPrompt += `\n\nYou have access to the following knowledge base files:\n\n${knowledgeBase}\n\nUse this information to provide accurate and relevant answers.`;
      }

      // START STREAMING IMMEDIATELY - RAG processing happens in background
      console.log(`[Chat API] Starting stream after ${Date.now() - startTime}ms`);

      let fullResponse = "";

      // OPTIMIZATION: Start RAG search and OpenAI streaming in parallel
      const ragPromise = (async () => {
        if (!message) return [];

        try {
          const userEmbedding = await generateEmbedding(message);

          // Save user embedding in background (don't await)
          storage.updateMessageEmbedding(userMessage.id, userId, JSON.stringify(userEmbedding), userEmbedding).catch(
            err => console.error("Background embedding save failed:", err)
          );

          // Optimized RAG: Fetch only messages with embeddings, batch conversation/project lookups
          const allMessages = await storage.getAllMessages(userId);
          const relevantContexts: SearchResult[] = [];

          const conversationIds = new Set<string>();
          const projectIds = new Set<string>();
          const similarMessages: Array<{ msg: any; similarity: number }> = [];

          for (const msg of allMessages) {
            if (msg.id === userMessage.id || !msg.embedding || msg.conversationId === conversationId) continue;

            try {
              const msgEmbedding = JSON.parse(msg.embedding);
              const similarity = cosineSimilarity(userEmbedding, msgEmbedding);

              if (similarity > 0.2) {
                similarMessages.push({ msg, similarity });
                conversationIds.add(msg.conversationId);
              }
            } catch {
              continue;
            }
          }

          // Batch fetch conversations
          const conversationMap = new Map<string, any>();
          for (const convId of Array.from(conversationIds)) {
            const conv = await storage.getConversation(convId, userId);
            if (conv) {
              conversationMap.set(convId, conv);
              projectIds.add(conv.projectId);
            }
          }

          // Batch fetch projects
          const projectMap = new Map<string, any>();
          for (const projId of Array.from(projectIds)) {
            const proj = await storage.getProject(projId, userId);
            if (proj) projectMap.set(projId, proj);
          }

          // Build contexts with pre-fetched data
          for (const { msg, similarity } of similarMessages) {
            const msgConversation = conversationMap.get(msg.conversationId);
            if (!msgConversation) continue;

            const project = projectMap.get(msgConversation.projectId);
            if (!project) continue;

            relevantContexts.push({
              messageId: msg.id,
              conversationId: msg.conversationId,
              conversationName: msgConversation.name,
              projectName: project.name,
              role: msg.role,
              messageContent: msg.content,
              similarity,
              createdAt: new Date(msg.createdAt).toISOString(),
              matchType: 'semantic',
            });
          }

          relevantContexts.sort((a, b) => b.similarity - a.similarity);
          return relevantContexts.slice(0, 10);
        } catch (err) {
          console.error("RAG search error:", err);
          return [];
        }
      })();

      // Start OpenAI streaming immediately
      for await (const chunk of generateChatCompletionStream([
        { role: "system", content: systemPrompt },
        ...chatMessages,
      ])) {
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({ type: "content", content: chunk })}\n\n`);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      }

      // Wait for RAG and send context (after streaming, for future reference)
      const topContexts = await ragPromise;
      if (topContexts.length > 0) {
        console.log(`[RAG API] Found ${topContexts.length} contexts (processed in background)`);
        res.write(`data: ${JSON.stringify({ type: "context", sources: topContexts })}\n\n`);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      }

      // Save AI message
      const aiMessage = await storage.createMessage({
        conversationId,
        role: "assistant",
        content: fullResponse,
      }, userId);

      // Background: Generate AI response embedding (don't block response)
      generateEmbedding(fullResponse)
        .then(embedding => storage.updateMessageEmbedding(aiMessage.id, userId, JSON.stringify(embedding), embedding))
        .catch(err => console.error("Background AI embedding failed:", err));

      console.log(`[Chat API] Total time: ${Date.now() - startTime}ms`);

      res.write(`data: ${JSON.stringify({ type: "done", messageId: aiMessage.id })}\n\n`);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
      res.end();
    } catch (error) {
      console.error("Chat error:", error);
      res.write(`data: ${JSON.stringify({ type: "error", error: "Failed to process chat message" })}\n\n`);
      res.end();
    }
  });

  // Serve uploaded files (for search router's /uploads/:filename - needs to be at app level)
  app.get("/uploads/:filename", async (req, res) => {
    try {
      const filePath = path.join(uploadDir, req.params.filename);
      res.sendFile(filePath);
    } catch (error) {
      res.status(404).json({ error: "File not found" });
    }
  });

  const httpServer = createServer(app);

  // Start the expiration scheduler
  expirationScheduler.start();

  // Setup WebSocket server for chat streaming
  const wss = new WebSocketServer({ noServer: true });
  const sessionParser = getSession();

  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url === "/ws/chat") {
      // Parse session before WebSocket upgrade
      sessionParser(req as any, {} as any, () => {
        const session = (req as any).session;

        // Read user from session (passport stores it in session.passport.user)
        const user = session?.passport?.user;

        // Check if user exists
        const userId = user?.id;
        if (!user || !userId) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        // Set req.user for the connection handler
        (req as any).user = user;

        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, req);
        });
      });
    }
  });

  wss.on("connection", async (ws, req) => {
    const user = (req as any).user;
    const userId = user?.id;

    console.log(`[WebSocket] New connection attempt for user: ${userId || 'unknown'}`);

    if (!userId) {
      console.log(`[WebSocket] Connection rejected: Not authenticated`);
      ws.send(JSON.stringify({ type: "error", error: "Not authenticated" }));
      ws.close();
      return;
    }

    console.log(`[WebSocket] Connected: User ${userId}`);

    // Helper function to safely send messages
    const safeSend = (data: any) => {
      if (ws.readyState === 1) { // WebSocket.OPEN = 1
        try {
          ws.send(JSON.stringify(data));
        } catch (e) {
          console.error("Failed to send WebSocket message:", e);
        }
      }
    };

    // Ping/Pong heartbeat to detect stale connections
    let isAlive = true;
    const pingInterval = setInterval(() => {
      if (!isAlive) {
        console.log(`[WebSocket] Connection stale, terminating: User ${userId}`);
        clearInterval(pingInterval);
        ws.terminate();
        return;
      }
      isAlive = false;
      if (ws.readyState === 1) {
        ws.ping();
      }
    }, 30000); // Ping every 30 seconds

    ws.on("pong", () => {
      isAlive = true;
    });

    // Subscribe to chunking queue events for this user
    const unsubscribeChunking = chunkingQueue.subscribe(userId, (event) => {
      safeSend({
        type: `chunking_${event.type}`,
        fileId: event.fileId,
        ...event.data,
      });
    });

    // Clean up subscription when connection closes
    ws.on("close", () => {
      console.log(`[WebSocket] Disconnected: User ${userId}`);
      clearInterval(pingInterval);
      unsubscribeChunking();
    });

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        const { conversationId, content, attachments, taggedFiles } = message;

        console.log(`[WebSocket] Message received from user ${userId}: conversationId=${conversationId}, content length=${content?.length || 0}`);

        const conversation = await storage.getConversation(conversationId, userId);
        if (!conversation) {
          console.log(`[WebSocket] Conversation not found: ${conversationId}`);
          safeSend({ type: "error", error: "Conversation not found" });
          return;
        }

        // Fetch tagged file contents from database
        let taggedTextFiles: Array<{ name: string; content: string; mimeType: string }> = [];
        let taggedImageFiles: Array<{ name: string; dataUrl: string; mimeType: string }> = [];
        let taggedConversations: Array<{ name: string; content: string }> = [];

        if (taggedFiles && Array.isArray(taggedFiles) && taggedFiles.length > 0) {
          const filePromises = taggedFiles.map(async (tf: { id: string; originalName: string; mimeType?: string; type?: "file" | "conversation" }) => {
            try {
              // Handle tagged conversations
              if (tf.type === "conversation" || tf.mimeType === "application/x-conversation") {
                const taggedConv = await storage.getConversation(tf.id, userId);
                if (!taggedConv) {
                  console.log(`[Tagged Conversations] Conversation not found: ${tf.id}`);
                  return null;
                }

                const convMessages = await storage.getMessages(tf.id, userId);
                if (!convMessages || convMessages.length === 0) {
                  console.log(`[Tagged Conversations] No messages in conversation: ${tf.originalName}`);
                  return {
                    type: 'conversation' as const,
                    name: tf.originalName,
                    content: `[Conversation: ${tf.originalName}]\nNo messages in this conversation.`,
                  };
                }

                // Format conversation messages for AI analysis
                const formattedMessages = convMessages.map((msg: Message) => {
                  const role = msg.role === "user" ? "User" : "AI";
                  return `[${role}]: ${msg.content}`;
                }).join("\n\n");

                console.log(`[Tagged Conversations] Loaded: ${tf.originalName} (${convMessages.length} messages)`);
                return {
                  type: 'conversation' as const,
                  name: tf.originalName,
                  content: `[Conversation: ${tf.originalName}]\n${formattedMessages}`,
                };
              }

              const file = await storage.getFileById(tf.id, userId);
              if (!file) {
                console.log(`[Tagged Files] File not found: ${tf.id}`);
                return null;
              }

              // Use mimeType from tagged file, then from database, then infer from extension
              let mimeType = tf.mimeType || file.mimeType;

              // Infer MIME type from file extension if not available
              if (!mimeType || mimeType === "application/octet-stream") {
                const ext = (tf.originalName || file.originalName || "").toLowerCase().split('.').pop();
                const mimeMap: Record<string, string> = {
                  // Image files
                  'png': 'image/png',
                  'jpg': 'image/jpeg',
                  'jpeg': 'image/jpeg',
                  'gif': 'image/gif',
                  'webp': 'image/webp',
                  'svg': 'image/svg+xml',
                  'bmp': 'image/bmp',
                  'ico': 'image/x-icon',
                  // Text files
                  'txt': 'text/plain',
                  'json': 'application/json',
                  'js': 'application/javascript',
                  'ts': 'text/typescript',
                  'html': 'text/html',
                  'css': 'text/css',
                  'md': 'text/markdown',
                  // Document files
                  'pdf': 'application/pdf',
                  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  'doc': 'application/msword',
                  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  'xls': 'application/vnd.ms-excel',
                  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                  'ppt': 'application/vnd.ms-powerpoint',
                };
                mimeType = (ext && mimeMap[ext]) || mimeType || "application/octet-stream";
              }

              console.log(`[Tagged Files] Processing: ${tf.originalName}, mimeType: ${mimeType}`);

              // Handle image files - read from storage and convert to base64
              if (mimeType && mimeType.startsWith("image/")) {
                if (!file.filename) {
                  console.error(`[Tagged Files] Image file has no filename: ${tf.originalName}`);
                  return null;
                }

                try {
                  const imageBuffer = await getFileBufferFromStorage(file.filename);
                  if (!imageBuffer) {
                    console.error(`[Tagged Files] Image file not found in storage: ${tf.originalName}`);
                    return null;
                  }
                  const base64Image = imageBuffer.toString('base64');
                  const dataUrl = `data:${mimeType};base64,${base64Image}`;
                  console.log(`[Tagged Files] Loaded image: ${tf.originalName} (${(imageBuffer.length / 1024).toFixed(1)}KB)`);
                  return {
                    type: 'image' as const,
                    name: tf.originalName,
                    dataUrl,
                    mimeType,
                  };
                } catch (e) {
                  console.error(`[Tagged Files] Failed to read image file ${tf.originalName}:`, e);
                  return null;
                }
              }

              // Handle document files (PDF, Word, Excel, PowerPoint) - extract content
              const ext = path.extname(tf.originalName || file.originalName || '').toLowerCase();
              if (isDocumentFile(mimeType, ext)) {
                if (!file.filename) {
                  console.error(`[Tagged Files] Document file has no filename: ${tf.originalName}`);
                  return null;
                }

                try {
                  const docBuffer = await getFileBufferFromStorage(file.filename);
                  if (!docBuffer) {
                    console.error(`[Tagged Files] Document file not found in storage: ${tf.originalName}`);
                    return null;
                  }
                  const extractedContent = await extractDocumentContentFromBuffer(docBuffer, mimeType, tf.originalName);
                  if (extractedContent) {
                    console.log(`[Tagged Files] Document content extracted: ${tf.originalName} (${extractedContent.length} chars)`);
                    return {
                      type: 'text' as const,
                      name: tf.originalName,
                      content: extractedContent,
                      mimeType,
                    };
                  } else {
                    console.log(`[Tagged Files] No content extracted from document: ${tf.originalName}`);
                    return null;
                  }
                } catch (e) {
                  console.error(`[Tagged Files] Failed to extract document content ${tf.originalName}:`, e);
                  return null;
                }
              }

              // Handle text files - use content from database
              if (file.content) {
                return {
                  type: 'text' as const,
                  name: tf.originalName,
                  content: file.content,
                  mimeType,
                };
              }

              return null;
            } catch (e) {
              console.error("Failed to fetch tagged file:", e);
              return null;
            }
          });
          const results = await Promise.all(filePromises);

          for (const r of results) {
            if (!r) continue;
            if (r.type === 'image') {
              taggedImageFiles.push({ name: r.name, dataUrl: r.dataUrl, mimeType: r.mimeType });
            } else if (r.type === 'text') {
              taggedTextFiles.push({ name: r.name, content: r.content, mimeType: r.mimeType });
            } else if (r.type === 'conversation') {
              taggedConversations.push({ name: r.name, content: r.content });
            }
          }
          console.log(`[Tagged Files] Processed: ${taggedTextFiles.length} text files, ${taggedImageFiles.length} image files, ${taggedConversations.length} conversations`);
        }

        // Check for PDF conversion request and handle convertible tagged files
        let conversionResults: Array<{
          originalFile: { id: string; name: string };
          convertedFile: { id: string; name: string; size: number; downloadUrl: string };
        }> = [];

        if (content && detectPdfConversionRequest(content) && taggedFiles && taggedFiles.length > 0) {
          console.log(`[PDF Conversion] Conversion request detected with ${taggedFiles.length} tagged files`);

          for (const tf of taggedFiles) {
            try {
              if (tf.type === "conversation") continue;

              const file = await storage.getFileById(tf.id, userId);
              if (!file) continue;

              const ext = path.extname(file.originalName).toLowerCase();
              if (!isConvertibleToPdf(file.mimeType, ext)) {
                console.log(`[PDF Conversion] Skipping non-convertible file: ${file.originalName}`);
                continue;
              }

              const inputPath = path.join(process.cwd(), "uploads", file.filename);
              try {
                await fs.access(inputPath);
              } catch {
                console.log(`[PDF Conversion] Source file not found: ${file.originalName}`);
                continue;
              }

              safeSend({
                type: "conversion_started",
                filename: file.originalName,
                message: `Converting ${file.originalName} to PDF...`
              });

              const outputDir = path.join(process.cwd(), "uploads", "converted");
              const pdfPath = await convertToPdf(inputPath, outputDir);

              const pdfOriginalName = file.originalName.replace(/\.[^/.]+$/, ".pdf");
              const pdfStats = await fs.stat(pdfPath);

              const uniquePdfFilename = `${randomUUID()}.pdf`;
              const finalPdfPath = path.join(process.cwd(), "uploads", uniquePdfFilename);
              await fs.rename(pdfPath, finalPdfPath);

              const pdfFile = await storage.createFile({
                projectId: file.projectId,
                folderId: file.folderId,
                conversationId: file.conversationId,
                filename: uniquePdfFilename,
                originalName: pdfOriginalName,
                mimeType: "application/pdf",
                size: pdfStats.size,
                content: null,
              }, userId);

              conversionResults.push({
                originalFile: { id: file.id, name: file.originalName },
                convertedFile: {
                  id: pdfFile.id,
                  name: pdfOriginalName,
                  size: pdfStats.size,
                  downloadUrl: `/api/files/${pdfFile.id}/download`,
                },
              });

              safeSend({
                type: "conversion_completed",
                result: conversionResults[conversionResults.length - 1]
              });

              console.log(`[PDF Conversion] Successfully converted: ${file.originalName} -> ${pdfOriginalName}`);
            } catch (convError) {
              console.error(`[PDF Conversion] Failed to convert file:`, convError);
              safeSend({
                type: "conversion_error",
                filename: tf.originalName,
                error: "Failed to convert file to PDF"
              });
            }
          }
        }

        // Save user message immediately
        const userMessage = await storage.createMessage({
          conversationId,
          role: "user",
          content: content || "",
          attachments,
        }, userId);

        // Start embedding generation and query rewriting in parallel
        let userEmbeddingPromise: Promise<number[] | null> = Promise.resolve(null);
        let queryRewritePromise: Promise<{ rewrittenQuery: string; searchKeywords: string[] }> =
          Promise.resolve({ rewrittenQuery: content || "", searchKeywords: [] });

        if (content) {
          // Run query rewriting in parallel with embedding generation
          queryRewritePromise = rewriteQueryForSearch(content)
            .then((result) => {
              console.log(`[Query Rewrite] Original: "${content.slice(0, 50)}..." -> Rewritten: "${result.rewrittenQuery}", Keywords: [${result.searchKeywords.join(', ')}]`);
              return result;
            })
            .catch((error) => {
              console.error("[Query Rewrite] Failed:", error);
              return { rewrittenQuery: content, searchKeywords: [] };
            });

          userEmbeddingPromise = generateEmbedding(content)
            .then(async (embedding) => {
              try {
                await storage.updateMessageEmbedding(userMessage.id, userId, JSON.stringify(embedding), embedding);
                return embedding;
              } catch (storageError) {
                console.error("Failed to store user message embedding:", storageError);
                safeSend({
                  type: "error",
                  error: "Failed to save message embedding. RAG search may not include this message."
                });
                return embedding;
              }
            })
            .catch((embeddingError: any) => {
              console.error("Failed to generate embedding for user message:", embeddingError);
              if (embeddingError.code === 'insufficient_quota') {
                safeSend({
                  type: "error",
                  error: "OpenAI API quota exceeded. RAG search will be unavailable."
                });
              } else {
                safeSend({
                  type: "error",
                  error: "Failed to generate message embedding. RAG search will be unavailable for this message."
                });
              }
              return null;
            });
        }

        // Get conversation history immediately (most critical for AI response)
        const conversationHistory = await storage.getMessages(conversationId, userId);

        // Parallelize image reading within each message
        const chatMessages = await Promise.all(conversationHistory.map(async (m) => {
          if (m.attachments && Array.isArray(m.attachments) && m.attachments.length > 0) {
            const contentParts: Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> = [];

            // Read all images in parallel
            const imagePromises = (m.attachments as any[])
              .filter((attachment) => attachment.mimeType?.startsWith("image/"))
              .map(async (attachment) => {
                const imagePath = path.join(uploadDir, attachment.filename);
                try {
                  const imageBuffer = await fs.readFile(imagePath);
                  const base64Image = imageBuffer.toString('base64');
                  const dataUrl = `data:${attachment.mimeType};base64,${base64Image}`;
                  return {
                    type: "image_url" as const,
                    image_url: { url: dataUrl }
                  };
                } catch (e) {
                  console.error("Failed to read image:", e);
                  return null;
                }
              });

            const imageResults = await Promise.all(imagePromises);
            contentParts.push(...imageResults.filter((r): r is NonNullable<typeof r> => r !== null));

            if (m.content) {
              contentParts.unshift({ type: "text", text: m.content });
            }

            return {
              role: m.role,
              content: contentParts.length > 0 ? contentParts : m.content
            };
          }

          return { role: m.role, content: m.content };
        }));

        // Start RAG search in background while preparing AI response
        // Get user's subscription tier for HNSW ef_search optimization
        const userSubscription = await storage.getSubscription(userId);
        const subscriptionTier = userSubscription?.plan || 'free';

        const ragSearchPromise = Promise.all([userEmbeddingPromise, queryRewritePromise]).then(async ([userEmbedding, queryRewriteResult]) => {
          const relevantContexts: SearchResult[] = [];
          const { searchKeywords } = queryRewriteResult;

          // Helper function for keyword matching score with token-aware matching
          const calculateKeywordScore = (text: string, keywords: string[]): number => {
            if (!keywords.length || !text) return 0;
            const lowerText = text.toLowerCase();
            let matchCount = 0;
            let weightedScore = 0;

            for (const keyword of keywords) {
              const lowerKeyword = keyword.toLowerCase();
              if (lowerText.includes(lowerKeyword)) {
                matchCount++;
                const wordBoundaryRegex = new RegExp(`(^|\\s|[^a-zA-Z가-힣])${lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s|[^a-zA-Z가-힣])`, 'i');
                if (wordBoundaryRegex.test(lowerText)) {
                  weightedScore += 1.5;
                } else {
                  weightedScore += 0.5;
                }
              }
            }

            return Math.min(1, weightedScore / (keywords.length * 1.5));
          };

          // Use pgvector SQL-based semantic search when embedding is available
          if (userEmbedding) {
            console.log(`[RAG WebSocket] Using pgvector SQL-based semantic search`);
            const startTime = Date.now();

            const [vectorMessages, vectorChunks] = await Promise.all([
              storage.searchMessagesByVector(userId, userEmbedding, 50, conversationId, false, subscriptionTier),
              storage.searchFileChunksByVector(userId, userEmbedding, 30, false, subscriptionTier)
            ]);

            console.log(`[RAG WebSocket] pgvector search completed in ${Date.now() - startTime}ms: ${vectorMessages.length} messages, ${vectorChunks.length} chunks`);

            const conversationCache = new Map<string, Awaited<ReturnType<typeof storage.getConversation>>>();
            const projectCache = new Map<string, Awaited<ReturnType<typeof storage.getProject>>>();

            for (const msg of vectorMessages) {
              if (msg.similarity < 0.15) continue;

              const keywordScore = searchKeywords.length > 0 ? calculateKeywordScore(msg.content, searchKeywords) : 0;
              const combinedScore = keywordScore > 0
                ? msg.similarity * 0.7 + keywordScore * 0.3
                : msg.similarity * 0.85;

              if (!conversationCache.has(msg.conversationId)) {
                conversationCache.set(msg.conversationId, await storage.getConversation(msg.conversationId, userId));
              }
              const msgConversation = conversationCache.get(msg.conversationId);

              if (msgConversation) {
                if (!projectCache.has(msgConversation.projectId)) {
                  projectCache.set(msgConversation.projectId, await storage.getProject(msgConversation.projectId, userId));
                }
                const project = projectCache.get(msgConversation.projectId);

                if (project) {
                  relevantContexts.push({
                    messageId: msg.id,
                    conversationId: msg.conversationId,
                    conversationName: msgConversation.name,
                    projectName: project.name,
                    role: msg.role,
                    messageContent: msg.content,
                    similarity: combinedScore,
                    createdAt: new Date(msg.createdAt).toISOString(),
                    matchType: keywordScore > msg.similarity ? 'exact' : 'semantic',
                  });
                }
              }
            }

            // Process file chunk results with keyword boost
            const fileCache = new Map<string, Awaited<ReturnType<typeof storage.getFileById>>>();

            for (const chunk of vectorChunks) {
              if (chunk.similarity < 0.2) continue;

              const keywordScore = searchKeywords.length > 0 ? calculateKeywordScore(chunk.content, searchKeywords) : 0;
              const combinedScore = keywordScore > 0
                ? chunk.similarity * 0.6 + keywordScore * 0.4
                : chunk.similarity * 0.8;

              if (!fileCache.has(chunk.fileId)) {
                fileCache.set(chunk.fileId, await storage.getFileById(chunk.fileId, userId));
              }
              const file = fileCache.get(chunk.fileId);

              if (file) {
                if (!projectCache.has(file.projectId)) {
                  projectCache.set(file.projectId, await storage.getProject(file.projectId, userId));
                }
                const project = projectCache.get(file.projectId);

                if (project) {
                  relevantContexts.push({
                    messageId: chunk.id,
                    conversationId: file.conversationId || '',
                    conversationName: `File: ${file.originalName}`,
                    projectName: project.name,
                    role: 'assistant',
                    messageContent: chunk.content,
                    similarity: combinedScore,
                    createdAt: new Date(chunk.createdAt).toISOString(),
                    matchType: 'file_chunk',
                  });
                }
              }
            }
          } else {
            // Fallback to keyword-only search when no embedding available
            console.log(`[RAG WebSocket] No embedding available, using keyword-only search`);
            const allMessages = await storage.getAllMessages(userId);

            for (const msg of allMessages) {
              if (msg.id === userMessage.id || msg.conversationId === conversationId) continue;

              if (searchKeywords.length > 0) {
                const keywordScore = calculateKeywordScore(msg.content, searchKeywords);
                if (keywordScore > 0.2) {
                  const msgConversation = await storage.getConversation(msg.conversationId, userId);
                  if (msgConversation) {
                    const project = await storage.getProject(msgConversation.projectId, userId);
                    if (project) {
                      relevantContexts.push({
                        messageId: msg.id,
                        conversationId: msg.conversationId,
                        conversationName: msgConversation.name,
                        projectName: project.name,
                        role: msg.role,
                        messageContent: msg.content,
                        similarity: keywordScore * 0.75,
                        createdAt: new Date(msg.createdAt).toISOString(),
                        matchType: 'exact',
                      });
                    }
                  }
                }
              }
            }
          }

          // Dynamic ranking: adjust results based on quality
          relevantContexts.sort((a, b) => b.similarity - a.similarity);

          let dynamicThreshold = 0.1;
          const highQualityCount = relevantContexts.filter(c => c.similarity > 0.5).length;
          const totalCount = relevantContexts.length;

          if (highQualityCount > 5) {
            dynamicThreshold = 0.25;
          } else if (highQualityCount > 2) {
            dynamicThreshold = 0.15;
          } else if (totalCount < 3) {
            dynamicThreshold = 0.05;
          }

          let filteredContexts = relevantContexts.filter(c => c.similarity >= dynamicThreshold);

          if (filteredContexts.length < 3 && relevantContexts.length >= 3) {
            filteredContexts = relevantContexts.slice(0, 5);
          }

          const topContexts = filteredContexts.slice(0, 10);

          if (topContexts.length > 0) {
            console.log(`[RAG WebSocket] Found ${topContexts.length} contexts (threshold: ${dynamicThreshold.toFixed(2)}):`,
              topContexts.map(c => `${c.similarity.toFixed(3)} (${c.conversationName}) [${c.matchType}]`).join(', '));
          }

          return topContexts;
        });

        // Wait for RAG search to complete
        let topContexts: SearchResult[] = [];

        try {
          const ragStartTime = Date.now();
          topContexts = await ragSearchPromise;
          const ragDuration = Date.now() - ragStartTime;

          if (topContexts.length > 0) {
            console.log(`[RAG WebSocket] Completed in ${ragDuration}ms with ${topContexts.length} contexts`);
            safeSend({ type: "context", sources: topContexts });
          } else {
            console.log(`[RAG WebSocket] Completed in ${ragDuration}ms with no contexts`);
          }
        } catch (error) {
          console.error("[RAG WebSocket] Search failed:", error);
          topContexts = [];
        }

        const wsMarkdownInstructions = `

FORMAT INSTRUCTIONS:
- Always format responses using Markdown for better readability
- Use headers (## or ###) to organize sections  
- Use bullet points (-) or numbered lists (1. 2. 3.) for multiple items
- Use **bold** for emphasis on important terms
- Use \`code\` for technical terms, commands, or code snippets
- Use code blocks with language specification for multi-line code
- Use > for quotes or important callouts
- Break long responses into clear sections with headers
- Keep paragraphs concise and well-spaced
`;
        let systemPrompt = (conversation.instructions || "You are a helpful AI assistant.") + wsMarkdownInstructions;

        // Add tagged text file contents to system prompt
        if (taggedTextFiles.length > 0) {
          const fileInfo = taggedTextFiles
            .map((f: { name: string; content: string; mimeType: string }, idx: number) => `[File ${idx + 1}: ${f.name}]\n${f.content}`)
            .join("\n\n---\n\n");
          systemPrompt += `\n\n===ATTACHED FILE CONTENTS (HIGHEST PRIORITY)===\nThe user has explicitly tagged the following file(s) for analysis. These are the PRIMARY source of information.\n\n${fileInfo}\n\n===CRITICAL INSTRUCTIONS FOR TAGGED FILES===\n1. TAGGED FILES HAVE THE HIGHEST PRIORITY - use them as the primary source for answers\n2. You have complete access to the file contents above\n3. When answering questions, ALWAYS check tagged file contents FIRST before using any other context\n4. Analyze, summarize, or answer questions about these files directly\n5. Reference specific parts of the files when relevant\n6. Never say you cannot access or read the files - their full content is provided above\n7. If information exists in tagged files, use it instead of RAG context or general knowledge`;
        }

        // Add tagged conversation contents to system prompt
        if (taggedConversations.length > 0) {
          const convInfo = taggedConversations
            .map((c: { name: string; content: string }, idx: number) => `${c.content}`)
            .join("\n\n===\n\n");
          systemPrompt += `\n\n===REFERENCED CONVERSATION CONTENTS (HIGH PRIORITY)===\nThe user has explicitly tagged the following conversation(s) for reference. These are PRIMARY context sources.\n\n${convInfo}\n\n===CRITICAL INSTRUCTIONS FOR TAGGED CONVERSATIONS===\n1. TAGGED CONVERSATIONS HAVE HIGH PRIORITY - treat them as explicitly requested context\n2. You have complete access to the conversation history above\n3. Use this context to understand what was previously discussed\n4. Answer questions about the conversation content directly\n5. You can summarize, explain, or build upon the previous discussions\n6. Reference specific parts of the conversations when relevant\n7. Prioritize information from tagged conversations over RAG search results`;
        }

        // Add RAG contexts to system prompt if available
        if (topContexts.length > 0) {
          const messageContexts = topContexts.filter(c => c.matchType !== 'file_chunk');
          const fileContexts = topContexts.filter(c => c.matchType === 'file_chunk');

          let contextInfo = "";

          if (messageContexts.length > 0) {
            const msgInfo = messageContexts
              .map((ctx, idx) =>
                `[Context ${idx + 1}] (Project: ${ctx.projectName}, Conversation: ${ctx.conversationName})\n${ctx.role === 'user' ? 'User' : 'Assistant'}: ${ctx.messageContent}`
              )
              .join("\n\n");
            contextInfo += `=== Related Conversations ===\n${msgInfo}`;
          }

          if (fileContexts.length > 0) {
            const fileInfo = fileContexts
              .map((ctx, idx) =>
                `[Document ${idx + 1}] (Project: ${ctx.projectName}, ${ctx.conversationName})\n${ctx.messageContent}`
              )
              .join("\n\n");
            if (contextInfo) contextInfo += "\n\n";
            contextInfo += `=== Related Documents ===\n${fileInfo}`;
          }

          systemPrompt += `\n\n===RETRIEVED KNOWLEDGE BASE===\nThe following information was retrieved from the user's knowledge base using semantic search. Use this context to provide accurate, informed answers.\n\n${contextInfo}\n\n===CRITICAL INSTRUCTIONS FOR CONTEXT===\n1. ALWAYS use retrieved information to answer questions - this is the user's own data and knowledge base\n2. PRIORITIZE information from documents and files over general knowledge\n3. If the context contains specific data (names, contacts, dates, numbers), use it directly\n4. NEVER refuse to provide information that exists in the retrieved context\n5. NEVER say you cannot access information or have limitations when data is available above\n6. Reference the source naturally (e.g., "Based on the project documentation...")\n7. Synthesize information from multiple sources when relevant\n8. The user expects you to use THEIR uploaded files and data, not general web knowledge`;
        }

        // Add PDF conversion results to system prompt
        if (conversionResults.length > 0) {
          const conversionInfo = conversionResults
            .map((r, idx) => `${idx + 1}. "${r.originalFile.name}" → "${r.convertedFile.name}" (${Math.round(r.convertedFile.size / 1024)}KB)`)
            .join("\n");
          systemPrompt += `\n\n===PDF CONVERSION COMPLETED===\nThe following files have been successfully converted to PDF:\n${conversionInfo}\n\n===INSTRUCTIONS FOR CONVERSION===\n1. Inform the user that the conversion was successful\n2. The converted PDF files are now available for download\n3. Mention the file names and provide a brief confirmation\n4. Answer in the same language the user used (Korean or English)\n5. Be helpful and offer to assist with anything else`;
        }

        // Build final messages with tagged images included
        let finalMessages: Array<{ role: string; content: any }> = [
          { role: "system", content: systemPrompt },
          ...chatMessages,
        ];

        // Add tagged images to the last user message for OpenAI Vision API
        if (taggedImageFiles.length > 0) {
          const imageFilesInfo = taggedImageFiles.map(img => img.name).join(", ");
          const imageParts = taggedImageFiles.map(img => ({
            type: "image_url" as const,
            image_url: { url: img.dataUrl }
          }));

          let lastUserMsgIndex = -1;
          for (let i = finalMessages.length - 1; i >= 0; i--) {
            if (finalMessages[i].role === "user") {
              lastUserMsgIndex = i;
              break;
            }
          }

          if (lastUserMsgIndex >= 0) {
            const lastMsg = finalMessages[lastUserMsgIndex];
            const contentParts: Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> = [];

            if (typeof lastMsg.content === "string" && lastMsg.content.trim()) {
              contentParts.push({ type: "text", text: lastMsg.content });
            } else if (Array.isArray(lastMsg.content)) {
              for (const part of lastMsg.content) {
                contentParts.push(part);
              }
            }

            contentParts.push({ type: "text", text: `\n[Analyzing tagged images: ${imageFilesInfo}]` });
            contentParts.push(...imageParts);

            console.log(`[Tagged Images] Injecting ${imageParts.length} images into message at index ${lastUserMsgIndex}`);

            finalMessages[lastUserMsgIndex] = {
              role: "user",
              content: contentParts
            };
          } else {
            console.log(`[Tagged Images] No user message found, creating new message with ${imageParts.length} images`);
            finalMessages.push({
              role: "user",
              content: [
                { type: "text", text: `[Analyzing tagged images: ${imageFilesInfo}]` },
                ...imageParts
              ]
            });
          }
        }

        // Start streaming AI response immediately
        let fullResponse = "";

        for await (const chunk of generateChatCompletionStream(finalMessages)) {
          fullResponse += chunk;
          safeSend({ type: "content", content: chunk });
        }

        const aiMessage = await storage.createMessage({
          conversationId,
          role: "assistant",
          content: fullResponse,
        }, userId);

        // Generate AI embedding in background - don't wait for it
        generateEmbedding(fullResponse)
          .then(async (aiEmbedding) => {
            try {
              await storage.updateMessageEmbedding(aiMessage.id, userId, JSON.stringify(aiEmbedding), aiEmbedding);
            } catch (storageError) {
              console.error("Failed to store AI message embedding:", storageError);
              safeSend({
                type: "error",
                error: "Failed to save AI response embedding. RAG search may not include this response."
              });
            }
          })
          .catch((embeddingError: any) => {
            console.error("Failed to generate embedding for AI response:", embeddingError);
            if (embeddingError.code === 'insufficient_quota') {
              safeSend({
                type: "error",
                error: "OpenAI API quota exceeded while processing response. RAG search unavailable."
              });
            } else {
              safeSend({
                type: "error",
                error: "Failed to generate AI response embedding. RAG search may not include this response."
              });
            }
          });

        safeSend({ type: "done", messageId: aiMessage.id });
      } catch (error) {
        console.error("WebSocket chat error:", error);
        safeSend({ type: "error", error: "Failed to process chat message" });
      }
    });

    ws.on("close", () => {
      // Connection closed
    });
  });

  return httpServer;
}
