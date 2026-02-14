import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { generateChatCompletionStream, generateEmbedding, cosineSimilarity, rewriteQueryForSearch, calculateRRFScore } from "./openai";
import {
  insertProjectSchema,
  insertFolderSchema,
  insertConversationSchema,
  insertMessageSchema,
  insertFileSchema,
  type SearchResult,
  type Message,
} from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { promises as fs, createReadStream } from "fs";
import { setupAuth, isAuthenticated, getSession } from "./sessionAuth";
import { setupSocialAuth } from "./socialAuth";
import type { IncomingMessage } from "http";
import {
  stripe,
  getOrCreateStripeCustomer,
  createCheckoutSession,
  createCustomerPortalSession,
  constructWebhookEvent,
  PLAN_LIMITS,
} from "./stripe";
import { chunkText, type ChunkResult } from "./chunking";
import { filterChunksByAttributes, validateFilter, type AttributeFilter } from "./filterParser";
import { chunkingQueue } from "./chunkingQueue";
import { expirationScheduler, DEFAULT_RETENTION_POLICIES } from "./scheduler";
import { supabaseStorageService, SupabaseStorageNotFoundError, isCloudStoragePath } from "./supabaseStorage";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Helper function to decode filenames with non-ASCII characters (Korean, etc.)
function decodeFilename(filename: string): string {
  try {
    // Try to decode as UTF-8 if it was incorrectly interpreted as Latin-1
    const decoded = Buffer.from(filename, 'latin1').toString('utf-8');
    // Check if decoding produced valid UTF-8 (no replacement characters)
    if (!decoded.includes('\ufffd') && decoded !== filename) {
      return decoded;
    }
  } catch {
    // If decoding fails, return original
  }
  return filename;
}

// Check if filename is a cloud storage path (Supabase or legacy Object Storage)
function isObjectStoragePath(filename: string): boolean {
  return isCloudStoragePath(filename);
}

// Document content extraction from buffer for PDF, Word, Excel, PowerPoint files
async function extractDocumentContentFromBuffer(buffer: Buffer, mimeType: string, originalName: string): Promise<string | null> {
  try {
    const ext = path.extname(originalName).toLowerCase();

    // PDF files
    if (mimeType === 'application/pdf' || ext === '.pdf') {
      console.log(`[Document Extract] Parsing PDF: ${originalName}`);
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      const text = result.text?.trim();
      if (text && text.length > 0) {
        console.log(`[Document Extract] PDF extracted: ${text.length} chars`);
        return text;
      }
      return null;
    }

    // Word documents (.docx)
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx') {
      console.log(`[Document Extract] Parsing Word document: ${originalName}`);
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value?.trim();
      if (text && text.length > 0) {
        console.log(`[Document Extract] Word extracted: ${text.length} chars`);
        return text;
      }
      return null;
    }

    // Legacy Word documents (.doc)
    if (mimeType === 'application/msword' || ext === '.doc') {
      console.log(`[Document Extract] Legacy Word format not supported: ${originalName}`);
      return `[Legacy .doc format - please convert to .docx for full content extraction]`;
    }

    // Excel files (.xlsx, .xls)
    if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel' ||
      ext === '.xlsx' || ext === '.xls') {
      console.log(`[Document Extract] Parsing Excel file: ${originalName}`);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheets: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        if (csv && csv.trim().length > 0) {
          sheets.push(`=== Sheet: ${sheetName} ===\n${csv}`);
        }
      }

      if (sheets.length > 0) {
        const text = sheets.join('\n\n');
        console.log(`[Document Extract] Excel extracted: ${text.length} chars, ${sheets.length} sheets`);
        return text;
      }
      return null;
    }

    // PowerPoint files (.pptx)
    if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || ext === '.pptx') {
      console.log(`[Document Extract] Parsing PowerPoint file: ${originalName}`);
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(buffer);
      const slides: string[] = [];

      const zipEntries = zip.getEntries();
      for (const entry of zipEntries) {
        if (entry.entryName.startsWith('ppt/slides/slide') && entry.entryName.endsWith('.xml')) {
          const content = entry.getData().toString('utf8');
          const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g);
          if (textMatches) {
            const slideTexts = textMatches.map(match => match.replace(/<\/?a:t>/g, '')).filter(t => t.trim());
            if (slideTexts.length > 0) {
              const slideNum = entry.entryName.match(/slide(\d+)\.xml/)?.[1] || '?';
              slides.push(`=== Slide ${slideNum} ===\n${slideTexts.join('\n')}`);
            }
          }
        }
      }

      if (slides.length > 0) {
        const text = slides.join('\n\n');
        console.log(`[Document Extract] PowerPoint extracted: ${text.length} chars, ${slides.length} slides`);
        return text;
      }
      return null;
    }

    console.log(`[Document Extract] Unsupported format: ${mimeType}, ${originalName}`);
    return null;
  } catch (error) {
    console.error(`[Document Extract] Error extracting content from ${originalName}:`, error);
    return null;
  }
}

// Document content extraction for PDF, Word, Excel, PowerPoint files (from file path)
async function extractDocumentContent(filePath: string, mimeType: string, originalName: string): Promise<string | null> {
  try {
    const buffer = await fs.readFile(filePath);
    return extractDocumentContentFromBuffer(buffer, mimeType, originalName);
  } catch (error) {
    console.error(`[Document Extract] Error reading file ${filePath}:`, error);
    return null;
  }
}

// Helper function to get file buffer from storage (Object Storage or local filesystem)
async function getFileBufferFromStorage(filename: string): Promise<Buffer | null> {
  if (isObjectStoragePath(filename)) {
    try {
      const buffer = await supabaseStorageService.getObjectBuffer(filename);
      return buffer;
    } catch (error) {
      console.error(`Failed to read from Object Storage: ${filename}`, error);
      return null;
    }
  } else {
    const filePath = path.join(process.cwd(), "uploads", filename);
    try {
      return await fs.readFile(filePath);
    } catch (error) {
      console.error(`Failed to read from local filesystem: ${filePath}`, error);
      return null;
    }
  }
}

// Check if a file is a document type that can be parsed
function isDocumentFile(mimeType: string | null, ext: string): boolean {
  const documentMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
  ];

  const documentExtensions = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'];

  return (mimeType && documentMimeTypes.includes(mimeType)) || documentExtensions.includes(ext.toLowerCase());
}

// Check if a file can be converted to PDF (Office documents only, not already PDF)
function isConvertibleToPdf(mimeType: string | null, ext: string): boolean {
  const convertibleMimeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
  ];

  const convertibleExtensions = ['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'];

  return (mimeType && convertibleMimeTypes.includes(mimeType)) || convertibleExtensions.includes(ext.toLowerCase());
}

// Convert Office documents to PDF using LibreOffice
async function convertToPdf(inputPath: string, outputDir: string): Promise<string> {
  console.log(`[PDF Conversion] Starting conversion: ${inputPath}`);

  // Create unique temp profile for this conversion to avoid conflicts
  const uniqueId = randomUUID();
  const tempProfileDir = `/tmp/libreoffice_profile_${uniqueId}`;

  try {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(tempProfileDir, { recursive: true });

    // Determine file type for optimal PDF export settings
    const ext = path.extname(inputPath).toLowerCase();
    let pdfExportFilter = 'pdf';

    // Use specific PDF export filters for better quality
    // For Word documents: writer_pdf_Export with embedded fonts
    // For Excel: calc_pdf_Export 
    // For PowerPoint: impress_pdf_Export
    if (['.doc', '.docx'].includes(ext)) {
      pdfExportFilter = 'pdf:writer_pdf_Export';
    } else if (['.xls', '.xlsx'].includes(ext)) {
      pdfExportFilter = 'pdf:calc_pdf_Export';
    } else if (['.ppt', '.pptx'].includes(ext)) {
      pdfExportFilter = 'pdf:impress_pdf_Export';
    }

    // LibreOffice command with:
    // - Unique user profile to prevent conflicts
    // - Specific PDF export filter for better quality
    // - nofirststartwizard to skip setup dialogs
    const command = [
      'soffice',
      '--headless',
      '--nofirststartwizard',
      `"-env:UserInstallation=file://${tempProfileDir}"`,
      `--convert-to "${pdfExportFilter}"`,
      `--outdir "${outputDir}"`,
      `"${inputPath}"`
    ].join(' ');

    console.log(`[PDF Conversion] Running: ${command}`);

    const { stdout, stderr } = await execAsync(command, {
      timeout: 180000, // Increased timeout to 3 minutes
      env: {
        ...process.env,
        HOME: tempProfileDir, // Set HOME to temp profile to ensure font cache works
      }
    });

    if (stderr && !stderr.includes('warn') && !stderr.includes('javaldx')) {
      console.error(`[PDF Conversion] stderr: ${stderr}`);
    }
    if (stdout) {
      console.log(`[PDF Conversion] stdout: ${stdout}`);
    }

    const inputBasename = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(outputDir, `${inputBasename}.pdf`);

    try {
      await fs.access(outputPath);
      console.log(`[PDF Conversion] Success: ${outputPath}`);
      return outputPath;
    } catch {
      throw new Error(`PDF file not created at expected path: ${outputPath}`);
    }
  } catch (error) {
    console.error(`[PDF Conversion] Failed:`, error);
    throw error;
  } finally {
    // Clean up temporary profile directory
    try {
      await fs.rm(tempProfileDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn(`[PDF Conversion] Failed to clean up temp profile: ${cleanupError}`);
    }
  }
}

// Detect if user message is requesting PDF conversion
function detectPdfConversionRequest(message: string): boolean {
  const lowerMessage = message.toLowerCase();

  // Korean patterns
  const koreanPatterns = [
    /pdf\s*(로|로)\s*변환/i,
    /pdf\s*(파일)?\s*(으로|로)\s*(변환|바꿔|만들어)/i,
    /변환\s*(해\s*줘|해줘|해\s*주세요|하세요)/i,
    /(워드|엑셀|파워포인트|ppt|pptx|xlsx|docx|doc|xls)\s*(파일)?\s*(을|를)?\s*pdf/i,
  ];

  // English patterns
  const englishPatterns = [
    /convert\s*(to|into)?\s*pdf/i,
    /make\s*(a|it)?\s*pdf/i,
    /export\s*(as|to)?\s*pdf/i,
    /save\s*(as|to)?\s*pdf/i,
    /transform\s*(to|into)?\s*pdf/i,
    /pdf\s*conversion/i,
    /turn\s*(this|it|the file)?\s*(into|to)\s*pdf/i,
  ];

  // Check Korean patterns
  for (const pattern of koreanPatterns) {
    if (pattern.test(message)) {
      console.log(`[PDF Detection] Korean pattern matched: ${pattern}`);
      return true;
    }
  }

  // Check English patterns
  for (const pattern of englishPatterns) {
    if (pattern.test(lowerMessage)) {
      console.log(`[PDF Detection] English pattern matched: ${pattern}`);
      return true;
    }
  }

  return false;
}

// Process file content with chunking and embedding generation
async function processFileWithChunking(
  fileId: string,
  userId: string,
  content: string,
  originalName: string
): Promise<void> {
  try {
    console.log(`[Chunking] Starting chunking for file ${originalName} (${fileId})`);

    // Update status to processing
    await storage.updateFileChunkingStatus(fileId, userId, 'processing');

    // Delete any existing chunks for this file
    await storage.deleteFileChunks(fileId, userId);

    // Fetch file info for attributes
    const file = await storage.getFileById(fileId, userId);
    let projectName = '';
    let folderName = '';

    if (file) {
      const project = await storage.getProject(file.projectId, userId);
      if (project) projectName = project.name;

      if (file.folderId) {
        const folder = await storage.getFolder(file.folderId, userId);
        if (folder) folderName = folder.name;
      }
    }

    // Extract file extension for fileType
    const fileExt = originalName.split('.').pop()?.toLowerCase() || '';

    // Chunk the document
    const chunks = chunkText(content);

    console.log(`[Chunking] Created ${chunks.length} chunks for file ${originalName}`);

    if (chunks.length === 0) {
      await storage.updateFileChunkingStatus(fileId, userId, 'completed');
      return;
    }

    // Create chunk records with attributes for filtering
    const chunkRecords = await storage.createFileChunks(
      chunks.map((chunk: ChunkResult) => ({
        fileId,
        userId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        metadata: {
          startChar: chunk.metadata.startChar,
          endChar: chunk.metadata.endChar
        },
        attributes: {
          projectId: file?.projectId,
          projectName,
          fileName: originalName,
          fileType: fileExt,
          mimeType: file?.mimeType,
          uploadedAt: file ? Math.floor(new Date(file.createdAt).getTime() / 1000) : Math.floor(Date.now() / 1000),
          folderId: file?.folderId || undefined,
          folderName: folderName || undefined,
        }
      }))
    );

    // Generate embeddings for each chunk in parallel (batch of 5 at a time)
    const BATCH_SIZE = 5;
    for (let i = 0; i < chunkRecords.length; i += BATCH_SIZE) {
      const batch = chunkRecords.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (chunk) => {
          try {
            const embedding = await generateEmbedding(chunk.content);
            await storage.updateFileChunkEmbedding(chunk.id, JSON.stringify(embedding), embedding);
          } catch (error) {
            console.error(`[Chunking] Failed to generate embedding for chunk ${chunk.id}:`, error);
          }
        })
      );
    }

    await storage.updateFileChunkingStatus(fileId, userId, 'completed');
    console.log(`[Chunking] Completed chunking for file ${originalName}: ${chunkRecords.length} chunks with embeddings`);
  } catch (error) {
    console.error(`[Chunking] Failed to process file ${originalName}:`, error);
    await storage.updateFileChunkingStatus(fileId, userId, 'failed');
  }
}

// Multer configuration for file uploads
const uploadStorage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    const uploadDir = path.join(process.cwd(), "uploads");
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, uploadDir);
    }
  },
  filename: (_req, file, cb) => {
    const decodedName = decodeFilename(file.originalname);
    const uniqueFilename = `${randomUUID()}${path.extname(decodedName)}`;
    cb(null, uniqueFilename);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  // Allow all file types
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Authentication (session + passport)
  await setupAuth(app);

  // Setup social OAuth login routes (Google, Naver, Kakao)
  setupSocialAuth(app);

  // Health check endpoint for deployment
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });


  // Auth endpoints - Get current user
  app.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const userInfo = await storage.getUser(userId);
      res.json(userInfo);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user info" });
    }
  });

  // Projects
  app.get("/api/projects", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const projects = await storage.getProjects(userId);
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.post("/api/projects", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;

      const subscription = await storage.getSubscription(userId);
      const plan = (subscription?.plan || "free") as keyof typeof PLAN_LIMITS;
      const planLimit = PLAN_LIMITS[plan]?.projects ?? PLAN_LIMITS.free.projects;

      if (planLimit > 0) {
        const existingProjects = await storage.getProjects(userId);
        if (existingProjects.length >= planLimit) {
          return res.status(403).json({
            error: `Plan limit reached. You can have up to ${planLimit} projects on the ${plan} plan.`,
            limitType: "projects",
            currentPlan: plan,
            limit: planLimit,
            current: existingProjects.length
          });
        }
      }

      const data = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(data, userId);
      res.json(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create project" });
      }
    }
  });

  app.patch("/api/projects/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;
      // Allow updating name and order
      const updateSchema = z.object({
        name: z.string().optional(),
        order: z.number().optional(),
      });
      const data = updateSchema.parse(req.body);
      const project = await storage.updateProject(id, userId, data);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json(project);
    } catch (error) {
      const { id } = req.params;
      console.error(`[PATCH /api/projects/${id}] Error:`, error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update project" });
      }
    }
  });

  app.delete("/api/projects/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;
      const deleted = await storage.deleteProject(id, userId);
      if (!deleted) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // Folders
  app.get("/api/folders", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const folders = await storage.getFolders(userId);
      res.json(folders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch folders" });
    }
  });

  app.get("/api/projects/:projectId/folders", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { projectId } = req.params;
      const folders = await storage.getFoldersByProject(projectId, userId);
      res.json(folders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch folders" });
    }
  });

  app.post("/api/folders", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const data = insertFolderSchema.parse(req.body);
      const folder = await storage.createFolder(data, userId);
      res.json(folder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create folder" });
      }
    }
  });

  app.patch("/api/folders/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;
      const updateSchema = z.object({
        name: z.string().optional(),
        order: z.number().optional(),
        projectId: z.string().optional(),
        parentFolderId: z.string().nullable().optional(),
      });
      const data = updateSchema.parse(req.body);

      // Get the current folder to check if projectId is changing
      const currentFolder = await storage.getFolder(id, userId);
      if (!currentFolder) {
        res.status(404).json({ error: "Folder not found" });
        return;
      }

      // If projectId is changing, collect all affected folder/conversation IDs BEFORE any updates
      let descendantFolderIds: string[] = [];
      let affectedConversationIds: string[] = [];

      if (data.projectId && data.projectId !== currentFolder.projectId) {
        // Get all folders and conversations BEFORE making any changes
        const allFolders = await storage.getFolders(userId);
        const allConversations = await storage.getConversations(userId);

        // Helper function to recursively find all descendant folder IDs
        const findDescendants = (parentId: string, folderList: typeof allFolders): string[] => {
          const descendants: string[] = [];
          const children = folderList.filter(f => f.parentFolderId === parentId);
          for (const child of children) {
            descendants.push(child.id);
            descendants.push(...findDescendants(child.id, folderList));
          }
          return descendants;
        };

        // Get all descendant folder IDs (not including the moved folder itself)
        descendantFolderIds = findDescendants(id, allFolders);

        // Find all conversations in the moved folder and its descendants
        const allAffectedFolderIds = [id, ...descendantFolderIds];
        affectedConversationIds = allConversations
          .filter(conv => conv.folderId && allAffectedFolderIds.includes(conv.folderId))
          .map(conv => conv.id);
      }

      // Now update the main folder
      const folder = await storage.updateFolder(id, userId, data);
      if (!folder) {
        res.status(404).json({ error: "Folder not found" });
        return;
      }

      // If projectId changed, cascade update to descendants
      if (data.projectId && data.projectId !== currentFolder.projectId) {
        const newProjectId = data.projectId;

        // Update all descendant folders' projectId
        for (const descendantId of descendantFolderIds) {
          await storage.updateFolder(descendantId, userId, { projectId: newProjectId });
        }

        // Update all affected conversations' projectId
        for (const convId of affectedConversationIds) {
          await storage.updateConversation(convId, userId, { projectId: newProjectId });
        }
      }

      res.json(folder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update folder" });
      }
    }
  });

  app.delete("/api/folders/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;
      // Soft delete - move to trash
      const deleted = await storage.softDeleteFolder(id, userId);
      if (!deleted) {
        res.status(404).json({ error: "Folder not found" });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete folder" });
    }
  });

  // Conversations
  app.get("/api/conversations", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const conversations = await storage.getConversations(userId);
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.post("/api/conversations", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;

      const subscription = await storage.getSubscription(userId);
      const plan = (subscription?.plan || "free") as keyof typeof PLAN_LIMITS;
      const planLimit = PLAN_LIMITS[plan]?.conversations ?? PLAN_LIMITS.free.conversations;

      if (planLimit > 0) {
        const existingConversations = await storage.getConversations(userId);
        if (existingConversations.length >= planLimit) {
          return res.status(403).json({
            error: `Plan limit reached. You can have up to ${planLimit} conversations on the ${plan} plan.`,
            limitType: "conversations",
            currentPlan: plan,
            limit: planLimit,
            current: existingConversations.length
          });
        }
      }

      const data = insertConversationSchema.parse(req.body);
      const conversation = await storage.createConversation(data, userId);
      res.json(conversation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create conversation" });
      }
    }
  });

  app.patch("/api/conversations/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;
      const data = insertConversationSchema.partial().parse(req.body);
      const conversation = await storage.updateConversation(id, userId, data);
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      res.json(conversation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update conversation" });
      }
    }
  });

  app.delete("/api/conversations/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;
      // Soft delete - move to trash
      const deleted = await storage.softDeleteConversation(id, userId);
      if (!deleted) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Files
  app.get("/api/conversations/:conversationId/files", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { conversationId } = req.params;
      const files = await storage.getFilesByConversation(conversationId, userId);
      res.json(files);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  app.post("/api/conversations/:conversationId/files", isAuthenticated, upload.single("file"), async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { conversationId } = req.params;

      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      // Verify conversation exists and belongs to user
      const conversation = await storage.getConversation(conversationId, userId);
      if (!conversation) {
        // Clean up uploaded file
        await fs.unlink(req.file.path);
        res.status(404).json({ error: "Conversation not found" });
        return;
      }

      // Extract text content from file
      let content: string | null = null;
      const mimeType = req.file.mimetype;
      const originalName = decodeFilename(req.file.originalname);
      const ext = path.extname(originalName).toLowerCase();

      const isTextFile =
        mimeType.startsWith("text/") ||
        mimeType === "application/json" ||
        mimeType === "application/x-javascript" ||
        mimeType === "application/javascript";

      if (isTextFile) {
        try {
          const fileContent = await fs.readFile(req.file.path, "utf-8");
          content = fileContent.trim();
        } catch (error) {
          console.error("Failed to read file content:", error);
        }
      } else if (isDocumentFile(mimeType, ext)) {
        // Extract content from PDF, Word, Excel, PowerPoint
        content = await extractDocumentContent(req.file.path, mimeType, originalName);
      }

      // Upload file to Object Storage for persistence across deploys
      let storagePath: string;
      let useLocalStorage = false;
      try {
        const fileBuffer = await fs.readFile(req.file.path);
        storagePath = await supabaseStorageService.uploadBuffer(fileBuffer, originalName, mimeType);
        // Clean up local temp file only if Object Storage upload succeeded
        try {
          await fs.unlink(req.file.path);
        } catch { }
      } catch (storageError) {
        console.error("Failed to upload to Object Storage, using local storage:", storageError);
        // Fallback to local storage if Object Storage fails - keep the file in uploads folder
        storagePath = req.file.filename;
        useLocalStorage = true;
      }

      // Create file record with Object Storage path (or local filename as fallback)
      const fileRecord = await storage.createFile({
        projectId: conversation.projectId,
        folderId: conversation.folderId,
        conversationId,
        filename: storagePath,
        originalName,
        mimeType: req.file.mimetype,
        size: req.file.size,
        content,
        chunkingStatus: content ? 'pending' : null,
      }, userId);

      // Add to background chunking queue if we have content
      if (content) {
        chunkingQueue.addJob(fileRecord.id, userId);

        // Also generate legacy file-level embedding for backward compatibility (in background)
        generateEmbedding(content)
          .then(async (embedding) => {
            await storage.updateFileEmbedding(fileRecord.id, userId, JSON.stringify(embedding), embedding);
          })
          .catch((error) => {
            console.error(`Failed to generate embedding for file ${fileRecord.id}:`, error);
          });
      }

      // Return file record with download URL
      res.json({
        ...fileRecord,
        url: `/api/files/${fileRecord.id}/download`,
        chunkingQueued: !!content,
      });
    } catch (error) {
      // Clean up uploaded file if it exists
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch { }
      }
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        console.error("File upload error:", error);
        res.status(500).json({ error: "Failed to upload file" });
      }
    }
  });

  app.get("/api/files/:id/download", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;

      // Get file with ownership verification
      const file = await storage.getFileById(id, userId);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      // Set headers for file download
      res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.originalName)}"`);

      // Check if file is in Object Storage
      if (isObjectStoragePath(file.filename)) {
        try {
          await supabaseStorageService.downloadObject(file.filename, res, 0);
          return;
        } catch (error) {
          if (error instanceof SupabaseStorageNotFoundError) {
            res.status(404).json({ error: "File not found in storage. Please re-upload the file." });
            return;
          }
          throw error;
        }
      }

      // Fallback to local filesystem for old files
      const filePath = path.join(process.cwd(), "uploads", file.filename);

      // Check if file exists on disk
      try {
        await fs.access(filePath);
      } catch {
        res.status(404).json({ error: "File not found. Please re-upload the file." });
        return;
      }

      // Stream the file
      const fileStream = createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error("File download error:", error);
      res.status(500).json({ error: "Failed to download file" });
    }
  });

  // View file inline (for preview)
  app.get("/api/files/:id/view", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;

      // Get file with ownership verification
      const file = await storage.getFileById(id, userId);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      // Set headers for inline view
      res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.originalName)}"`);

      // Check if file is in Object Storage
      if (isObjectStoragePath(file.filename)) {
        try {
          await supabaseStorageService.downloadObject(file.filename, res, 0);
          return;
        } catch (error) {
          if (error instanceof SupabaseStorageNotFoundError) {
            res.status(404).json({ error: "File not found in storage. Please re-upload the file." });
            return;
          }
          throw error;
        }
      }

      // Fallback to local filesystem for old files
      const filePath = path.join(process.cwd(), "uploads", file.filename);

      // Check if file exists on disk
      try {
        await fs.access(filePath);
      } catch {
        res.status(404).json({ error: "File not found. Please re-upload the file." });
        return;
      }

      // Stream the file
      const fileStream = createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error("File view error:", error);
      res.status(500).json({ error: "Failed to view file" });
    }
  });

  // Get file content as text (for code/text preview)
  app.get("/api/files/:id/content", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;

      // Get file with ownership verification
      const file = await storage.getFileById(id, userId);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      let content: string;

      // Check if file is in Object Storage
      if (isObjectStoragePath(file.filename)) {
        try {
          const buffer = await supabaseStorageService.getObjectBuffer(file.filename);
          if (!buffer) {
            res.status(404).json({ error: "File not found in storage. Please re-upload the file." });
            return;
          }
          content = buffer.toString("utf-8");
        } catch (error) {
          if (error instanceof SupabaseStorageNotFoundError) {
            res.status(404).json({ error: "File not found in storage. Please re-upload the file." });
            return;
          }
          throw error;
        }
      } else {
        // Fallback to local filesystem for old files
        const filePath = path.join(process.cwd(), "uploads", file.filename);

        // Check if file exists on disk
        try {
          await fs.access(filePath);
        } catch {
          res.status(404).json({ error: "File not found. Please re-upload the file." });
          return;
        }

        // Read file content
        content = await fs.readFile(filePath, "utf-8");
      }

      res.json({
        id: file.id,
        name: file.originalName,
        mimeType: file.mimeType,
        content,
      });
    } catch (error) {
      console.error("File content error:", error);
      res.status(500).json({ error: "Failed to read file content" });
    }
  });

  // Update file content (for text editor)
  app.put("/api/files/:id/content", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;
      const { content } = req.body;

      if (typeof content !== "string") {
        res.status(400).json({ error: "Content must be a string" });
        return;
      }

      // Get file with ownership verification
      const file = await storage.getFileById(id, userId);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      // Only allow text file editing
      const textMimeTypes = [
        "text/plain", "text/markdown", "text/html", "text/css",
        "text/javascript", "text/csv", "application/json",
        "application/xml", "text/xml"
      ];
      const textExtensions = [
        ".txt", ".md", ".json", ".js", ".ts", ".jsx", ".tsx",
        ".css", ".html", ".xml", ".csv", ".yaml", ".yml", ".env", ".log"
      ];
      const mimeMatch = textMimeTypes.some(t => file.mimeType?.startsWith(t));
      const extMatch = textExtensions.some(ext => file.originalName.toLowerCase().endsWith(ext));

      if (!mimeMatch && !extMatch) {
        res.status(400).json({ error: "Only text files can be edited" });
        return;
      }

      const newSize = Buffer.byteLength(content, "utf-8");

      // Check if file is in Object Storage
      if (isObjectStoragePath(file.filename)) {
        try {
          const contentBuffer = Buffer.from(content, "utf-8");
          const newStoragePath = await supabaseStorageService.uploadBuffer(
            contentBuffer,
            file.originalName,
            file.mimeType
          );

          // Delete old file from Object Storage
          await supabaseStorageService.deleteObject(file.filename);
          // Update file record with new storage path and content
          await storage.updateFile(id, userId, { filename: newStoragePath, content, size: newSize });
        } catch (error) {
          console.error("Failed to update file in Object Storage:", error);
          res.status(500).json({ error: "Failed to update file in storage" });
          return;
        }
      } else {
        // Fallback to local filesystem for old files
        const filePath = path.join(process.cwd(), "uploads", file.filename);

        // Check if file exists on disk
        try {
          await fs.access(filePath);
        } catch {
          res.status(404).json({ error: "File not found. Please re-upload the file." });
          return;
        }

        // Write new content to file
        await fs.writeFile(filePath, content, "utf-8");

        // Update file size and content in database
        await storage.updateFileContent(id, userId, content, newSize);
      }

      // Trigger re-chunking for updated content
      try {
        await storage.updateFileChunkingStatus(id, userId, "pending");
        // The chunking will happen asynchronously via the existing queue system
      } catch (chunkError) {
        console.error("Failed to queue re-chunking:", chunkError);
      }

      res.json({
        success: true,
        id: file.id,
        name: file.originalName,
        size: newSize,
      });
    } catch (error) {
      console.error("File content update error:", error);
      res.status(500).json({ error: "Failed to update file content" });
    }
  });

  app.delete("/api/files/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;

      // Get file with ownership verification
      const file = await storage.getFileById(id, userId);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      // Soft delete - move to trash (keep physical file for restore capability)
      const deleted = await storage.softDeleteFile(id, userId);
      if (!deleted) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      console.error("File deletion error:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  // Duplicate file (for copy-paste functionality)
  app.post("/api/files/:id/duplicate", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;
      const { targetProjectId, targetFolderId } = req.body;

      const sourceFile = await storage.getFileById(id, userId);
      if (!sourceFile) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      // Verify target project if different from source
      const projectId = targetProjectId || sourceFile.projectId;
      if (targetProjectId && targetProjectId !== sourceFile.projectId) {
        const project = await storage.getProject(targetProjectId, userId);
        if (!project) {
          res.status(404).json({ error: "Target project not found" });
          return;
        }
      }

      // Verify target folder if specified
      if (targetFolderId) {
        const folder = await storage.getFolder(targetFolderId, userId);
        if (!folder) {
          res.status(404).json({ error: "Target folder not found" });
          return;
        }
        // Folder must be in the target project
        if (folder.projectId !== projectId) {
          res.status(400).json({ error: "Folder must be in the target project" });
          return;
        }
      }

      // Copy the physical file
      const sourceFilePath = path.join(process.cwd(), "uploads", sourceFile.filename);
      try {
        await fs.access(sourceFilePath);
      } catch {
        res.status(404).json({ error: "Source file not found on disk" });
        return;
      }

      const ext = path.extname(sourceFile.filename);
      const newFilename = `${randomUUID()}${ext}`;
      const newFilePath = path.join(process.cwd(), "uploads", newFilename);

      await fs.copyFile(sourceFilePath, newFilePath);

      // Create new file record
      const duplicatedFile = await storage.createFile({
        projectId,
        folderId: targetFolderId ?? null,
        conversationId: null,
        filename: newFilename,
        originalName: sourceFile.originalName,
        mimeType: sourceFile.mimeType,
        size: sourceFile.size,
      }, userId);

      // Generate embedding for duplicated file asynchronously
      if (sourceFile.mimeType.startsWith("text/") ||
        ["application/json", "application/javascript"].includes(sourceFile.mimeType)) {
        fs.readFile(newFilePath, "utf-8")
          .then(async (content) => {
            const embedding = await generateEmbedding(content.slice(0, 8000));
            if (embedding) {
              await storage.updateFileEmbedding(duplicatedFile.id, userId, JSON.stringify(embedding), embedding);
            }
          })
          .catch((error) => {
            console.error(`Failed to generate embedding for duplicated file ${duplicatedFile.id}:`, error);
          });
      }

      res.json(duplicatedFile);
    } catch (error) {
      console.error("File duplication error:", error);
      res.status(500).json({ error: "Failed to duplicate file" });
    }
  });

  // Re-chunk existing file (for files uploaded before chunking was enabled)
  app.post("/api/files/:id/rechunk", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;

      const file = await storage.getFileById(id, userId);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      let content = file.content;

      // If no content stored, try to re-extract from file
      if (!content) {
        const ext = path.extname(file.originalName).toLowerCase();

        // Get file buffer from storage (Object Storage or local filesystem)
        const fileBuffer = await getFileBufferFromStorage(file.filename);
        if (fileBuffer) {
          if (isDocumentFile(file.mimeType, ext)) {
            content = await extractDocumentContentFromBuffer(fileBuffer, file.mimeType, file.originalName);
          } else if (file.mimeType.startsWith("text/") ||
            file.mimeType === "application/json" ||
            file.mimeType === "application/javascript") {
            content = fileBuffer.toString("utf-8");
          }

          // Update file record with extracted content
          if (content) {
            await storage.updateFile(file.id, userId, { content });
          }
        } else {
          console.error(`Failed to access file ${file.id}: File not found in storage`);
        }
      }

      if (!content) {
        res.status(400).json({ error: "File has no extractable content or file not found in storage" });
        return;
      }

      // Process with chunking and await completion
      try {
        await processFileWithChunking(file.id, userId, content, file.originalName);
        res.json({
          success: true,
          message: "File chunking completed",
          fileId: file.id,
          originalName: file.originalName
        });
      } catch (chunkError) {
        console.error(`Failed to rechunk file ${file.id}:`, chunkError);
        res.status(500).json({
          error: "File chunking failed",
          fileId: file.id,
          originalName: file.originalName
        });
      }
    } catch (error) {
      console.error("File rechunk error:", error);
      res.status(500).json({ error: "Failed to rechunk file" });
    }
  });

  // Batch rechunk all files in a project
  app.post("/api/projects/:projectId/rechunk-files", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { projectId } = req.params;

      const project = await storage.getProject(projectId, userId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const files = await storage.getFilesByProject(projectId, userId);

      // Filter out already completed files and images/binary files
      const eligibleFiles = files.filter(f => f.chunkingStatus !== 'completed');

      console.log(`[Rechunk] Starting batch rechunk for ${eligibleFiles.length} files in project ${project.name}`);

      let processed = 0;
      let skippedNoContent = 0;
      let failed = 0;
      const results: Array<{ fileId: string; name: string; status: 'success' | 'failed' | 'skipped' }> = [];

      for (const file of eligibleFiles) {
        let content = file.content;

        // If no content, try to re-extract from storage
        if (!content) {
          const ext = path.extname(file.originalName).toLowerCase();

          // Get file buffer from storage (Object Storage or local filesystem)
          const fileBuffer = await getFileBufferFromStorage(file.filename);
          if (fileBuffer) {
            if (isDocumentFile(file.mimeType, ext)) {
              content = await extractDocumentContentFromBuffer(fileBuffer, file.mimeType, file.originalName);
            } else if (file.mimeType.startsWith("text/") ||
              file.mimeType === "application/json" ||
              file.mimeType === "application/javascript") {
              content = fileBuffer.toString("utf-8");
            }

            // Update file record with extracted content
            if (content) {
              await storage.updateFile(file.id, userId, { content });
            }
          } else {
            console.error(`[Rechunk] Failed to access file ${file.id}: File not found in storage`);
          }
        }

        if (content) {
          try {
            await processFileWithChunking(file.id, userId, content, file.originalName);
            processed++;
            results.push({ fileId: file.id, name: file.originalName, status: 'success' });
          } catch (error) {
            console.error(`Failed to rechunk file ${file.id}:`, error);
            failed++;
            results.push({ fileId: file.id, name: file.originalName, status: 'failed' });
          }
        } else {
          skippedNoContent++;
          results.push({ fileId: file.id, name: file.originalName, status: 'skipped' });
        }
      }

      res.json({
        success: failed === 0,
        message: `Chunking completed: ${processed} success, ${failed} failed, ${skippedNoContent} skipped`,
        totalFiles: files.length,
        processed,
        failed,
        skippedNoContent,
        alreadyCompleted: files.length - eligibleFiles.length,
        results
      });
    } catch (error) {
      console.error("Batch rechunk error:", error);
      res.status(500).json({ error: "Failed to start batch rechunking" });
    }
  });

  // Async batch chunking - adds files to background queue
  app.post("/api/files/batch-chunk", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { fileIds, priority = 0 } = req.body;

      if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        res.status(400).json({ error: "fileIds array is required" });
        return;
      }

      const validFiles: string[] = [];
      const invalidFiles: string[] = [];

      for (const fileId of fileIds) {
        const file = await storage.getFileById(fileId, userId);
        if (file) {
          validFiles.push(fileId);
          await storage.updateFileChunkingStatus(fileId, userId, 'pending');
        } else {
          invalidFiles.push(fileId);
        }
      }

      if (validFiles.length === 0) {
        res.status(400).json({ error: "No valid files found" });
        return;
      }

      chunkingQueue.addBatch(validFiles, userId, priority);

      const queueStatus = chunkingQueue.getQueueStatus();

      res.json({
        success: true,
        message: `${validFiles.length} files added to chunking queue`,
        queued: validFiles.length,
        invalidFiles: invalidFiles.length > 0 ? invalidFiles : undefined,
        queueStatus: {
          totalInQueue: queueStatus.queueLength,
          activeJobs: queueStatus.activeJobs,
        }
      });
    } catch (error) {
      console.error("Batch chunk error:", error);
      res.status(500).json({ error: "Failed to start batch chunking" });
    }
  });

  // Get chunking status for a file
  app.get("/api/files/:id/chunking-status", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;

      const file = await storage.getFileById(id, userId);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const chunks = await storage.getFileChunks(id, userId);
      const pendingJobs = chunkingQueue.getJobsForUser(userId);
      const isInQueue = pendingJobs.some(job => job.fileId === id);

      res.json({
        fileId: id,
        fileName: file.originalName,
        chunkingStatus: file.chunkingStatus || 'pending',
        chunksCount: chunks.length,
        isInQueue,
        queuePosition: isInQueue ? pendingJobs.findIndex(job => job.fileId === id) + 1 : null,
      });
    } catch (error) {
      console.error("Chunking status error:", error);
      res.status(500).json({ error: "Failed to get chunking status" });
    }
  });

  // Get chunking queue status
  app.get("/api/chunking/queue-status", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;

      const queueStatus = chunkingQueue.getQueueStatus();
      const userJobs = chunkingQueue.getJobsForUser(userId);

      res.json({
        global: queueStatus,
        user: {
          pendingJobs: userJobs.length,
          jobs: userJobs.map(job => ({
            fileId: job.fileId,
            priority: job.priority,
            addedAt: new Date(job.addedAt).toISOString(),
          })),
        }
      });
    } catch (error) {
      console.error("Queue status error:", error);
      res.status(500).json({ error: "Failed to get queue status" });
    }
  });

  // Convert file to PDF (Word, Excel, PowerPoint)
  app.post("/api/files/:id/convert-to-pdf", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;

      const file = await storage.getFileById(id, userId);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const ext = path.extname(file.originalName).toLowerCase();
      if (!isConvertibleToPdf(file.mimeType, ext)) {
        res.status(400).json({
          error: "File type not supported for PDF conversion",
          supportedTypes: ["Word (.doc, .docx)", "Excel (.xls, .xlsx)", "PowerPoint (.ppt, .pptx)"]
        });
        return;
      }

      const inputPath = path.join(process.cwd(), "uploads", file.filename);

      try {
        await fs.access(inputPath);
      } catch {
        res.status(404).json({ error: "Source file not found on disk" });
        return;
      }

      const outputDir = path.join(process.cwd(), "uploads", "converted");
      const pdfPath = await convertToPdf(inputPath, outputDir);

      const pdfFilename = path.basename(pdfPath);
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

      console.log(`[PDF Conversion] Created PDF file record: ${pdfFile.id} (${pdfOriginalName})`);

      res.json({
        success: true,
        originalFile: {
          id: file.id,
          name: file.originalName,
        },
        convertedFile: {
          id: pdfFile.id,
          name: pdfOriginalName,
          size: pdfStats.size,
          downloadUrl: `/api/files/${pdfFile.id}/download`,
        },
      });
    } catch (error) {
      console.error("PDF conversion error:", error);
      res.status(500).json({
        error: "Failed to convert file to PDF",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Project-based file routes
  app.get("/api/projects/:projectId/files", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { projectId } = req.params;

      const project = await storage.getProject(projectId, userId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const files = await storage.getFilesByProject(projectId, userId);
      res.json(files);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  app.post("/api/projects/:projectId/files", isAuthenticated, upload.single("file"), async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { projectId } = req.params;
      const { folderId } = req.body;

      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const project = await storage.getProject(projectId, userId);
      if (!project) {
        await fs.unlink(req.file.path);
        res.status(404).json({ error: "Project not found" });
        return;
      }

      if (folderId) {
        const folder = await storage.getFolder(folderId, userId);
        if (!folder) {
          await fs.unlink(req.file.path);
          res.status(404).json({ error: "Folder not found" });
          return;
        }
      }

      // Extract text content from file
      let content: string | null = null;
      const mimeType = req.file.mimetype;
      const originalName = decodeFilename(req.file.originalname);
      const ext = path.extname(originalName).toLowerCase();

      const isTextFile =
        mimeType.startsWith("text/") ||
        mimeType === "application/json" ||
        mimeType === "application/x-javascript" ||
        mimeType === "application/javascript";

      if (isTextFile) {
        try {
          const fileContent = await fs.readFile(req.file.path, "utf-8");
          content = fileContent.trim();
        } catch (error) {
          console.error("Failed to read file content:", error);
        }
      } else if (isDocumentFile(mimeType, ext)) {
        // Extract content from PDF, Word, Excel, PowerPoint
        content = await extractDocumentContent(req.file.path, mimeType, originalName);
      }

      // Upload file to Object Storage for persistence across deploys
      let storagePath: string;
      let useLocalStorage = false;
      try {
        const fileBuffer = await fs.readFile(req.file.path);
        storagePath = await supabaseStorageService.uploadBuffer(fileBuffer, originalName, mimeType);
        // Clean up local temp file only if Object Storage upload succeeded
        try {
          await fs.unlink(req.file.path);
        } catch { }
      } catch (storageError) {
        console.error("Failed to upload to Object Storage, using local storage:", storageError);
        // Fallback to local storage if Object Storage fails - keep the file in uploads folder
        storagePath = req.file.filename;
        useLocalStorage = true;
      }

      const fileRecord = await storage.createFile({
        projectId,
        folderId: folderId || null,
        conversationId: null,
        filename: storagePath,
        originalName,
        mimeType: req.file.mimetype,
        size: req.file.size,
        content,
        chunkingStatus: content ? 'pending' : null,
      }, userId);

      // Add to background chunking queue if we have content
      if (content) {
        chunkingQueue.addJob(fileRecord.id, userId);

        // Also generate legacy file-level embedding for backward compatibility (in background)
        generateEmbedding(content)
          .then(async (embedding) => {
            await storage.updateFileEmbedding(fileRecord.id, userId, JSON.stringify(embedding), embedding);
          })
          .catch((error) => {
            console.error(`Failed to generate embedding for file ${fileRecord.id}:`, error);
          });
      }

      res.json({
        ...fileRecord,
        url: `/api/files/${fileRecord.id}/download`,
        chunkingQueued: !!content,
      });
    } catch (error) {
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch { }
      }
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        console.error("File upload error:", error);
        res.status(500).json({ error: "Failed to upload file" });
      }
    }
  });

  app.patch("/api/files/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;
      const { originalName, folderId, targetProjectId } = req.body;

      const file = await storage.getFileById(id, userId);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const updateData: { originalName?: string; folderId?: string | null; projectId?: string } = {};

      if (originalName !== undefined) {
        if (typeof originalName !== "string" || originalName.trim().length === 0) {
          res.status(400).json({ error: "Invalid file name" });
          return;
        }
        updateData.originalName = originalName.trim();
      }

      if (folderId !== undefined) {
        if (folderId !== null) {
          const folder = await storage.getFolder(folderId, userId);
          if (!folder) {
            res.status(404).json({ error: "Folder not found" });
            return;
          }
          // If moving to a different project's folder, update projectId as well
          if (folder.projectId !== file.projectId) {
            updateData.projectId = folder.projectId;
          }
        } else if (targetProjectId && targetProjectId !== file.projectId) {
          // Moving to project root of a different project
          const project = await storage.getProject(targetProjectId, userId);
          if (!project) {
            res.status(404).json({ error: "Target project not found" });
            return;
          }
          updateData.projectId = targetProjectId;
        }
        updateData.folderId = folderId;
      }

      if (Object.keys(updateData).length === 0) {
        res.json(file);
        return;
      }

      const updated = await storage.updateFile(id, userId, updateData);
      if (!updated) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      res.json(updated);
    } catch (error) {
      console.error("File update error:", error);
      res.status(500).json({ error: "Failed to update file" });
    }
  });

  // Messages
  app.get("/api/messages/:conversationId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { conversationId } = req.params;
      const messages = await storage.getMessages(conversationId, userId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

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
      // RAG results will be sent as context event, but don't block streaming
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

          // Pre-fetch conversations and projects in batch to avoid N+1
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

  // Image upload configuration (for attachments in messages)
  const uploadDir = path.join(process.cwd(), "uploads");
  await fs.mkdir(uploadDir, { recursive: true });

  const multerStorage = multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      const uniqueName = `${randomUUID()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  });

  const imageUpload = multer({
    storage: multerStorage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
    fileFilter: (_req, file, cb) => {
      const allowedMimes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
        "text/plain",
        "text/csv",
        "application/json",
      ];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Invalid file type"));
      }
    },
  });

  // Image upload endpoint
  app.post("/api/upload", isAuthenticated, imageUpload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const fileInfo = {
        filename: req.file.filename,
        originalName: decodeFilename(req.file.originalname),
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: `/uploads/${req.file.filename}`,
      };

      res.json(fileInfo);
    } catch (error) {
      console.error("File upload error:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  // Serve uploaded files
  app.get("/uploads/:filename", async (req, res) => {
    try {
      const filePath = path.join(uploadDir, req.params.filename);
      res.sendFile(filePath);
    } catch (error) {
      res.status(404).json({ error: "File not found" });
    }
  });

  // Search with optional attribute filtering (OpenAI Vector Store compatible)
  app.post("/api/search", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { query, filter, includeFileChunks = true, maxResults = 10 } = req.body;

      if (!query) {
        res.status(400).json({ error: "Missing query" });
        return;
      }

      // Validate filter if provided
      let attributeFilter: AttributeFilter | undefined;
      if (filter) {
        if (!validateFilter(filter)) {
          res.status(400).json({ error: "Invalid filter format" });
          return;
        }
        attributeFilter = filter as AttributeFilter;
      }

      const allMessages = await storage.getAllMessages(userId);

      // Group messages by conversation for finding pairs
      const messagesByConversation = new Map<string, Message[]>();
      for (const msg of allMessages) {
        if (!messagesByConversation.has(msg.conversationId)) {
          messagesByConversation.set(msg.conversationId, []);
        }
        messagesByConversation.get(msg.conversationId)!.push(msg);
      }

      // Sort messages within each conversation by createdAt
      for (const msgs of Array.from(messagesByConversation.values())) {
        msgs.sort((a: Message, b: Message) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      }

      const exactResults: SearchResult[] = [];
      const semanticResults: SearchResult[] = [];
      const addedMessageIds = new Set<string>();

      // Helper function to create search result
      const createSearchResult = async (
        msg: Message,
        matchType: 'exact' | 'semantic',
        similarity: number
      ): Promise<SearchResult | null> => {
        const conversation = await storage.getConversation(msg.conversationId, userId);
        if (!conversation) return null;

        const project = await storage.getProject(conversation.projectId, userId);
        if (!project) return null;

        // Find paired message (question-answer pair)
        let pairedMessage: { role: string; content: string; createdAt: string } | undefined;
        const conversationMessages = messagesByConversation.get(msg.conversationId) || [];
        const currentIndex = conversationMessages.findIndex(m => m.id === msg.id);

        if (currentIndex !== -1) {
          if (msg.role === "assistant" && currentIndex > 0) {
            // For assistant message, find previous user message
            for (let i = currentIndex - 1; i >= 0; i--) {
              if (conversationMessages[i].role === "user") {
                pairedMessage = {
                  role: conversationMessages[i].role,
                  content: conversationMessages[i].content,
                  createdAt: new Date(conversationMessages[i].createdAt).toISOString(),
                };
                break;
              }
            }
          } else if (msg.role === "user" && currentIndex < conversationMessages.length - 1) {
            // For user message, find next assistant message
            for (let i = currentIndex + 1; i < conversationMessages.length; i++) {
              if (conversationMessages[i].role === "assistant") {
                pairedMessage = {
                  role: conversationMessages[i].role,
                  content: conversationMessages[i].content,
                  createdAt: new Date(conversationMessages[i].createdAt).toISOString(),
                };
                break;
              }
            }
          }
        }

        return {
          messageId: msg.id,
          conversationId: msg.conversationId,
          conversationName: conversation.name,
          projectName: project.name,
          role: msg.role,
          messageContent: msg.content,
          similarity,
          createdAt: new Date(msg.createdAt).toISOString(),
          matchType,
          pairedMessage,
        };
      };

      // Step 1: Find exact text matches (case-insensitive)
      const queryLower = query.toLowerCase();
      for (const msg of allMessages) {
        if (addedMessageIds.has(msg.id)) continue;

        if (msg.content.toLowerCase().includes(queryLower)) {
          const result = await createSearchResult(msg, 'exact', 1.0);
          if (result) {
            exactResults.push(result);
            addedMessageIds.add(msg.id);
          }
        }
      }

      // Step 2: Find semantic matches using embeddings (exclude exact matches)
      const queryEmbedding = await generateEmbedding(query);
      for (const msg of allMessages) {
        if (!msg.embedding || addedMessageIds.has(msg.id)) continue;

        try {
          const msgEmbedding = JSON.parse(msg.embedding);
          const similarity = cosineSimilarity(queryEmbedding, msgEmbedding);

          if (similarity > 0.6) {
            const result = await createSearchResult(msg, 'semantic', similarity);
            if (result) {
              semanticResults.push(result);
              addedMessageIds.add(msg.id);
            }
          }
        } catch (e) {
          continue;
        }
      }

      // Sort semantic results by similarity
      semanticResults.sort((a, b) => b.similarity - a.similarity);

      // Step 3: Search file chunks with attribute filtering
      const fileChunkResults: SearchResult[] = [];
      if (includeFileChunks) {
        const allFileChunks = await storage.getAllFileChunks(userId);

        // Apply attribute filter if provided
        const filteredChunks = attributeFilter
          ? filterChunksByAttributes(allFileChunks, attributeFilter)
          : allFileChunks;

        console.log(`[Search] Searching ${filteredChunks.length} file chunks (${allFileChunks.length} total, filter: ${attributeFilter ? 'yes' : 'no'})`);

        // Cache for file/project lookups
        const fileCache = new Map<string, Awaited<ReturnType<typeof storage.getFileById>>>();
        const projectCache = new Map<string, Awaited<ReturnType<typeof storage.getProject>>>();

        for (const chunk of filteredChunks) {
          if (!chunk.embedding) continue;

          try {
            const chunkEmbedding = JSON.parse(chunk.embedding);
            const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);

            if (similarity > 0.5) {
              // Get file and project info with caching
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
                  fileChunkResults.push({
                    messageId: chunk.id,
                    conversationId: file.conversationId || '',
                    conversationName: `File: ${file.originalName}`,
                    projectName: project.name,
                    role: 'assistant',
                    messageContent: chunk.content,
                    similarity,
                    createdAt: new Date(chunk.createdAt).toISOString(),
                    matchType: 'file_chunk',
                  });
                }
              }
            }
          } catch (e) {
            continue;
          }
        }

        // Sort file chunk results by similarity
        fileChunkResults.sort((a, b) => b.similarity - a.similarity);
      }

      // Combine results: exact matches first, then semantic, then file chunks
      const allResults = [...exactResults, ...semanticResults, ...fileChunkResults.slice(0, 5)];
      res.json(allResults.slice(0, maxResults));
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ error: "Failed to search messages" });
    }
  });

  // Stripe API endpoints
  app.get("/api/subscription", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const subscription = await storage.getSubscription(userId);
      const plan = (subscription?.plan || "free") as keyof typeof PLAN_LIMITS;
      const planLimits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

      const projectCount = (await storage.getProjects(userId)).length;
      const conversationCount = (await storage.getConversations(userId)).length;
      const aiQueryCount = await storage.getAIQueryCount(userId);

      const files = await storage.getFilesByUser(userId);
      const storageUsedBytes = files.reduce((total, file) => total + (file.size || 0), 0);
      const storageUsedGB = storageUsedBytes / (1024 * 1024 * 1024);

      res.json({
        subscription: subscription || { plan: "free", stripeStatus: null },
        usage: {
          projects: projectCount,
          conversations: conversationCount,
          aiQueries: aiQueryCount,
          storageGB: Math.round(storageUsedGB * 100) / 100,
        },
        limits: {
          projects: planLimits.projects,
          conversations: planLimits.conversations,
          aiQueries: planLimits.conversations,
          storageGB: planLimits.storageGB,
          imageGeneration: planLimits.imageGeneration,
        },
      });
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ error: "Failed to fetch subscription" });
    }
  });

  app.post("/api/create-checkout-session", isAuthenticated, async (req, res) => {
    try {
      const authUser = req.user as any;
      const userId = authUser?.claims?.sub;
      const email = authUser?.claims?.email;
      const name = authUser?.claims?.name || `${authUser?.claims?.first_name || ""} ${authUser?.claims?.last_name || ""}`.trim();

      if (!userId || !email) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { plan, period = "monthly" } = req.body;
      if (plan !== "basic" && plan !== "pro") {
        return res.status(400).json({ error: "Invalid plan" });
      }
      if (period !== "monthly" && period !== "yearly") {
        return res.status(400).json({ error: "Invalid billing period" });
      }

      const user = await storage.getUser(userId);
      let stripeCustomerId = user?.stripeCustomerId;

      if (!stripeCustomerId) {
        const customer = await getOrCreateStripeCustomer(userId, email, name);
        stripeCustomerId = customer.id;
        await storage.updateUserStripeCustomerId(userId, stripeCustomerId);
      }

      const session = await createCheckoutSession(
        stripeCustomerId,
        plan,
        period,
        `${req.headers.origin || "http://localhost:5000"}/pricing?success=true`,
        `${req.headers.origin || "http://localhost:5000"}/pricing?canceled=true`
      );

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  app.post("/api/customer-portal", isAuthenticated, async (req, res) => {
    try {
      const authUser = req.user as any;
      const userId = authUser?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) {
        return res.status(400).json({ error: "No Stripe customer found" });
      }

      const session = await createCustomerPortalSession(
        user.stripeCustomerId,
        `${req.headers.origin || "http://localhost:5000"}/pricing`
      );

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating customer portal session:", error);
      res.status(500).json({ error: "Failed to create customer portal session" });
    }
  });

  app.post("/api/webhooks/stripe", async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      return res.status(400).send("Webhook signature or secret missing");
    }

    let event;
    try {
      event = constructWebhookEvent(req.body, sig as string, webhookSecret);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as any;
          const customerId = session.customer;
          const subscriptionId = session.subscription;

          const customers = await stripe.customers.list({ limit: 1, email: session.customer_email });
          if (customers.data.length > 0) {
            const customer = customers.data[0];
            const userId = customer.metadata.userId;

            if (userId && subscriptionId) {
              const subscription = await stripe.subscriptions.retrieve(subscriptionId as string);
              const priceId = subscription.items.data[0]?.price.id;

              let plan = "free";
              if (priceId === process.env.STRIPE_PRO_PRICE_ID) {
                plan = "pro";
              } else if (priceId === process.env.STRIPE_TEAM_PRICE_ID) {
                plan = "team";
              }

              const periodEnd = (subscription as any).current_period_end;

              const existingSub = await storage.getSubscription(userId);
              if (existingSub) {
                await storage.updateSubscription(userId, {
                  plan,
                  stripeSubscriptionId: subscriptionId as string,
                  stripeStatus: subscription.status,
                  stripePriceId: priceId,
                  stripeCurrentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
                });
              } else {
                await storage.createSubscription(
                  {
                    plan,
                    stripeSubscriptionId: subscriptionId as string,
                    stripeStatus: subscription.status,
                    stripePriceId: priceId,
                    stripeCurrentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
                  },
                  userId
                );
              }
            }
          }
          break;
        }

        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const subscription = event.data.object as any;
          const customerId = subscription.customer;

          const customers = await stripe.customers.retrieve(customerId);
          const userId = (customers as any).metadata?.userId;

          if (userId) {
            const existingSub = await storage.getSubscription(userId);
            if (existingSub) {
              if (event.type === "customer.subscription.deleted") {
                await storage.updateSubscription(userId, {
                  plan: "free",
                  stripeStatus: "canceled",
                  stripeSubscriptionId: null,
                  stripePriceId: null,
                  stripeCurrentPeriodEnd: null,
                });
              } else {
                const priceId = subscription.items.data[0]?.price.id;
                let plan = "free";
                if (priceId === process.env.STRIPE_PRO_PRICE_ID) {
                  plan = "pro";
                } else if (priceId === process.env.STRIPE_TEAM_PRICE_ID) {
                  plan = "team";
                }

                const periodEnd = (subscription as any).current_period_end;
                await storage.updateSubscription(userId, {
                  plan,
                  stripeStatus: subscription.status,
                  stripePriceId: priceId,
                  stripeCurrentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
                });
              }
            }
          }
          break;
        }

        default:
          console.log(`Unhandled event type ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Webhook handler error:", error);
      res.status(500).json({ error: "Webhook handler failed" });
    }
  });

  // ========== EXPIRATION POLICY ADMIN ENDPOINTS ==========

  // Get retention policy for a plan
  app.get("/api/admin/retention-policies/:plan", isAuthenticated, async (req, res) => {
    try {
      const { plan } = req.params;
      const policy = await storage.getRetentionPolicy(plan);
      if (policy) {
        res.json(policy);
      } else {
        res.json(DEFAULT_RETENTION_POLICIES[plan] || DEFAULT_RETENTION_POLICIES.free);
      }
    } catch (error) {
      console.error("Error fetching retention policy:", error);
      res.status(500).json({ error: "Failed to fetch retention policy" });
    }
  });

  // Get all retention policies
  app.get("/api/admin/retention-policies", isAuthenticated, async (req, res) => {
    try {
      res.json(DEFAULT_RETENTION_POLICIES);
    } catch (error) {
      console.error("Error fetching retention policies:", error);
      res.status(500).json({ error: "Failed to fetch retention policies" });
    }
  });

  // Get archived conversations for current user
  app.get("/api/archived/conversations", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const archived = await storage.getArchivedConversations(userId);
      res.json(archived);
    } catch (error) {
      console.error("Error fetching archived conversations:", error);
      res.status(500).json({ error: "Failed to fetch archived conversations" });
    }
  });

  // Get archived files for current user
  app.get("/api/archived/files", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const archived = await storage.getArchivedFiles(userId);
      res.json(archived);
    } catch (error) {
      console.error("Error fetching archived files:", error);
      res.status(500).json({ error: "Failed to fetch archived files" });
    }
  });

  // Restore a conversation from archive
  app.post("/api/conversations/:id/restore", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;

      const restored = await storage.restoreConversation(id, userId);
      if (restored) {
        await storage.createAuditEvent({
          userId,
          action: 'restore',
          entityType: 'conversation',
          entityId: id,
        });
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Conversation not found or not archived" });
      }
    } catch (error) {
      console.error("Error restoring conversation:", error);
      res.status(500).json({ error: "Failed to restore conversation" });
    }
  });

  // Restore a file from archive
  app.post("/api/files/:id/restore", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;

      const restored = await storage.restoreFile(id, userId);
      if (restored) {
        await storage.createAuditEvent({
          userId,
          action: 'restore',
          entityType: 'file',
          entityId: id,
        });
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "File not found or not archived" });
      }
    } catch (error) {
      console.error("Error restoring file:", error);
      res.status(500).json({ error: "Failed to restore file" });
    }
  });

  // ============== TRASH (RECYCLE BIN) ROUTES ==============

  // Get all trashed items for current user
  app.get("/api/trash", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const trashItems = await storage.getTrashItems(userId);
      res.json(trashItems);
    } catch (error) {
      console.error("Error fetching trash items:", error);
      res.status(500).json({ error: "Failed to fetch trash items" });
    }
  });

  // Restore file from trash
  app.post("/api/trash/files/:id/restore", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;

      const restored = await storage.restoreFileFromTrash(id, userId);
      if (restored) {
        await storage.createAuditEvent({
          userId,
          action: 'restore',
          entityType: 'file',
          entityId: id,
        });
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "File not found in trash" });
      }
    } catch (error) {
      console.error("Error restoring file from trash:", error);
      res.status(500).json({ error: "Failed to restore file" });
    }
  });

  // Restore folder from trash
  app.post("/api/trash/folders/:id/restore", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;

      const restored = await storage.restoreFolderFromTrash(id, userId);
      if (restored) {
        await storage.createAuditEvent({
          userId,
          action: 'restore',
          entityType: 'folder',
          entityId: id,
        });
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Folder not found in trash" });
      }
    } catch (error) {
      console.error("Error restoring folder from trash:", error);
      res.status(500).json({ error: "Failed to restore folder" });
    }
  });

  // Restore conversation from trash
  app.post("/api/trash/conversations/:id/restore", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;

      const restored = await storage.restoreConversationFromTrash(id, userId);
      if (restored) {
        await storage.createAuditEvent({
          userId,
          action: 'restore',
          entityType: 'conversation',
          entityId: id,
        });
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Conversation not found in trash" });
      }
    } catch (error) {
      console.error("Error restoring conversation from trash:", error);
      res.status(500).json({ error: "Failed to restore conversation" });
    }
  });

  // Permanently delete file from trash
  app.delete("/api/trash/files/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;

      // Get file info to delete physical file
      const trashItems = await storage.getTrashItems(userId);
      const file = trashItems.files.find(f => f.id === id);

      if (!file) {
        res.status(404).json({ error: "File not found in trash" });
        return;
      }

      // Delete file from storage
      if (isObjectStoragePath(file.filename)) {
        // Delete from Object Storage
        try {
          await supabaseStorageService.deleteObject(file.filename);
        } catch (error) {
          console.error(`Failed to delete Object Storage file ${file.filename}:`, error);
        }
      } else {
        // Delete from local filesystem (legacy files)
        const filePath = path.join(process.cwd(), "uploads", file.filename);
        try {
          await fs.unlink(filePath);
        } catch (error) {
          console.error(`Failed to delete physical file ${file.filename}:`, error);
        }
      }

      const deleted = await storage.permanentlyDeleteFile(id, userId);
      if (deleted) {
        await storage.createAuditEvent({
          userId,
          action: 'delete',
          entityType: 'file',
          entityId: id,
        });
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "File not found in trash" });
      }
    } catch (error) {
      console.error("Error permanently deleting file:", error);
      res.status(500).json({ error: "Failed to delete file permanently" });
    }
  });

  // Permanently delete folder from trash
  app.delete("/api/trash/folders/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;

      // Get all files in this folder and subfolders to delete physical files
      const trashItems = await storage.getTrashItems(userId);

      // Helper function to get all folder IDs (including subfolders) recursively
      const getFolderAndSubfolderIds = (folderId: string): string[] => {
        const ids = [folderId];
        for (const folder of trashItems.folders) {
          if (folder.parentFolderId === folderId) {
            ids.push(...getFolderAndSubfolderIds(folder.id));
          }
        }
        return ids;
      };

      const folderIds = getFolderAndSubfolderIds(id);

      // Delete files in all folders from storage
      for (const file of trashItems.files) {
        if (file.folderId && folderIds.includes(file.folderId)) {
          if (isObjectStoragePath(file.filename)) {
            try {
              await supabaseStorageService.deleteObject(file.filename);
            } catch (error) {
              console.error(`Failed to delete Object Storage file ${file.filename}:`, error);
            }
          } else {
            const filePath = path.join(process.cwd(), "uploads", file.filename);
            try {
              await fs.unlink(filePath);
            } catch (error) {
              console.error(`Failed to delete physical file ${file.filename}:`, error);
            }
          }
        }
      }

      const deleted = await storage.permanentlyDeleteFolder(id, userId);
      if (deleted) {
        await storage.createAuditEvent({
          userId,
          action: 'delete',
          entityType: 'folder',
          entityId: id,
        });
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Folder not found in trash" });
      }
    } catch (error) {
      console.error("Error permanently deleting folder:", error);
      res.status(500).json({ error: "Failed to delete folder permanently" });
    }
  });

  // Permanently delete conversation from trash
  app.delete("/api/trash/conversations/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { id } = req.params;

      const deleted = await storage.permanentlyDeleteConversation(id, userId);
      if (deleted) {
        await storage.createAuditEvent({
          userId,
          action: 'delete',
          entityType: 'conversation',
          entityId: id,
        });
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Conversation not found in trash" });
      }
    } catch (error) {
      console.error("Error permanently deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation permanently" });
    }
  });

  // Empty entire trash
  app.post("/api/trash/empty", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;

      // Get all trashed files to delete from storage
      const trashItems = await storage.getTrashItems(userId);

      // Delete files from storage
      for (const file of trashItems.files) {
        if (isObjectStoragePath(file.filename)) {
          try {
            await supabaseStorageService.deleteObject(file.filename);
          } catch (error) {
            console.error(`Failed to delete Object Storage file ${file.filename}:`, error);
          }
        } else {
          const filePath = path.join(process.cwd(), "uploads", file.filename);
          try {
            await fs.unlink(filePath);
          } catch (error) {
            console.error(`Failed to delete physical file ${file.filename}:`, error);
          }
        }
      }

      // Empty trash in database
      const result = await storage.emptyTrash(userId);

      await storage.createAuditEvent({
        userId,
        action: 'delete',
        entityType: 'trash',
        entityId: 'all',
      });

      res.json({
        success: true,
        deleted: result
      });
    } catch (error) {
      console.error("Error emptying trash:", error);
      res.status(500).json({ error: "Failed to empty trash" });
    }
  });

  // Get audit events for current user
  app.get("/api/audit-events", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const limit = parseInt(req.query.limit as string) || 50;
      const events = await storage.getAuditEvents(userId, limit);
      res.json(events);
    } catch (error) {
      console.error("Error fetching audit events:", error);
      res.status(500).json({ error: "Failed to fetch audit events" });
    }
  });

  // Get pending notifications for current user
  app.get("/api/notifications", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const notifications = await storage.getPendingNotifications(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // Manually trigger expiration maintenance (admin only - for testing)
  app.post("/api/admin/run-maintenance", isAuthenticated, async (req, res) => {
    try {
      // Run maintenance asynchronously
      expirationScheduler.runDailyMaintenance();
      res.json({ success: true, message: "Maintenance job started" });
    } catch (error) {
      console.error("Error starting maintenance:", error);
      res.status(500).json({ error: "Failed to start maintenance" });
    }
  });

  // Migrate current user's JSON embeddings to pgvector format
  // Note: This only affects the authenticated user's own data (WHERE user_id = userId)
  // Safe for multi-tenant: each user can only migrate their own embeddings
  app.post("/api/embeddings/migrate", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;

      const pool = new (await import("@neondatabase/serverless")).Pool({
        connectionString: process.env.DATABASE_URL
      });

      let messagesConverted = 0;
      let chunksConverted = 0;
      let filesConverted = 0;

      // Migrate message embeddings
      const messagesResult = await pool.query(`
        UPDATE messages 
        SET embedding_vector = embedding::vector 
        WHERE user_id = $1 
          AND embedding IS NOT NULL 
          AND embedding_vector IS NULL
        RETURNING id
      `, [userId]);
      messagesConverted = messagesResult.rowCount || 0;

      // Migrate file chunk embeddings
      const chunksResult = await pool.query(`
        UPDATE file_chunks 
        SET embedding_vector = embedding::vector 
        WHERE user_id = $1 
          AND embedding IS NOT NULL 
          AND embedding_vector IS NULL
        RETURNING id
      `, [userId]);
      chunksConverted = chunksResult.rowCount || 0;

      // Migrate file embeddings
      const filesResult = await pool.query(`
        UPDATE files 
        SET embedding_vector = embedding::vector 
        WHERE user_id = $1 
          AND embedding IS NOT NULL 
          AND embedding_vector IS NULL
        RETURNING id
      `, [userId]);
      filesConverted = filesResult.rowCount || 0;

      await pool.end();

      console.log(`[Embedding Migration] User ${userId}: ${messagesConverted} messages, ${chunksConverted} chunks, ${filesConverted} files converted`);

      res.json({
        success: true,
        messagesConverted,
        chunksConverted,
        filesConverted,
        message: `Migrated ${messagesConverted} messages, ${chunksConverted} file chunks, ${filesConverted} files to pgvector format`
      });
    } catch (error) {
      console.error("Error migrating embeddings:", error);
      res.status(500).json({ error: "Failed to migrate embeddings" });
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
        const uploadDir = path.join(process.cwd(), "uploads");

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
                // Check if filename exists
                if (!file.filename) {
                  console.error(`[Tagged Files] Image file has no filename: ${tf.originalName}`);
                  return null;
                }

                try {
                  // Get image from storage (Object Storage or local filesystem)
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
                  // Get document from storage (Object Storage or local filesystem)
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
                // Give higher weight to exact word matches (not just substrings)
                const wordBoundaryRegex = new RegExp(`(^|\\s|[^a-zA-Z가-힣])${lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s|[^a-zA-Z가-힣])`, 'i');
                if (wordBoundaryRegex.test(lowerText)) {
                  weightedScore += 1.5; // Full word match bonus
                } else {
                  weightedScore += 0.5; // Partial match
                }
              }
            }

            // Normalize score between 0 and 1
            return Math.min(1, weightedScore / (keywords.length * 1.5));
          };

          // Use pgvector SQL-based semantic search when embedding is available
          if (userEmbedding) {
            console.log(`[RAG WebSocket] Using pgvector SQL-based semantic search`);
            const startTime = Date.now();

            // Parallel pgvector searches for messages and file chunks
            // All tiers receive uniform high-quality search (ef_search=200)
            const [vectorMessages, vectorChunks] = await Promise.all([
              storage.searchMessagesByVector(userId, userEmbedding, 50, conversationId, false, subscriptionTier),
              storage.searchFileChunksByVector(userId, userEmbedding, 30, false, subscriptionTier)
            ]);

            console.log(`[RAG WebSocket] pgvector search completed in ${Date.now() - startTime}ms: ${vectorMessages.length} messages, ${vectorChunks.length} chunks`);

            // Process message results with keyword boost
            const conversationCache = new Map<string, Awaited<ReturnType<typeof storage.getConversation>>>();
            const projectCache = new Map<string, Awaited<ReturnType<typeof storage.getProject>>>();

            for (const msg of vectorMessages) {
              if (msg.similarity < 0.15) continue;

              // Add keyword boost
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

              // Add keyword boost
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

          // Dynamic threshold: lower when results are sparse, higher when abundant
          let dynamicThreshold = 0.1; // Base threshold (lowered for sparse results)
          const highQualityCount = relevantContexts.filter(c => c.similarity > 0.5).length;
          const totalCount = relevantContexts.length;

          if (highQualityCount > 5) {
            dynamicThreshold = 0.25; // Be selective when many good results
          } else if (highQualityCount > 2) {
            dynamicThreshold = 0.15;
          } else if (totalCount < 3) {
            dynamicThreshold = 0.05; // Accept lower quality when results are sparse
          }

          // Filter by dynamic threshold and ensure minimum results
          let filteredContexts = relevantContexts.filter(c => c.similarity >= dynamicThreshold);

          // If too few results, lower threshold to get at least some context
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

        // Wait for RAG search to complete to ensure consistent file-based responses
        // This guarantees that file content is always included in the AI context
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

        // Add RAG contexts to system prompt if available within timeout
        if (topContexts.length > 0) {
          // Group contexts by type for better organization
          const messageContexts = topContexts.filter(c => c.matchType !== 'file_chunk');
          const fileContexts = topContexts.filter(c => c.matchType === 'file_chunk');

          let contextInfo = "";

          // Add message contexts with source info
          if (messageContexts.length > 0) {
            const msgInfo = messageContexts
              .map((ctx, idx) =>
                `[Context ${idx + 1}] (Project: ${ctx.projectName}, Conversation: ${ctx.conversationName})\n${ctx.role === 'user' ? 'User' : 'Assistant'}: ${ctx.messageContent}`
              )
              .join("\n\n");
            contextInfo += `=== Related Conversations ===\n${msgInfo}`;
          }

          // Add file chunk contexts with source info
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

          // Find the last user message index (search backwards from end)
          let lastUserMsgIndex = -1;
          for (let i = finalMessages.length - 1; i >= 0; i--) {
            if (finalMessages[i].role === "user") {
              lastUserMsgIndex = i;
              break;
            }
          }

          if (lastUserMsgIndex >= 0) {
            const lastMsg = finalMessages[lastUserMsgIndex];

            // Build consolidated content array
            const contentParts: Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> = [];

            // Add existing text content first
            if (typeof lastMsg.content === "string" && lastMsg.content.trim()) {
              contentParts.push({ type: "text", text: lastMsg.content });
            } else if (Array.isArray(lastMsg.content)) {
              // Copy existing content parts
              for (const part of lastMsg.content) {
                contentParts.push(part);
              }
            }

            // Add annotation about analyzing tagged images
            contentParts.push({ type: "text", text: `\n[Analyzing tagged images: ${imageFilesInfo}]` });

            // Add image parts
            contentParts.push(...imageParts);

            console.log(`[Tagged Images] Injecting ${imageParts.length} images into message at index ${lastUserMsgIndex}`);

            finalMessages[lastUserMsgIndex] = {
              role: "user",
              content: contentParts
            };
          } else {
            // No user message found - create a new one with just the images
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
