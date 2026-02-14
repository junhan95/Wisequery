import { storage } from "./storage";
import { generateEmbedding } from "./openai";
import { chunkText } from "./chunking";
import { promises as fs } from "fs";
import path from "path";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import type { ChunkAttributes } from "@shared/schema";

interface ChunkingJob {
  fileId: string;
  userId: string;
  priority: number;
  addedAt: number;
}

interface ChunkingResult {
  fileId: string;
  success: boolean;
  chunksCreated?: number;
  error?: string;
}

type ChunkingEventCallback = (event: ChunkingEvent) => void;

export interface ChunkingEvent {
  type: 'started' | 'progress' | 'completed' | 'failed';
  fileId: string;
  userId: string;
  data?: {
    chunksCreated?: number;
    totalChunks?: number;
    error?: string;
  };
}

class ChunkingQueue {
  private queue: ChunkingJob[] = [];
  private processing = false;
  private concurrency = 2;
  private activeJobs = 0;
  private eventListeners: Map<string, ChunkingEventCallback[]> = new Map();

  addJob(fileId: string, userId: string, priority: number = 0): void {
    const existingIndex = this.queue.findIndex(j => j.fileId === fileId);
    if (existingIndex !== -1) {
      return;
    }
    
    this.queue.push({
      fileId,
      userId,
      priority,
      addedAt: Date.now(),
    });
    
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.addedAt - b.addedAt;
    });
    
    this.processQueue();
  }

  addBatch(fileIds: string[], userId: string, priority: number = 0): void {
    for (const fileId of fileIds) {
      this.addJob(fileId, userId, priority);
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing && this.activeJobs >= this.concurrency) {
      return;
    }
    
    this.processing = true;
    
    while (this.queue.length > 0 && this.activeJobs < this.concurrency) {
      const job = this.queue.shift();
      if (!job) break;
      
      this.activeJobs++;
      this.processJob(job).finally(() => {
        this.activeJobs--;
        if (this.queue.length > 0) {
          this.processQueue();
        } else if (this.activeJobs === 0) {
          this.processing = false;
        }
      });
    }
  }

  private async processJob(job: ChunkingJob): Promise<ChunkingResult> {
    const { fileId, userId } = job;
    
    try {
      await storage.updateFileChunkingStatus(fileId, userId, 'processing');
      this.emit({ type: 'started', fileId, userId });
      
      const file = await storage.getFileById(fileId, userId);
      if (!file) {
        throw new Error('File not found');
      }
      
      let textContent = file.content;
      
      if (!textContent) {
        textContent = await this.extractContent(file);
        if (textContent) {
          await storage.updateFile(fileId, userId, { content: textContent });
        }
      }
      
      if (!textContent || textContent.trim().length === 0) {
        await storage.updateFileChunkingStatus(fileId, userId, 'completed');
        this.emit({ 
          type: 'completed', 
          fileId, 
          userId, 
          data: { chunksCreated: 0 } 
        });
        return { fileId, success: true, chunksCreated: 0 };
      }
      
      await storage.deleteFileChunks(fileId, userId);
      
      const chunks = chunkText(textContent);
      let chunksCreated = 0;
      
      const project = await storage.getProject(file.projectId, userId);
      const fileExt = path.extname(file.originalName || '').toLowerCase().replace('.', '');
      
      const attributes: ChunkAttributes = {
        projectId: file.projectId,
        projectName: project?.name || 'Unknown',
        fileName: file.originalName || file.filename,
        fileType: fileExt || 'unknown',
        uploadedAt: new Date(file.createdAt).getTime(),
      };
      
      const BATCH_SIZE = 5;
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        
        const embeddingPromises = batch.map(chunk => 
          generateEmbedding(chunk.content).catch(() => null)
        );
        const embeddings = await Promise.all(embeddingPromises);
        
        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          const embedding = embeddings[j];
          
          const createdChunk = await storage.createFileChunk({
            fileId,
            userId,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            tokenCount: chunk.tokenCount,
            metadata: {
              startChar: chunk.metadata.startChar,
              endChar: chunk.metadata.endChar,
            },
            attributes,
          });
          
          if (embedding) {
            await storage.updateFileChunkEmbedding(createdChunk.id, JSON.stringify(embedding), embedding);
          }
          
          chunksCreated++;
        }
        
        this.emit({
          type: 'progress',
          fileId,
          userId,
          data: { chunksCreated, totalChunks: chunks.length }
        });
      }
      
      await storage.updateFileChunkingStatus(fileId, userId, 'completed');
      
      this.emit({ 
        type: 'completed', 
        fileId, 
        userId, 
        data: { chunksCreated } 
      });
      
      console.log(`[ChunkingQueue] Completed file ${fileId}: ${chunksCreated} chunks created`);
      
      return { fileId, success: true, chunksCreated };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ChunkingQueue] Failed to process file ${fileId}:`, errorMessage);
      
      await storage.updateFileChunkingStatus(fileId, userId, 'failed');
      
      this.emit({ 
        type: 'failed', 
        fileId, 
        userId, 
        data: { error: errorMessage } 
      });
      
      return { fileId, success: false, error: errorMessage };
    }
  }

  private async extractContent(file: { filename: string; originalName?: string | null; mimeType?: string | null }): Promise<string | null> {
    const uploadDir = path.join(process.cwd(), 'uploads');
    const filePath = path.join(uploadDir, file.filename);
    
    try {
      await fs.access(filePath);
    } catch {
      return null;
    }
    
    const ext = path.extname(file.originalName || file.filename).toLowerCase();
    
    try {
      if (ext === '.pdf') {
        const pdfParseModule = await import('pdf-parse');
        const pdfParse = (pdfParseModule as any).default || pdfParseModule;
        const buffer = await fs.readFile(filePath);
        const data = await pdfParse(buffer);
        return data.text;
      }
      
      if (ext === '.docx' || ext === '.doc') {
        const buffer = await fs.readFile(filePath);
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      }
      
      if (ext === '.xlsx' || ext === '.xls') {
        const buffer = await fs.readFile(filePath);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        let text = '';
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          text += `Sheet: ${sheetName}\n`;
          text += XLSX.utils.sheet_to_txt(sheet) + '\n\n';
        }
        return text;
      }
      
      if (ext === '.txt' || ext === '.md' || ext === '.json' || ext === '.csv') {
        return await fs.readFile(filePath, 'utf-8');
      }
      
      return null;
    } catch (error) {
      console.error(`[ChunkingQueue] Error extracting content from ${file.filename}:`, error);
      return null;
    }
  }

  subscribe(userId: string, callback: ChunkingEventCallback): () => void {
    if (!this.eventListeners.has(userId)) {
      this.eventListeners.set(userId, []);
    }
    this.eventListeners.get(userId)!.push(callback);
    
    return () => {
      const listeners = this.eventListeners.get(userId);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  private emit(event: ChunkingEvent): void {
    const listeners = this.eventListeners.get(event.userId);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(event);
        } catch (error) {
          console.error('[ChunkingQueue] Error in event listener:', error);
        }
      }
    }
  }

  getQueueStatus(): { queueLength: number; activeJobs: number; processing: boolean } {
    return {
      queueLength: this.queue.length,
      activeJobs: this.activeJobs,
      processing: this.processing,
    };
  }

  getJobsForUser(userId: string): ChunkingJob[] {
    return this.queue.filter(j => j.userId === userId);
  }
}

export const chunkingQueue = new ChunkingQueue();
