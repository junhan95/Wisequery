import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq, desc, sql, max, and, lt, isNull, isNotNull, or } from "drizzle-orm";
import * as schema from "@shared/schema";
import type {
  User,
  UpsertUser,
  Project,
  InsertProject,
  Folder,
  InsertFolder,
  Conversation,
  InsertConversation,
  Message,
  InsertMessage,
  File,
  InsertFile,
  FileChunk,
  InsertFileChunk,
  Subscription,
  InsertSubscription,
  VerificationCode,
  InsertVerificationCode,
  RetentionPolicy,
  InsertRetentionPolicy,
  PendingNotification,
  InsertPendingNotification,
  AuditEvent,
  InsertAuditEvent,
  GoogleDriveTempFile,
  InsertGoogleDriveTempFile,
  ChunkAttributes,
} from "@shared/schema";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

// Singleton Pool for pgvector operations - prevents connection exhaustion
let pgVectorPool: Pool | null = null;

function getPgVectorPool(): Pool {
  if (!pgVectorPool) {
    pgVectorPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,  // Optimized for low-resource instances (Render Free: 0.1 CPU)
      idleTimeoutMillis: 15000,  // Close idle connections after 15 seconds
      connectionTimeoutMillis: 10000  // Timeout after 10 seconds when acquiring connection
    });

    // Handle pool errors gracefully
    pgVectorPool.on('error', (err) => {
      console.error('[PgVector Pool] Unexpected error:', err);
    });
  }
  return pgVectorPool;
}

// IStorage ?명꽣?섏씠?ㅻ뒗 storage/types.ts濡?遺꾨━??
// IStorage 인터페이스는 storage/types.ts로 분리됨
export type { IStorage } from "./storage/types";
import type { IStorage } from "./storage/types";

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private projects: Map<string, Project>;
  private folders: Map<string, Folder>;
  private conversations: Map<string, Conversation>;
  private messages: Map<string, Message>;
  private files: Map<string, File>;
  private fileChunks: Map<string, FileChunk>;
  private subscriptions: Map<string, Subscription>;
  private verificationCodes: Map<string, VerificationCode>;

  constructor() {
    this.users = new Map();
    this.projects = new Map();
    this.folders = new Map();
    this.conversations = new Map();
    this.messages = new Map();
    this.files = new Map();
    this.fileChunks = new Map();
    this.subscriptions = new Map();
    this.verificationCodes = new Map();
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((u) => u.email === email);
  }

  async createUser(userData: UpsertUser): Promise<User> {
    const id = randomUUID();
    const now = new Date();
    const user: User = {
      id,
      email: userData.email ?? null,
      password: userData.password ?? null,
      firstName: userData.firstName ?? null,
      lastName: userData.lastName ?? null,
      profileImageUrl: userData.profileImageUrl ?? null,
      emailVerified: userData.emailVerified ?? null,
      authProvider: userData.authProvider ?? "email",
      stripeCustomerId: userData.stripeCustomerId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const now = new Date();
    const user: User = {
      id: userData.id!,
      email: userData.email ?? null,
      password: userData.password ?? null,
      firstName: userData.firstName ?? null,
      lastName: userData.lastName ?? null,
      profileImageUrl: userData.profileImageUrl ?? null,
      emailVerified: userData.emailVerified ?? null,
      authProvider: userData.authProvider ?? "email",
      stripeCustomerId: userData.stripeCustomerId ?? null,
      createdAt: this.users.get(userData.id!)?.createdAt ?? now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated: User = {
      ...user,
      ...data,
      updatedAt: new Date(),
    };
    this.users.set(id, updated);
    return updated;
  }

  async createVerificationCode(insertCode: InsertVerificationCode): Promise<VerificationCode> {
    const id = randomUUID();
    const verificationCode: VerificationCode = {
      id,
      ...insertCode,
      createdAt: new Date(),
    };
    this.verificationCodes.set(id, verificationCode);
    return verificationCode;
  }

  async getVerificationCode(email: string, code: string, type: string): Promise<VerificationCode | undefined> {
    const now = new Date();
    return Array.from(this.verificationCodes.values()).find(
      (vc) => vc.email === email && vc.code === code && vc.type === type && vc.expiresAt > now
    );
  }

  async deleteVerificationCode(id: string): Promise<void> {
    this.verificationCodes.delete(id);
  }

  async deleteVerificationCodesByEmailAndType(email: string, type: string): Promise<void> {
    Array.from(this.verificationCodes.entries()).forEach(([id, code]) => {
      if (code.email === email && code.type === type) {
        this.verificationCodes.delete(id);
      }
    });
  }

  async deleteExpiredVerificationCodes(): Promise<void> {
    const now = new Date();
    Array.from(this.verificationCodes.entries()).forEach(([id, code]) => {
      if (code.expiresAt <= now) {
        this.verificationCodes.delete(id);
      }
    });
  }

  async getProjects(userId: string): Promise<Project[]> {
    return Array.from(this.projects.values())
      .filter((p) => p.userId === userId)
      .sort((a, b) => a.order - b.order);
  }

  async getProject(id: string, userId: string): Promise<Project | undefined> {
    const project = this.projects.get(id);
    if (!project || project.userId !== userId) return undefined;
    return project;
  }

  async createProject(insertProject: InsertProject, userId: string): Promise<Project> {
    const id = randomUUID();
    const now = new Date();

    // ?꾩옱 理쒕? order 媛믪쓣 李얠븘??+1 (?대떦 ?ъ슜?먯쓽 ?꾨줈?앺듃留?
    const existingProjects = Array.from(this.projects.values()).filter((p) => p.userId === userId);
    const maxOrder = existingProjects.reduce((max, p) => Math.max(max, p.order), -1);

    const project: Project = {
      id,
      userId,
      ...insertProject,
      order: maxOrder + 1,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(id, project);
    return project;
  }

  async updateProject(
    id: string,
    userId: string,
    data: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'userId'>>
  ): Promise<Project | undefined> {
    const project = this.projects.get(id);
    if (!project || project.userId !== userId) return undefined;

    const updated: Project = {
      ...project,
      ...data,
      updatedAt: new Date(),
    };
    this.projects.set(id, updated);
    return updated;
  }

  async deleteProject(id: string, userId: string): Promise<boolean> {
    const project = this.projects.get(id);
    if (!project || project.userId !== userId) return false;

    const conversations = await this.getConversationsByProject(id, userId);
    for (const conversation of conversations) {
      await this.deleteConversation(conversation.id, userId);
    }

    const folders = await this.getFoldersByProject(id, userId);
    for (const folder of folders) {
      this.folders.delete(folder.id);
    }

    return this.projects.delete(id);
  }

  // Folder operations
  async getFolders(userId: string): Promise<Folder[]> {
    return Array.from(this.folders.values())
      .filter((f) => f.userId === userId)
      .sort((a, b) => a.order - b.order);
  }

  async getFoldersByProject(projectId: string, userId: string): Promise<Folder[]> {
    return Array.from(this.folders.values())
      .filter((f) => f.projectId === projectId && f.userId === userId)
      .sort((a, b) => a.order - b.order);
  }

  async getFolder(id: string, userId: string): Promise<Folder | undefined> {
    const folder = this.folders.get(id);
    if (!folder || folder.userId !== userId) return undefined;
    return folder;
  }

  async createFolder(insertFolder: InsertFolder, userId: string): Promise<Folder> {
    const id = randomUUID();
    const now = new Date();

    const existingFolders = Array.from(this.folders.values())
      .filter((f) => f.projectId === insertFolder.projectId && f.userId === userId);
    const maxOrder = existingFolders.reduce((max, f) => Math.max(max, f.order), -1);

    const folder: Folder = {
      id,
      userId,
      projectId: insertFolder.projectId,
      parentFolderId: insertFolder.parentFolderId ?? null,
      name: insertFolder.name,
      order: maxOrder + 1,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.folders.set(id, folder);
    return folder;
  }

  async updateFolder(
    id: string,
    userId: string,
    data: Partial<Omit<Folder, 'id' | 'createdAt' | 'updatedAt' | 'userId'>>
  ): Promise<Folder | undefined> {
    const folder = this.folders.get(id);
    if (!folder || folder.userId !== userId) return undefined;

    const updated: Folder = {
      ...folder,
      ...data,
      updatedAt: new Date(),
    };
    this.folders.set(id, updated);
    return updated;
  }

  async deleteFolder(id: string, userId: string): Promise<boolean> {
    const folder = this.folders.get(id);
    if (!folder || folder.userId !== userId) return false;
    return this.folders.delete(id);
  }

  async getConversations(userId: string): Promise<Conversation[]> {
    return Array.from(this.conversations.values())
      .filter((c) => c.userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getConversation(id: string, userId: string): Promise<Conversation | undefined> {
    const conversation = this.conversations.get(id);
    if (!conversation || conversation.userId !== userId) return undefined;
    return conversation;
  }

  async getConversationsByProject(projectId: string, userId: string): Promise<Conversation[]> {
    return Array.from(this.conversations.values())
      .filter((c) => c.projectId === projectId && c.userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async createConversation(insertConversation: InsertConversation, userId: string): Promise<Conversation> {
    const id = randomUUID();
    const now = new Date();
    const conversation: Conversation = {
      id,
      userId,
      ...insertConversation,
      folderId: null,
      description: insertConversation.description ?? null,
      instructions: insertConversation.instructions ?? null,
      archivedAt: null,
      deletedAt: null,
      lastActivityAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(id, conversation);
    return conversation;
  }

  async updateConversation(
    id: string,
    userId: string,
    data: Partial<InsertConversation>
  ): Promise<Conversation | undefined> {
    const conversation = this.conversations.get(id);
    if (!conversation || conversation.userId !== userId) return undefined;

    const updated: Conversation = {
      ...conversation,
      ...data,
      updatedAt: new Date(),
    };
    this.conversations.set(id, updated);
    return updated;
  }

  async deleteConversation(id: string, userId: string): Promise<boolean> {
    const conversation = this.conversations.get(id);
    if (!conversation || conversation.userId !== userId) return false;

    const messages = Array.from(this.messages.values()).filter(
      (m) => m.conversationId === id && m.userId === userId
    );
    for (const message of messages) {
      this.messages.delete(message.id);
    }
    return this.conversations.delete(id);
  }

  async getMessages(conversationId: string, userId: string): Promise<Message[]> {
    const conversation = await this.getConversation(conversationId, userId);
    if (!conversation) return [];

    return Array.from(this.messages.values())
      .filter((m) => m.conversationId === conversationId && m.userId === userId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async getAllMessages(userId: string, includeArchived = false): Promise<Message[]> {
    const messages = Array.from(this.messages.values()).filter((m) => m.userId === userId);
    if (includeArchived) return messages;

    // Exclude messages from archived conversations
    const archivedConversationIds = new Set(
      Array.from(this.conversations.values())
        .filter(c => c.userId === userId && c.archivedAt !== null)
        .map(c => c.id)
    );
    return messages.filter(m => !archivedConversationIds.has(m.conversationId));
  }

  async getAIQueryCount(userId: string): Promise<number> {
    return Array.from(this.messages.values())
      .filter((m) => m.userId === userId && m.role === 'assistant')
      .length;
  }

  async createMessage(insertMessage: InsertMessage, userId: string): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      id,
      userId,
      ...insertMessage,
      attachments: insertMessage.attachments ?? null,
      embedding: null,
      embeddingVector: null,
      createdAt: new Date(),
    };
    this.messages.set(id, message);

    const conversation = this.conversations.get(insertMessage.conversationId);
    if (conversation && conversation.userId === userId) {
      conversation.updatedAt = new Date();
      this.conversations.set(conversation.id, conversation);
    }

    return message;
  }

  async updateMessageEmbedding(id: string, userId: string, embedding: string, embeddingVector?: number[]): Promise<void> {
    const message = this.messages.get(id);
    if (message && message.userId === userId) {
      message.embedding = embedding;
      if (embeddingVector) {
        (message as any).embeddingVector = embeddingVector;
      }
      this.messages.set(id, message);
    }
  }

  async getFilesByConversation(conversationId: string, userId: string): Promise<File[]> {
    return Array.from(this.files.values())
      .filter((f) => f.conversationId === conversationId && f.userId === userId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async getFileById(id: string, userId: string): Promise<File | undefined> {
    const file = this.files.get(id);
    if (!file || file.userId !== userId) return undefined;
    return file;
  }

  async createFile(insertFile: InsertFile, userId: string): Promise<File> {
    const id = randomUUID();
    const now = new Date();
    const file: File = {
      id,
      userId,
      projectId: insertFile.projectId,
      folderId: insertFile.folderId ?? null,
      conversationId: insertFile.conversationId ?? null,
      filename: insertFile.filename,
      originalName: insertFile.originalName,
      mimeType: insertFile.mimeType,
      size: insertFile.size,
      content: insertFile.content ?? null,
      embedding: null,
      embeddingVector: null,
      chunkingStatus: null,
      archivedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.files.set(id, file);
    return file;
  }

  async getFilesByProject(projectId: string, userId: string): Promise<File[]> {
    return Array.from(this.files.values())
      .filter((f) => f.projectId === projectId && f.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getFilesByUser(userId: string): Promise<File[]> {
    return Array.from(this.files.values())
      .filter((f) => f.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async updateFile(id: string, userId: string, data: Partial<InsertFile>): Promise<File | undefined> {
    const file = this.files.get(id);
    if (!file || file.userId !== userId) return undefined;

    const updated: File = {
      ...file,
      ...data,
      updatedAt: new Date(),
    } as File;
    this.files.set(id, updated);
    return updated;
  }

  async deleteFile(id: string, userId: string): Promise<boolean> {
    const file = this.files.get(id);
    if (!file || file.userId !== userId) return false;
    return this.files.delete(id);
  }

  async updateFileEmbedding(id: string, userId: string, embedding: string, embeddingVector?: number[]): Promise<void> {
    const file = this.files.get(id);
    if (file && file.userId === userId) {
      file.embedding = embedding;
      if (embeddingVector) {
        (file as any).embeddingVector = embeddingVector;
      }
      this.files.set(id, file);
    }
  }

  async updateFileContent(id: string, userId: string, content: string, size: number): Promise<void> {
    const file = this.files.get(id);
    if (file && file.userId === userId) {
      file.content = content;
      file.size = size;
      file.updatedAt = new Date();
      this.files.set(id, file);
    }
  }

  async updateUserStripeCustomerId(userId: string, stripeCustomerId: string): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    const updated: User = {
      ...user,
      stripeCustomerId,
      updatedAt: new Date(),
    };
    this.users.set(userId, updated);
    return updated;
  }

  async getSubscription(userId: string): Promise<Subscription | undefined> {
    return Array.from(this.subscriptions.values()).find((s) => s.userId === userId);
  }

  async createSubscription(insertSubscription: InsertSubscription, userId: string): Promise<Subscription> {
    const id = randomUUID();
    const now = new Date();
    const subscription: Subscription = {
      id,
      userId,
      plan: insertSubscription.plan ?? "free",
      stripeSubscriptionId: insertSubscription.stripeSubscriptionId ?? null,
      stripeStatus: insertSubscription.stripeStatus ?? null,
      stripePriceId: insertSubscription.stripePriceId ?? null,
      stripeCurrentPeriodEnd: insertSubscription.stripeCurrentPeriodEnd ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.subscriptions.set(id, subscription);
    return subscription;
  }

  async updateSubscription(userId: string, data: Partial<InsertSubscription>): Promise<Subscription | undefined> {
    const subscription = await this.getSubscription(userId);
    if (!subscription) return undefined;
    const updated: Subscription = {
      ...subscription,
      ...data,
      updatedAt: new Date(),
    };
    this.subscriptions.set(subscription.id, updated);
    return updated;
  }

  async getFileChunks(fileId: string, userId: string): Promise<FileChunk[]> {
    return Array.from(this.fileChunks.values())
      .filter(c => c.fileId === fileId && c.userId === userId)
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  async getFileChunksByProject(projectId: string, userId: string): Promise<FileChunk[]> {
    const projectFiles = await this.getFilesByProject(projectId, userId);
    const fileIds = new Set(projectFiles.map(f => f.id));
    return Array.from(this.fileChunks.values())
      .filter(c => fileIds.has(c.fileId) && c.userId === userId)
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  async getAllFileChunks(userId: string, includeArchived = false): Promise<FileChunk[]> {
    let chunks = Array.from(this.fileChunks.values())
      .filter(c => c.userId === userId)
      .sort((a, b) => a.chunkIndex - b.chunkIndex);

    if (includeArchived) return chunks;

    // Exclude chunks from archived files
    const archivedFileIds = new Set(
      Array.from(this.files.values())
        .filter(f => f.userId === userId && f.archivedAt !== null)
        .map(f => f.id)
    );
    return chunks.filter(c => !archivedFileIds.has(c.fileId));
  }

  async createFileChunk(chunk: InsertFileChunk): Promise<FileChunk> {
    const id = randomUUID();
    const newChunk: FileChunk = {
      id,
      fileId: chunk.fileId,
      userId: chunk.userId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      embedding: null,
      embeddingVector: null,
      metadata: (chunk.metadata ?? null) as { startChar?: number; endChar?: number } | null,
      attributes: (chunk.attributes ?? null) as ChunkAttributes | null,
      createdAt: new Date(),
    };
    this.fileChunks.set(id, newChunk);
    return newChunk;
  }

  async createFileChunks(chunks: InsertFileChunk[]): Promise<FileChunk[]> {
    const results: FileChunk[] = [];
    for (const chunk of chunks) {
      results.push(await this.createFileChunk(chunk));
    }
    return results;
  }

  async deleteFileChunks(fileId: string, userId: string): Promise<boolean> {
    const toDelete = Array.from(this.fileChunks.entries())
      .filter(([_, c]) => c.fileId === fileId && c.userId === userId);
    for (const [id] of toDelete) {
      this.fileChunks.delete(id);
    }
    return toDelete.length > 0;
  }

  async updateFileChunkEmbedding(id: string, embedding: string, embeddingVector?: number[]): Promise<void> {
    const chunk = this.fileChunks.get(id);
    if (chunk) {
      chunk.embedding = embedding;
      if (embeddingVector) {
        (chunk as any).embeddingVector = embeddingVector;
      }
      this.fileChunks.set(id, chunk);
    }
  }

  async updateFileChunkingStatus(fileId: string, userId: string, status: string): Promise<void> {
    const file = this.files.get(fileId);
    if (file && file.userId === userId) {
      (file as any).chunkingStatus = status;
      this.files.set(fileId, file);
    }
  }

  // Retention policy stub implementations
  async getRetentionPolicy(_plan: string): Promise<RetentionPolicy | undefined> {
    throw new Error("Not implemented");
  }

  async createRetentionPolicy(_policy: InsertRetentionPolicy): Promise<RetentionPolicy> {
    throw new Error("Not implemented");
  }

  async updateRetentionPolicy(_plan: string, _data: Partial<InsertRetentionPolicy>): Promise<RetentionPolicy | undefined> {
    throw new Error("Not implemented");
  }

  // Pending notification stub implementations
  async createPendingNotification(_notification: InsertPendingNotification): Promise<PendingNotification> {
    throw new Error("Not implemented");
  }

  async getPendingNotifications(_userId: string): Promise<PendingNotification[]> {
    return [];
  }

  async markNotificationSent(_id: string): Promise<void> {
    throw new Error("Not implemented");
  }

  // Audit event stub implementations
  async createAuditEvent(_event: InsertAuditEvent): Promise<AuditEvent> {
    throw new Error("Not implemented");
  }

  async getAuditEvents(_userId: string, _limit?: number): Promise<AuditEvent[]> {
    return [];
  }

  // Expiration/archival stub implementations
  async getUsersWithExpiringItems(_warningDays: number): Promise<{ id: string; email: string; plan: string }[]> {
    return [];
  }

  async getAllUsersWithSubscriptions(): Promise<{ id: string; email: string; plan: string }[]> {
    return [];
  }

  async getExpiringConversations(_userId: string, _retentionDays: number, _warningDays: number): Promise<{ id: string; name: string }[]> {
    return [];
  }

  async getExpiringFiles(_userId: string, _retentionDays: number, _warningDays: number): Promise<{ id: string; originalName: string }[]> {
    return [];
  }

  async archiveExpiredConversations(_userId: string, _retentionDays: number): Promise<number> {
    return 0;
  }

  async archiveExpiredFiles(_userId: string, _retentionDays: number): Promise<number> {
    return 0;
  }

  async deleteArchivedConversations(_userId: string, _gracePeriodDays: number): Promise<number> {
    return 0;
  }

  async deleteArchivedFiles(_userId: string, _gracePeriodDays: number): Promise<number> {
    return 0;
  }

  async deleteExpiredSessions(): Promise<number> {
    return 0;
  }

  async restoreConversation(_id: string, _userId: string): Promise<boolean> {
    return false;
  }

  async restoreFile(_id: string, _userId: string): Promise<boolean> {
    return false;
  }

  async getArchivedConversations(_userId: string): Promise<Conversation[]> {
    return [];
  }

  async getArchivedFiles(_userId: string): Promise<File[]> {
    return [];
  }

  async getTrashItems(userId: string): Promise<{ files: File[]; folders: Folder[]; conversations: Conversation[] }> {
    const files = Array.from(this.files.values()).filter(f => f.userId === userId && f.deletedAt !== null);
    const folders = Array.from(this.folders.values()).filter(f => f.userId === userId && (f as any).deletedAt !== null);
    const conversations = Array.from(this.conversations.values()).filter(c => c.userId === userId && c.deletedAt !== null);
    return { files, folders, conversations };
  }

  async softDeleteFile(id: string, userId: string): Promise<boolean> {
    const file = this.files.get(id);
    if (!file || file.userId !== userId) return false;
    file.deletedAt = new Date();
    this.files.set(id, file);
    return true;
  }

  async softDeleteFolder(id: string, userId: string): Promise<boolean> {
    const folder = this.folders.get(id);
    if (!folder || folder.userId !== userId) return false;

    const deletedAt = new Date();
    (folder as any).deletedAt = deletedAt;
    this.folders.set(id, folder);

    // Cascade: soft delete all files in this folder
    for (const file of this.files.values()) {
      if (file.folderId === id && file.userId === userId) {
        file.deletedAt = deletedAt;
      }
    }

    // Cascade: soft delete all conversations in this folder
    for (const conv of this.conversations.values()) {
      if (conv.folderId === id && conv.userId === userId) {
        conv.deletedAt = deletedAt;
      }
    }

    // Cascade: soft delete all subfolders recursively
    for (const subfolder of this.folders.values()) {
      if (subfolder.parentFolderId === id && subfolder.userId === userId) {
        await this.softDeleteFolder(subfolder.id, userId);
      }
    }

    return true;
  }

  async softDeleteConversation(id: string, userId: string): Promise<boolean> {
    const conversation = this.conversations.get(id);
    if (!conversation || conversation.userId !== userId) return false;
    conversation.deletedAt = new Date();
    this.conversations.set(id, conversation);
    return true;
  }

  async restoreFileFromTrash(id: string, userId: string): Promise<boolean> {
    const file = this.files.get(id);
    if (!file || file.userId !== userId || !file.deletedAt) return false;

    // Check if parent folder is still in trash
    if (file.folderId) {
      const parentFolder = this.folders.get(file.folderId);
      if (!parentFolder || (parentFolder as any).deletedAt) {
        file.folderId = null; // Restore to project root
      }
    }

    file.deletedAt = null;
    this.files.set(id, file);
    return true;
  }

  async restoreFolderFromTrash(id: string, userId: string): Promise<boolean> {
    const folder = this.folders.get(id);
    if (!folder || folder.userId !== userId || !(folder as any).deletedAt) return false;

    // Check if parent folder is still in trash
    if (folder.parentFolderId) {
      const parentFolder = this.folders.get(folder.parentFolderId);
      if (!parentFolder || (parentFolder as any).deletedAt) {
        folder.parentFolderId = null; // Restore to project root
      }
    }

    (folder as any).deletedAt = null;
    this.folders.set(id, folder);

    // Cascade: restore all files in this folder
    for (const file of this.files.values()) {
      if (file.folderId === id && file.userId === userId && file.deletedAt) {
        file.deletedAt = null;
      }
    }

    // Cascade: restore all conversations in this folder
    for (const conv of this.conversations.values()) {
      if (conv.folderId === id && conv.userId === userId && conv.deletedAt) {
        conv.deletedAt = null;
      }
    }

    // Cascade: restore all subfolders recursively
    for (const subfolder of this.folders.values()) {
      if (subfolder.parentFolderId === id && subfolder.userId === userId && (subfolder as any).deletedAt) {
        await this.restoreFolderFromTrash(subfolder.id, userId);
      }
    }

    return true;
  }

  async restoreConversationFromTrash(id: string, userId: string): Promise<boolean> {
    const conversation = this.conversations.get(id);
    if (!conversation || conversation.userId !== userId || !conversation.deletedAt) return false;

    // Check if parent folder is still in trash
    if (conversation.folderId) {
      const parentFolder = this.folders.get(conversation.folderId);
      if (!parentFolder || (parentFolder as any).deletedAt) {
        conversation.folderId = null; // Restore to project root
      }
    }

    conversation.deletedAt = null;
    this.conversations.set(id, conversation);
    return true;
  }

  async permanentlyDeleteFile(id: string, userId: string): Promise<boolean> {
    const file = this.files.get(id);
    if (!file || file.userId !== userId || !file.deletedAt) return false;
    return this.files.delete(id);
  }

  async permanentlyDeleteFolder(id: string, userId: string): Promise<boolean> {
    const folder = this.folders.get(id);
    if (!folder || folder.userId !== userId || !(folder as any).deletedAt) return false;

    // Recursively delete subfolders first
    for (const subfolder of Array.from(this.folders.values())) {
      if (subfolder.parentFolderId === id && subfolder.userId === userId) {
        await this.permanentlyDeleteFolder(subfolder.id, userId);
      }
    }

    // Delete all files in this folder
    for (const [fileId, file] of Array.from(this.files.entries())) {
      if (file.folderId === id && file.userId === userId) {
        // Delete file chunks
        for (const [chunkId, chunk] of Array.from(this.fileChunks.entries())) {
          if (chunk.fileId === fileId) {
            this.fileChunks.delete(chunkId);
          }
        }
        this.files.delete(fileId);
      }
    }

    // Delete all conversations in this folder (and their messages)
    for (const [convId, conv] of Array.from(this.conversations.entries())) {
      if (conv.folderId === id && conv.userId === userId) {
        for (const [msgId, msg] of Array.from(this.messages.entries())) {
          if (msg.conversationId === convId) {
            this.messages.delete(msgId);
          }
        }
        this.conversations.delete(convId);
      }
    }

    return this.folders.delete(id);
  }

  async permanentlyDeleteConversation(id: string, userId: string): Promise<boolean> {
    const conversation = this.conversations.get(id);
    if (!conversation || conversation.userId !== userId || !conversation.deletedAt) return false;
    const messages = Array.from(this.messages.values()).filter(m => m.conversationId === id);
    for (const msg of messages) {
      this.messages.delete(msg.id);
    }
    return this.conversations.delete(id);
  }

  async emptyTrash(userId: string): Promise<{ files: number; folders: number; conversations: number }> {
    let filesCount = 0, foldersCount = 0, conversationsCount = 0;

    const fileEntries = Array.from(this.files.entries());
    for (const [id, file] of fileEntries) {
      if (file.userId === userId && file.deletedAt) {
        this.files.delete(id);
        filesCount++;
      }
    }

    const folderEntries = Array.from(this.folders.entries());
    for (const [id, folder] of folderEntries) {
      if (folder.userId === userId && (folder as any).deletedAt) {
        this.folders.delete(id);
        foldersCount++;
      }
    }

    const convEntries = Array.from(this.conversations.entries());
    for (const [id, conv] of convEntries) {
      if (conv.userId === userId && conv.deletedAt) {
        const msgEntries = Array.from(this.messages.entries());
        for (const [msgId, msg] of msgEntries) {
          if (msg.conversationId === id) {
            this.messages.delete(msgId);
          }
        }
        this.conversations.delete(id);
        conversationsCount++;
      }
    }

    return { files: filesCount, folders: foldersCount, conversations: conversationsCount };
  }

  // Google Drive temp file operations (stub implementations for MemStorage)
  async createGoogleDriveTempFile(_tempFile: InsertGoogleDriveTempFile): Promise<GoogleDriveTempFile> {
    throw new Error("Google Drive temp files not supported in MemStorage");
  }

  async getGoogleDriveTempFile(_fileId: string, _userId: string): Promise<GoogleDriveTempFile | undefined> {
    return undefined;
  }

  async getGoogleDriveTempFileByDriveId(_googleDriveFileId: string, _userId: string): Promise<GoogleDriveTempFile | undefined> {
    return undefined;
  }

  async updateGoogleDriveTempFile(_id: string, _userId: string, _data: Partial<GoogleDriveTempFile>): Promise<GoogleDriveTempFile | undefined> {
    return undefined;
  }

  async deleteGoogleDriveTempFile(_id: string, _userId: string): Promise<boolean> {
    return false;
  }

  async deleteExpiredGoogleDriveTempFiles(): Promise<number> {
    return 0;
  }

  // pgvector-based semantic search (stub for MemStorage - uses JS cosine similarity fallback)
  async searchMessagesByVector(
    userId: string,
    queryEmbedding: number[],
    limit: number = 10,
    excludeConversationId?: string,
    _includeArchived?: boolean,
    _subscriptionTier?: string
  ): Promise<Array<Message & { similarity: number; conversationId: string }>> {
    const messages = Array.from(this.messages.values()).filter(m => {
      if (m.userId !== userId) return false;
      if (excludeConversationId && m.conversationId === excludeConversationId) return false;
      if (!m.embedding) return false;
      return true;
    });

    // JS cosine similarity fallback for MemStorage
    const results = messages.map(m => {
      const msgEmbedding = JSON.parse(m.embedding!);
      let dotProduct = 0, normA = 0, normB = 0;
      for (let i = 0; i < queryEmbedding.length; i++) {
        dotProduct += queryEmbedding[i] * msgEmbedding[i];
        normA += queryEmbedding[i] * queryEmbedding[i];
        normB += msgEmbedding[i] * msgEmbedding[i];
      }
      const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
      return { ...m, similarity };
    });

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async searchFileChunksByVector(
    userId: string,
    queryEmbedding: number[],
    limit: number = 10,
    _includeArchived?: boolean,
    _subscriptionTier?: string
  ): Promise<Array<FileChunk & { similarity: number; fileId: string; projectId?: string }>> {
    const chunks = Array.from(this.fileChunks.values()).filter(c => {
      if (c.userId !== userId) return false;
      if (!c.embedding) return false;
      return true;
    });

    // JS cosine similarity fallback for MemStorage
    const results = chunks.map(c => {
      const chunkEmbedding = JSON.parse(c.embedding!);
      let dotProduct = 0, normA = 0, normB = 0;
      for (let i = 0; i < queryEmbedding.length; i++) {
        dotProduct += queryEmbedding[i] * chunkEmbedding[i];
        normA += queryEmbedding[i] * queryEmbedding[i];
        normB += chunkEmbedding[i] * chunkEmbedding[i];
      }
      const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
      return { ...c, similarity, projectId: undefined };
    });

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async migrateEmbeddingsToVector(): Promise<{ messages: number; fileChunks: number }> {
    return { messages: 0, fileChunks: 0 };
  }
}

// DatabaseStorage??storage/ ?대뜑???꾨찓?몃퀎 紐⑤뱢濡?遺꾨━??
export { DatabaseStorage, storage } from "./storage/index";

