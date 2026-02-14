import path from "path";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { supabaseStorageService, isCloudStoragePath } from "../supabaseStorage";
import { storage } from "../storage";
import { chunkText, type ChunkResult } from "../chunking";
import { generateEmbedding } from "../openai";

const execAsync = promisify(exec);

// Helper function to decode filenames with non-ASCII characters (Korean, etc.)
export function decodeFilename(filename: string): string {
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
export function isObjectStoragePath(filename: string): boolean {
    return isCloudStoragePath(filename);
}

// Document content extraction from buffer for PDF, Word, Excel, PowerPoint files
export async function extractDocumentContentFromBuffer(buffer: Buffer, mimeType: string, originalName: string): Promise<string | null> {
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
export async function extractDocumentContent(filePath: string, mimeType: string, originalName: string): Promise<string | null> {
    try {
        const buffer = await fs.readFile(filePath);
        return extractDocumentContentFromBuffer(buffer, mimeType, originalName);
    } catch (error) {
        console.error(`[Document Extract] Error reading file ${filePath}:`, error);
        return null;
    }
}

// Helper function to get file buffer from storage (Object Storage or local filesystem)
export async function getFileBufferFromStorage(filename: string): Promise<Buffer | null> {
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
export function isDocumentFile(mimeType: string | null, ext: string): boolean {
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
export function isConvertibleToPdf(mimeType: string | null, ext: string): boolean {
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
export async function convertToPdf(inputPath: string, outputDir: string): Promise<string> {
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

        if (['.doc', '.docx'].includes(ext)) {
            pdfExportFilter = 'pdf:writer_pdf_Export';
        } else if (['.xls', '.xlsx'].includes(ext)) {
            pdfExportFilter = 'pdf:calc_pdf_Export';
        } else if (['.ppt', '.pptx'].includes(ext)) {
            pdfExportFilter = 'pdf:impress_pdf_Export';
        }

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
            timeout: 180000,
            env: {
                ...process.env,
                HOME: tempProfileDir,
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
        try {
            await fs.rm(tempProfileDir, { recursive: true, force: true });
        } catch (cleanupError) {
            console.warn(`[PDF Conversion] Failed to clean up temp profile: ${cleanupError}`);
        }
    }
}

// Detect if user message is requesting PDF conversion
export function detectPdfConversionRequest(message: string): boolean {
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

    for (const pattern of koreanPatterns) {
        if (pattern.test(message)) {
            console.log(`[PDF Detection] Korean pattern matched: ${pattern}`);
            return true;
        }
    }

    for (const pattern of englishPatterns) {
        if (pattern.test(lowerMessage)) {
            console.log(`[PDF Detection] English pattern matched: ${pattern}`);
            return true;
        }
    }

    return false;
}

// Process file content with chunking and embedding generation
export async function processFileWithChunking(
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
