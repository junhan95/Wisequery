import { Router } from "express";
import { isAuthenticated } from "../sessionAuth";
import { storage } from "../storage";
import { z } from "zod";
import path from "path";
import { randomUUID } from "crypto";
import { promises as fs, createReadStream } from "fs";
import multer from "multer";
import { generateEmbedding } from "../openai";
import { chunkingQueue } from "../chunkingQueue";
import { supabaseStorageService, SupabaseStorageNotFoundError } from "../supabaseStorage";
import {
    decodeFilename,
    isObjectStoragePath,
    isDocumentFile,
    extractDocumentContent,
    extractDocumentContentFromBuffer,
    getFileBufferFromStorage,
    processFileWithChunking,
    isConvertibleToPdf,
    convertToPdf,
} from "../utils/fileProcessing";
import { upload } from "../utils/uploadConfig";

const router = Router();

// Get files by conversation
router.get("/conversations/:conversationId/files", isAuthenticated, async (req, res) => {
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

// Upload file to conversation
router.post("/conversations/:conversationId/files", isAuthenticated, upload.single("file"), async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { conversationId } = req.params;

        if (!req.file) {
            res.status(400).json({ error: "No file uploaded" });
            return;
        }

        const conversation = await storage.getConversation(conversationId, userId);
        if (!conversation) {
            await fs.unlink(req.file.path);
            res.status(404).json({ error: "Conversation not found" });
            return;
        }

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
            content = await extractDocumentContent(req.file.path, mimeType, originalName);
        }

        let storagePath: string;
        let useLocalStorage = false;
        try {
            const fileBuffer = await fs.readFile(req.file.path);
            storagePath = await supabaseStorageService.uploadBuffer(fileBuffer, originalName, mimeType);
            try { await fs.unlink(req.file.path); } catch { }
        } catch (storageError) {
            console.error("Failed to upload to Object Storage, using local storage:", storageError);
            storagePath = req.file.filename;
            useLocalStorage = true;
        }

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

        if (content) {
            chunkingQueue.addJob(fileRecord.id, userId);
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
            try { await fs.unlink(req.file.path); } catch { }
        }
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.errors });
        } else {
            console.error("File upload error:", error);
            res.status(500).json({ error: "Failed to upload file" });
        }
    }
});

// Download file
router.get("/files/:id/download", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { id } = req.params;

        const file = await storage.getFileById(id, userId);
        if (!file) {
            res.status(404).json({ error: "File not found" });
            return;
        }

        res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.originalName)}"`);

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

        const filePath = path.join(process.cwd(), "uploads", file.filename);
        try { await fs.access(filePath); } catch {
            res.status(404).json({ error: "File not found. Please re-upload the file." });
            return;
        }

        const fileStream = createReadStream(filePath);
        fileStream.pipe(res);
    } catch (error) {
        console.error("File download error:", error);
        res.status(500).json({ error: "Failed to download file" });
    }
});

// View file inline
router.get("/files/:id/view", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { id } = req.params;

        const file = await storage.getFileById(id, userId);
        if (!file) {
            res.status(404).json({ error: "File not found" });
            return;
        }

        res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
        res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.originalName)}"`);

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

        const filePath = path.join(process.cwd(), "uploads", file.filename);
        try { await fs.access(filePath); } catch {
            res.status(404).json({ error: "File not found. Please re-upload the file." });
            return;
        }

        const fileStream = createReadStream(filePath);
        fileStream.pipe(res);
    } catch (error) {
        console.error("File view error:", error);
        res.status(500).json({ error: "Failed to view file" });
    }
});

// Get file content as text
router.get("/files/:id/content", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { id } = req.params;

        const file = await storage.getFileById(id, userId);
        if (!file) {
            res.status(404).json({ error: "File not found" });
            return;
        }

        let content: string;

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
            const filePath = path.join(process.cwd(), "uploads", file.filename);
            try { await fs.access(filePath); } catch {
                res.status(404).json({ error: "File not found. Please re-upload the file." });
                return;
            }
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

// Update file content
router.put("/files/:id/content", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { id } = req.params;
        const { content } = req.body;

        if (typeof content !== "string") {
            res.status(400).json({ error: "Content must be a string" });
            return;
        }

        const file = await storage.getFileById(id, userId);
        if (!file) {
            res.status(404).json({ error: "File not found" });
            return;
        }

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

        if (isObjectStoragePath(file.filename)) {
            try {
                const contentBuffer = Buffer.from(content, "utf-8");
                const newStoragePath = await supabaseStorageService.uploadBuffer(
                    contentBuffer, file.originalName, file.mimeType
                );
                await supabaseStorageService.deleteObject(file.filename);
                await storage.updateFile(id, userId, { filename: newStoragePath, content, size: newSize });
            } catch (error) {
                console.error("Failed to update file in Object Storage:", error);
                res.status(500).json({ error: "Failed to update file in storage" });
                return;
            }
        } else {
            const filePath = path.join(process.cwd(), "uploads", file.filename);
            try { await fs.access(filePath); } catch {
                res.status(404).json({ error: "File not found. Please re-upload the file." });
                return;
            }
            await fs.writeFile(filePath, content, "utf-8");
            await storage.updateFileContent(id, userId, content, newSize);
        }

        try {
            await storage.updateFileChunkingStatus(id, userId, "pending");
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

// Delete file (soft delete)
router.delete("/files/:id", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { id } = req.params;

        const file = await storage.getFileById(id, userId);
        if (!file) {
            res.status(404).json({ error: "File not found" });
            return;
        }

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

// Duplicate file
router.post("/files/:id/duplicate", isAuthenticated, async (req, res) => {
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

        const projectId = targetProjectId || sourceFile.projectId;
        if (targetProjectId && targetProjectId !== sourceFile.projectId) {
            const project = await storage.getProject(targetProjectId, userId);
            if (!project) {
                res.status(404).json({ error: "Target project not found" });
                return;
            }
        }

        if (targetFolderId) {
            const folder = await storage.getFolder(targetFolderId, userId);
            if (!folder) {
                res.status(404).json({ error: "Target folder not found" });
                return;
            }
            if (folder.projectId !== projectId) {
                res.status(400).json({ error: "Folder must be in the target project" });
                return;
            }
        }

        const sourceFilePath = path.join(process.cwd(), "uploads", sourceFile.filename);
        try { await fs.access(sourceFilePath); } catch {
            res.status(404).json({ error: "Source file not found on disk" });
            return;
        }

        const ext = path.extname(sourceFile.filename);
        const newFilename = `${randomUUID()}${ext}`;
        const newFilePath = path.join(process.cwd(), "uploads", newFilename);
        await fs.copyFile(sourceFilePath, newFilePath);

        const duplicatedFile = await storage.createFile({
            projectId,
            folderId: targetFolderId ?? null,
            conversationId: null,
            filename: newFilename,
            originalName: sourceFile.originalName,
            mimeType: sourceFile.mimeType,
            size: sourceFile.size,
        }, userId);

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

// Re-chunk file
router.post("/files/:id/rechunk", isAuthenticated, async (req, res) => {
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

        if (!content) {
            const ext = path.extname(file.originalName).toLowerCase();
            const fileBuffer = await getFileBufferFromStorage(file.filename);
            if (fileBuffer) {
                if (isDocumentFile(file.mimeType, ext)) {
                    content = await extractDocumentContentFromBuffer(fileBuffer, file.mimeType, file.originalName);
                } else if (file.mimeType.startsWith("text/") ||
                    file.mimeType === "application/json" ||
                    file.mimeType === "application/javascript") {
                    content = fileBuffer.toString("utf-8");
                }
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

// Batch rechunk project files
router.post("/projects/:projectId/rechunk-files", isAuthenticated, async (req, res) => {
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
        const eligibleFiles = files.filter(f => f.chunkingStatus !== 'completed');

        console.log(`[Rechunk] Starting batch rechunk for ${eligibleFiles.length} files in project ${project.name}`);

        let processed = 0;
        let skippedNoContent = 0;
        let failed = 0;
        const results: Array<{ fileId: string; name: string; status: 'success' | 'failed' | 'skipped' }> = [];

        for (const file of eligibleFiles) {
            let content = file.content;

            if (!content) {
                const ext = path.extname(file.originalName).toLowerCase();
                const fileBuffer = await getFileBufferFromStorage(file.filename);
                if (fileBuffer) {
                    if (isDocumentFile(file.mimeType, ext)) {
                        content = await extractDocumentContentFromBuffer(fileBuffer, file.mimeType, file.originalName);
                    } else if (file.mimeType.startsWith("text/") ||
                        file.mimeType === "application/json" ||
                        file.mimeType === "application/javascript") {
                        content = fileBuffer.toString("utf-8");
                    }
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

// Batch chunk files
router.post("/files/batch-chunk", isAuthenticated, async (req, res) => {
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

// Get chunking status
router.get("/files/:id/chunking-status", isAuthenticated, async (req, res) => {
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
router.get("/chunking/queue-status", isAuthenticated, async (req, res) => {
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

// Convert to PDF
router.post("/files/:id/convert-to-pdf", isAuthenticated, async (req, res) => {
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
        try { await fs.access(inputPath); } catch {
            res.status(404).json({ error: "Source file not found on disk" });
            return;
        }

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

        console.log(`[PDF Conversion] Created PDF file record: ${pdfFile.id} (${pdfOriginalName})`);

        res.json({
            success: true,
            originalFile: { id: file.id, name: file.originalName },
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

// Get project files
router.get("/projects/:projectId/files", isAuthenticated, async (req, res) => {
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

// Upload file to project
router.post("/projects/:projectId/files", isAuthenticated, upload.single("file"), async (req, res) => {
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
            content = await extractDocumentContent(req.file.path, mimeType, originalName);
        }

        let storagePath: string;
        let useLocalStorage = false;
        try {
            const fileBuffer = await fs.readFile(req.file.path);
            storagePath = await supabaseStorageService.uploadBuffer(fileBuffer, originalName, mimeType);
            try { await fs.unlink(req.file.path); } catch { }
        } catch (storageError) {
            console.error("Failed to upload to Object Storage, using local storage:", storageError);
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

        if (content) {
            chunkingQueue.addJob(fileRecord.id, userId);
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
            try { await fs.unlink(req.file.path); } catch { }
        }
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.errors });
        } else {
            console.error("File upload error:", error);
            res.status(500).json({ error: "Failed to upload file" });
        }
    }
});

// Update file metadata
router.patch("/files/:id", isAuthenticated, async (req, res) => {
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
                if (folder.projectId !== file.projectId) {
                    updateData.projectId = folder.projectId;
                }
            } else if (targetProjectId && targetProjectId !== file.projectId) {
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

// Restore file from archive
router.post("/files/:id/restore", isAuthenticated, async (req, res) => {
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

export default router;
