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
} from "@shared/schema";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

// Singleton Pool for pgvector operations - prevents connection exhaustion
let pgVectorPool: Pool | null = null;

function getPgVectorPool(): Pool {
  if (!pgVectorPool) {
    pgVectorPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,  // Maximum 10 connections in pool
      idleTimeoutMillis: 30000,  // Close idle connections after 30 seconds
      connectionTimeoutMillis: 10000  // Timeout after 10 seconds when acquiring connection
    });

    // Handle pool errors gracefully
    pgVectorPool.on('error', (err) => {
      console.error('[PgVector Pool] Unexpected error:', err);
    });
  }
  return pgVectorPool;
}

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  updateUserStripeCustomerId(userId: string, stripeCustomerId: string): Promise<User | undefined>;

  // Verification code operations
  createVerificationCode(code: InsertVerificationCode): Promise<VerificationCode>;
  getVerificationCode(email: string, code: string, type: string): Promise<VerificationCode | undefined>;
  deleteVerificationCode(id: string): Promise<void>;
  deleteVerificationCodesByEmailAndType(email: string, type: string): Promise<void>;
  deleteExpiredVerificationCodes(): Promise<void>;

  getProjects(userId: string): Promise<Project[]>;
  getProject(id: string, userId: string): Promise<Project | undefined>;
  createProject(project: InsertProject, userId: string): Promise<Project>;
  updateProject(id: string, userId: string, data: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'userId'>>): Promise<Project | undefined>;
  deleteProject(id: string, userId: string): Promise<boolean>;

  // Folder operations
  getFolders(userId: string): Promise<Folder[]>;
  getFoldersByProject(projectId: string, userId: string): Promise<Folder[]>;
  getFolder(id: string, userId: string): Promise<Folder | undefined>;
  createFolder(folder: InsertFolder, userId: string): Promise<Folder>;
  updateFolder(id: string, userId: string, data: Partial<Omit<Folder, 'id' | 'createdAt' | 'updatedAt' | 'userId'>>): Promise<Folder | undefined>;
  deleteFolder(id: string, userId: string): Promise<boolean>;

  getConversations(userId: string): Promise<Conversation[]>;
  getConversation(id: string, userId: string): Promise<Conversation | undefined>;
  getConversationsByProject(projectId: string, userId: string): Promise<Conversation[]>;
  createConversation(conversation: InsertConversation, userId: string): Promise<Conversation>;
  updateConversation(id: string, userId: string, data: Partial<InsertConversation>): Promise<Conversation | undefined>;
  deleteConversation(id: string, userId: string): Promise<boolean>;

  getMessages(conversationId: string, userId: string): Promise<Message[]>;
  getAllMessages(userId: string, includeArchived?: boolean): Promise<Message[]>;
  getAIQueryCount(userId: string): Promise<number>;
  createMessage(message: InsertMessage, userId: string): Promise<Message>;
  updateMessageEmbedding(id: string, userId: string, embedding: string, embeddingVector?: number[]): Promise<void>;

  getFilesByConversation(conversationId: string, userId: string): Promise<File[]>;
  getFilesByProject(projectId: string, userId: string): Promise<File[]>;
  getFilesByUser(userId: string): Promise<File[]>;
  getFileById(id: string, userId: string): Promise<File | undefined>;
  createFile(file: InsertFile, userId: string): Promise<File>;
  updateFile(id: string, userId: string, data: Partial<InsertFile>): Promise<File | undefined>;
  deleteFile(id: string, userId: string): Promise<boolean>;
  updateFileEmbedding(id: string, userId: string, embedding: string, embeddingVector?: number[]): Promise<void>;
  updateFileContent(id: string, userId: string, content: string, size: number): Promise<void>;

  // Subscription operations
  getSubscription(userId: string): Promise<Subscription | undefined>;
  createSubscription(subscription: InsertSubscription, userId: string): Promise<Subscription>;
  updateSubscription(userId: string, data: Partial<InsertSubscription>): Promise<Subscription | undefined>;

  // File chunk operations
  getFileChunks(fileId: string, userId: string): Promise<FileChunk[]>;
  getFileChunksByProject(projectId: string, userId: string): Promise<FileChunk[]>;
  getAllFileChunks(userId: string, includeArchived?: boolean): Promise<FileChunk[]>;
  createFileChunk(chunk: InsertFileChunk): Promise<FileChunk>;
  createFileChunks(chunks: InsertFileChunk[]): Promise<FileChunk[]>;
  deleteFileChunks(fileId: string, userId: string): Promise<boolean>;
  updateFileChunkEmbedding(id: string, embedding: string, embeddingVector?: number[]): Promise<void>;
  updateFileChunkingStatus(fileId: string, userId: string, status: string): Promise<void>;

  // Retention policy operations
  getRetentionPolicy(plan: string): Promise<RetentionPolicy | undefined>;
  createRetentionPolicy(policy: InsertRetentionPolicy): Promise<RetentionPolicy>;
  updateRetentionPolicy(plan: string, data: Partial<InsertRetentionPolicy>): Promise<RetentionPolicy | undefined>;

  // Pending notification operations
  createPendingNotification(notification: InsertPendingNotification): Promise<PendingNotification>;
  getPendingNotifications(userId: string): Promise<PendingNotification[]>;
  markNotificationSent(id: string): Promise<void>;

  // Audit event operations
  createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent>;
  getAuditEvents(userId: string, limit?: number): Promise<AuditEvent[]>;

  // Expiration/archival operations
  getUsersWithExpiringItems(warningDays: number): Promise<{ id: string; email: string; plan: string }[]>;
  getAllUsersWithSubscriptions(): Promise<{ id: string; email: string; plan: string }[]>;
  getExpiringConversations(userId: string, retentionDays: number, warningDays: number): Promise<{ id: string; name: string }[]>;
  getExpiringFiles(userId: string, retentionDays: number, warningDays: number): Promise<{ id: string; originalName: string }[]>;
  archiveExpiredConversations(userId: string, retentionDays: number): Promise<number>;
  archiveExpiredFiles(userId: string, retentionDays: number): Promise<number>;
  deleteArchivedConversations(userId: string, gracePeriodDays: number): Promise<number>;
  deleteArchivedFiles(userId: string, gracePeriodDays: number): Promise<number>;
  deleteExpiredSessions(): Promise<number>;
  restoreConversation(id: string, userId: string): Promise<boolean>;
  restoreFile(id: string, userId: string): Promise<boolean>;
  getArchivedConversations(userId: string): Promise<Conversation[]>;
  getArchivedFiles(userId: string): Promise<File[]>;

  // Trash operations (soft delete)
  getTrashItems(userId: string): Promise<{ files: File[]; folders: Folder[]; conversations: Conversation[] }>;
  softDeleteFile(id: string, userId: string): Promise<boolean>;
  softDeleteFolder(id: string, userId: string): Promise<boolean>;
  softDeleteConversation(id: string, userId: string): Promise<boolean>;
  restoreFileFromTrash(id: string, userId: string): Promise<boolean>;
  restoreFolderFromTrash(id: string, userId: string): Promise<boolean>;
  restoreConversationFromTrash(id: string, userId: string): Promise<boolean>;
  permanentlyDeleteFile(id: string, userId: string): Promise<boolean>;
  permanentlyDeleteFolder(id: string, userId: string): Promise<boolean>;
  permanentlyDeleteConversation(id: string, userId: string): Promise<boolean>;
  emptyTrash(userId: string): Promise<{ files: number; folders: number; conversations: number }>;

  // Google Drive temp file operations
  createGoogleDriveTempFile(tempFile: InsertGoogleDriveTempFile): Promise<GoogleDriveTempFile>;
  getGoogleDriveTempFile(fileId: string, userId: string): Promise<GoogleDriveTempFile | undefined>;
  getGoogleDriveTempFileByDriveId(googleDriveFileId: string, userId: string): Promise<GoogleDriveTempFile | undefined>;
  updateGoogleDriveTempFile(id: string, userId: string, data: Partial<GoogleDriveTempFile>): Promise<GoogleDriveTempFile | undefined>;
  deleteGoogleDriveTempFile(id: string, userId: string): Promise<boolean>;
  deleteExpiredGoogleDriveTempFiles(): Promise<number>;

  // pgvector-based semantic search operations
  // All tiers receive uniform high-quality search (ef_search=200)
  searchMessagesByVector(
    userId: string,
    queryEmbedding: number[],
    limit?: number,
    excludeConversationId?: string,
    includeArchived?: boolean,
    subscriptionTier?: string
  ): Promise<Array<Message & { similarity: number; conversationId: string }>>;

  searchFileChunksByVector(
    userId: string,
    queryEmbedding: number[],
    limit?: number,
    includeArchived?: boolean,
    subscriptionTier?: string
  ): Promise<Array<FileChunk & { similarity: number; fileId: string; projectId?: string }>>;
}

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

    // 현재 최대 order 값을 찾아서 +1 (해당 사용자의 프로젝트만)
    const existingProjects = Array.from(this.projects.values()).filter((p) => p.userId === userId);
    const maxOrder = existingProjects.reduce((max, p) => Math.max(max, p.order), -1);

    const project: Project = {
      id,
      userId,
      ...insertProject,
      order: maxOrder + 1,
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
      ...insertFolder,
      order: maxOrder + 1,
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
    };
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
      metadata: chunk.metadata ?? null,
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
}

export class DatabaseStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const pool = new Pool({ connectionString });
    this.db = drizzle(pool, { schema });
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(schema.users).where(eq(schema.users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(schema.users).where(eq(schema.users.email, email));
    return user;
  }

  async createUser(userData: UpsertUser): Promise<User> {
    const [user] = await this.db
      .insert(schema.users)
      .values(userData)
      .returning();
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await this.db
      .insert(schema.users)
      .values(userData)
      .onConflictDoUpdate({
        target: schema.users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const results = await this.db
      .update(schema.users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return results[0];
  }

  async createVerificationCode(insertCode: InsertVerificationCode): Promise<VerificationCode> {
    const results = await this.db
      .insert(schema.verificationCodes)
      .values(insertCode)
      .returning();
    return results[0];
  }

  async getVerificationCode(email: string, code: string, type: string): Promise<VerificationCode | undefined> {
    const now = new Date();
    const [verificationCode] = await this.db
      .select()
      .from(schema.verificationCodes)
      .where(
        and(
          eq(schema.verificationCodes.email, email),
          eq(schema.verificationCodes.code, code),
          eq(schema.verificationCodes.type, type),
          sql`${schema.verificationCodes.expiresAt} > ${now}`
        )
      );
    return verificationCode;
  }

  async deleteVerificationCode(id: string): Promise<void> {
    await this.db
      .delete(schema.verificationCodes)
      .where(eq(schema.verificationCodes.id, id));
  }

  async deleteVerificationCodesByEmailAndType(email: string, type: string): Promise<void> {
    await this.db
      .delete(schema.verificationCodes)
      .where(
        and(
          eq(schema.verificationCodes.email, email),
          eq(schema.verificationCodes.type, type)
        )
      );
  }

  async deleteExpiredVerificationCodes(): Promise<void> {
    const now = new Date();
    await this.db
      .delete(schema.verificationCodes)
      .where(sql`${schema.verificationCodes.expiresAt} <= ${now}`);
  }

  async getProjects(userId: string): Promise<Project[]> {
    return await this.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(schema.projects.order);
  }

  async getProject(id: string, userId: string): Promise<Project | undefined> {
    const results = await this.db
      .select()
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
      .limit(1);
    return results[0];
  }

  async createProject(insertProject: InsertProject, userId: string): Promise<Project> {
    // 현재 최대 order 값을 효율적으로 찾기 (해당 사용자의 프로젝트만)
    const maxOrderResult = await this.db
      .select({ value: max(schema.projects.order) })
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId));
    const maxOrder = maxOrderResult[0]?.value ?? -1;

    const results = await this.db
      .insert(schema.projects)
      .values({ userId, ...insertProject, order: maxOrder + 1 })
      .returning();
    return results[0];
  }

  async updateProject(
    id: string,
    userId: string,
    data: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'userId'>>
  ): Promise<Project | undefined> {
    const results = await this.db
      .update(schema.projects)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
      .returning();
    return results[0];
  }

  async deleteProject(id: string, userId: string): Promise<boolean> {
    const results = await this.db
      .delete(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
      .returning();
    return results.length > 0;
  }

  // Folder operations
  async getFolders(userId: string): Promise<Folder[]> {
    return await this.db
      .select()
      .from(schema.folders)
      .where(and(eq(schema.folders.userId, userId), isNull(schema.folders.deletedAt)))
      .orderBy(schema.folders.order);
  }

  async getFoldersByProject(projectId: string, userId: string): Promise<Folder[]> {
    return await this.db
      .select()
      .from(schema.folders)
      .where(and(eq(schema.folders.projectId, projectId), eq(schema.folders.userId, userId), isNull(schema.folders.deletedAt)))
      .orderBy(schema.folders.order);
  }

  async getFolder(id: string, userId: string): Promise<Folder | undefined> {
    const results = await this.db
      .select()
      .from(schema.folders)
      .where(and(eq(schema.folders.id, id), eq(schema.folders.userId, userId)))
      .limit(1);
    return results[0];
  }

  async createFolder(insertFolder: InsertFolder, userId: string): Promise<Folder> {
    const maxOrderResult = await this.db
      .select({ value: max(schema.folders.order) })
      .from(schema.folders)
      .where(and(eq(schema.folders.projectId, insertFolder.projectId), eq(schema.folders.userId, userId)));
    const maxOrder = maxOrderResult[0]?.value ?? -1;

    const results = await this.db
      .insert(schema.folders)
      .values({ userId, ...insertFolder, order: maxOrder + 1 })
      .returning();
    return results[0];
  }

  async updateFolder(
    id: string,
    userId: string,
    data: Partial<Omit<Folder, 'id' | 'createdAt' | 'updatedAt' | 'userId'>>
  ): Promise<Folder | undefined> {
    const results = await this.db
      .update(schema.folders)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.folders.id, id), eq(schema.folders.userId, userId)))
      .returning();
    return results[0];
  }

  async deleteFolder(id: string, userId: string): Promise<boolean> {
    const results = await this.db
      .delete(schema.folders)
      .where(and(eq(schema.folders.id, id), eq(schema.folders.userId, userId)))
      .returning();
    return results.length > 0;
  }

  async getConversations(userId: string): Promise<Conversation[]> {
    return await this.db
      .select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.userId, userId), isNull(schema.conversations.deletedAt)))
      .orderBy(desc(schema.conversations.updatedAt));
  }

  async getConversation(id: string, userId: string): Promise<Conversation | undefined> {
    const results = await this.db
      .select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)))
      .limit(1);
    return results[0];
  }

  async getConversationsByProject(projectId: string, userId: string): Promise<Conversation[]> {
    return await this.db
      .select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.projectId, projectId), eq(schema.conversations.userId, userId), isNull(schema.conversations.deletedAt)))
      .orderBy(desc(schema.conversations.updatedAt));
  }

  async createConversation(insertConversation: InsertConversation, userId: string): Promise<Conversation> {
    const results = await this.db
      .insert(schema.conversations)
      .values({ userId, ...insertConversation })
      .returning();
    return results[0];
  }

  async updateConversation(
    id: string,
    userId: string,
    data: Partial<InsertConversation>
  ): Promise<Conversation | undefined> {
    const results = await this.db
      .update(schema.conversations)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)))
      .returning();
    return results[0];
  }

  async deleteConversation(id: string, userId: string): Promise<boolean> {
    const results = await this.db
      .delete(schema.conversations)
      .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)))
      .returning();
    return results.length > 0;
  }

  async getMessages(conversationId: string, userId: string): Promise<Message[]> {
    return await this.db
      .select()
      .from(schema.messages)
      .where(and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.userId, userId)))
      .orderBy(schema.messages.createdAt);
  }

  async getAllMessages(userId: string, includeArchived = false): Promise<Message[]> {
    if (includeArchived) {
      return await this.db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.userId, userId));
    }

    // Exclude messages from archived conversations
    return await this.db
      .select({
        id: schema.messages.id,
        conversationId: schema.messages.conversationId,
        userId: schema.messages.userId,
        role: schema.messages.role,
        content: schema.messages.content,
        embedding: schema.messages.embedding,
        createdAt: schema.messages.createdAt,
      })
      .from(schema.messages)
      .innerJoin(schema.conversations, eq(schema.messages.conversationId, schema.conversations.id))
      .where(and(
        eq(schema.messages.userId, userId),
        isNull(schema.conversations.archivedAt)
      ));
  }

  async getAIQueryCount(userId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.messages)
      .where(and(
        eq(schema.messages.userId, userId),
        eq(schema.messages.role, 'assistant')
      ));
    return result[0]?.count || 0;
  }

  async createMessage(insertMessage: InsertMessage, userId: string): Promise<Message> {
    const results = await this.db
      .insert(schema.messages)
      .values({ userId, ...insertMessage })
      .returning();

    await this.db
      .update(schema.conversations)
      .set({ updatedAt: new Date() })
      .where(and(eq(schema.conversations.id, insertMessage.conversationId), eq(schema.conversations.userId, userId)));

    return results[0];
  }

  async updateMessageEmbedding(id: string, userId: string, embedding: string, embeddingVector?: number[]): Promise<void> {
    const updateData: { embedding: string; embeddingVector?: number[] } = { embedding };
    if (embeddingVector) {
      updateData.embeddingVector = embeddingVector;
    }
    await this.db
      .update(schema.messages)
      .set(updateData)
      .where(and(eq(schema.messages.id, id), eq(schema.messages.userId, userId)));
  }

  async getFilesByConversation(conversationId: string, userId: string): Promise<File[]> {
    return await this.db
      .select()
      .from(schema.files)
      .where(and(eq(schema.files.conversationId, conversationId), eq(schema.files.userId, userId), isNull(schema.files.deletedAt)))
      .orderBy(schema.files.createdAt);
  }

  async getFilesByProject(projectId: string, userId: string): Promise<File[]> {
    return await this.db
      .select()
      .from(schema.files)
      .where(and(eq(schema.files.projectId, projectId), eq(schema.files.userId, userId), isNull(schema.files.deletedAt)))
      .orderBy(desc(schema.files.createdAt));
  }

  async getFilesByUser(userId: string): Promise<File[]> {
    return await this.db
      .select()
      .from(schema.files)
      .where(and(eq(schema.files.userId, userId), isNull(schema.files.deletedAt)))
      .orderBy(desc(schema.files.createdAt));
  }

  async getFileById(id: string, userId: string): Promise<File | undefined> {
    const [file] = await this.db
      .select()
      .from(schema.files)
      .where(and(eq(schema.files.id, id), eq(schema.files.userId, userId)));
    return file;
  }

  async createFile(insertFile: InsertFile, userId: string): Promise<File> {
    const results = await this.db
      .insert(schema.files)
      .values({ userId, ...insertFile })
      .returning();
    return results[0];
  }

  async updateFile(id: string, userId: string, data: Partial<InsertFile>): Promise<File | undefined> {
    const results = await this.db
      .update(schema.files)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.files.id, id), eq(schema.files.userId, userId)))
      .returning();
    return results[0];
  }

  async deleteFile(id: string, userId: string): Promise<boolean> {
    const results = await this.db
      .delete(schema.files)
      .where(and(eq(schema.files.id, id), eq(schema.files.userId, userId)))
      .returning();
    return results.length > 0;
  }

  async updateFileEmbedding(id: string, userId: string, embedding: string, embeddingVector?: number[]): Promise<void> {
    const updateData: { embedding: string; embeddingVector?: number[] } = { embedding };
    if (embeddingVector) {
      updateData.embeddingVector = embeddingVector;
    }
    await this.db
      .update(schema.files)
      .set(updateData)
      .where(and(eq(schema.files.id, id), eq(schema.files.userId, userId)));
  }

  async updateFileContent(id: string, userId: string, content: string, size: number): Promise<void> {
    await this.db
      .update(schema.files)
      .set({ content, size, updatedAt: new Date() })
      .where(and(eq(schema.files.id, id), eq(schema.files.userId, userId)));
  }

  async updateUserStripeCustomerId(userId: string, stripeCustomerId: string): Promise<User | undefined> {
    const results = await this.db
      .update(schema.users)
      .set({ stripeCustomerId, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning();
    return results[0];
  }

  async getSubscription(userId: string): Promise<Subscription | undefined> {
    const [subscription] = await this.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId));
    return subscription;
  }

  async createSubscription(insertSubscription: InsertSubscription, userId: string): Promise<Subscription> {
    const results = await this.db
      .insert(schema.subscriptions)
      .values({ userId, ...insertSubscription })
      .returning();
    return results[0];
  }

  async updateSubscription(userId: string, data: Partial<InsertSubscription>): Promise<Subscription | undefined> {
    const results = await this.db
      .update(schema.subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.subscriptions.userId, userId))
      .returning();
    return results[0];
  }

  async getFileChunks(fileId: string, userId: string): Promise<FileChunk[]> {
    return await this.db
      .select()
      .from(schema.fileChunks)
      .where(and(eq(schema.fileChunks.fileId, fileId), eq(schema.fileChunks.userId, userId)))
      .orderBy(schema.fileChunks.chunkIndex);
  }

  async getFileChunksByProject(projectId: string, userId: string): Promise<FileChunk[]> {
    const projectFiles = await this.getFilesByProject(projectId, userId);
    if (projectFiles.length === 0) return [];

    const fileIds = projectFiles.map(f => f.id);
    const allChunks: FileChunk[] = [];
    for (const fileId of fileIds) {
      const chunks = await this.getFileChunks(fileId, userId);
      allChunks.push(...chunks);
    }
    return allChunks;
  }

  async getAllFileChunks(userId: string, includeArchived = false): Promise<FileChunk[]> {
    if (includeArchived) {
      return await this.db
        .select()
        .from(schema.fileChunks)
        .where(eq(schema.fileChunks.userId, userId))
        .orderBy(schema.fileChunks.chunkIndex);
    }

    // Exclude chunks from archived files
    return await this.db
      .select({
        id: schema.fileChunks.id,
        fileId: schema.fileChunks.fileId,
        userId: schema.fileChunks.userId,
        content: schema.fileChunks.content,
        chunkIndex: schema.fileChunks.chunkIndex,
        embedding: schema.fileChunks.embedding,
        attributes: schema.fileChunks.attributes,
        createdAt: schema.fileChunks.createdAt,
      })
      .from(schema.fileChunks)
      .innerJoin(schema.files, eq(schema.fileChunks.fileId, schema.files.id))
      .where(and(
        eq(schema.fileChunks.userId, userId),
        isNull(schema.files.archivedAt)
      ))
      .orderBy(schema.fileChunks.chunkIndex);
  }

  async createFileChunk(chunk: InsertFileChunk): Promise<FileChunk> {
    const results = await this.db
      .insert(schema.fileChunks)
      .values(chunk)
      .returning();
    return results[0];
  }

  async createFileChunks(chunks: InsertFileChunk[]): Promise<FileChunk[]> {
    if (chunks.length === 0) return [];
    const results = await this.db
      .insert(schema.fileChunks)
      .values(chunks)
      .returning();
    return results;
  }

  async deleteFileChunks(fileId: string, userId: string): Promise<boolean> {
    const results = await this.db
      .delete(schema.fileChunks)
      .where(and(eq(schema.fileChunks.fileId, fileId), eq(schema.fileChunks.userId, userId)))
      .returning();
    return results.length > 0;
  }

  async updateFileChunkEmbedding(id: string, embedding: string, embeddingVector?: number[]): Promise<void> {
    const updateData: { embedding: string; embeddingVector?: number[] } = { embedding };
    if (embeddingVector) {
      updateData.embeddingVector = embeddingVector;
    }
    await this.db
      .update(schema.fileChunks)
      .set(updateData)
      .where(eq(schema.fileChunks.id, id));
  }

  async updateFileChunkingStatus(fileId: string, userId: string, status: string): Promise<void> {
    await this.db
      .update(schema.files)
      .set({ chunkingStatus: status, updatedAt: new Date() })
      .where(and(eq(schema.files.id, fileId), eq(schema.files.userId, userId)));
  }

  // Retention policy implementations
  async getRetentionPolicy(plan: string): Promise<RetentionPolicy | undefined> {
    const [policy] = await this.db
      .select()
      .from(schema.retentionPolicies)
      .where(eq(schema.retentionPolicies.plan, plan));
    return policy;
  }

  async createRetentionPolicy(policy: InsertRetentionPolicy): Promise<RetentionPolicy> {
    const [result] = await this.db
      .insert(schema.retentionPolicies)
      .values(policy)
      .returning();
    return result;
  }

  async updateRetentionPolicy(plan: string, data: Partial<InsertRetentionPolicy>): Promise<RetentionPolicy | undefined> {
    const [result] = await this.db
      .update(schema.retentionPolicies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.retentionPolicies.plan, plan))
      .returning();
    return result;
  }

  // Pending notification implementations
  async createPendingNotification(notification: InsertPendingNotification): Promise<PendingNotification> {
    const [result] = await this.db
      .insert(schema.pendingNotifications)
      .values(notification)
      .returning();
    return result;
  }

  async getPendingNotifications(userId: string): Promise<PendingNotification[]> {
    return await this.db
      .select()
      .from(schema.pendingNotifications)
      .where(and(
        eq(schema.pendingNotifications.userId, userId),
        isNull(schema.pendingNotifications.sentAt)
      ))
      .orderBy(schema.pendingNotifications.scheduledFor);
  }

  async markNotificationSent(id: string): Promise<void> {
    await this.db
      .update(schema.pendingNotifications)
      .set({ sentAt: new Date() })
      .where(eq(schema.pendingNotifications.id, id));
  }

  // Audit event implementations
  async createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent> {
    const [result] = await this.db
      .insert(schema.auditEvents)
      .values(event)
      .returning();
    return result;
  }

  async getAuditEvents(userId: string, limit?: number): Promise<AuditEvent[]> {
    let query = this.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.userId, userId))
      .orderBy(desc(schema.auditEvents.createdAt));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    return await query;
  }

  // Expiration/archival implementations
  async getUsersWithExpiringItems(warningDays: number): Promise<{ id: string; email: string; plan: string }[]> {
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() + warningDays);

    const results = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        plan: schema.subscriptions.plan,
      })
      .from(schema.users)
      .innerJoin(schema.subscriptions, eq(schema.users.id, schema.subscriptions.userId))
      .innerJoin(schema.conversations, eq(schema.users.id, schema.conversations.userId))
      .where(
        and(
          isNull(schema.conversations.archivedAt),
          or(
            lt(schema.conversations.lastActivityAt, warningDate),
            lt(schema.conversations.updatedAt, warningDate)
          )
        )
      );

    const uniqueUsers = new Map<string, { id: string; email: string; plan: string }>();
    for (const row of results) {
      if (row.email && !uniqueUsers.has(row.id)) {
        uniqueUsers.set(row.id, { id: row.id, email: row.email, plan: row.plan });
      }
    }
    return Array.from(uniqueUsers.values());
  }

  async getAllUsersWithSubscriptions(): Promise<{ id: string; email: string; plan: string }[]> {
    const results = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        plan: schema.subscriptions.plan,
      })
      .from(schema.users)
      .innerJoin(schema.subscriptions, eq(schema.users.id, schema.subscriptions.userId));

    return results.filter(r => r.email !== null).map(r => ({
      id: r.id,
      email: r.email!,
      plan: r.plan,
    }));
  }

  async getExpiringConversations(userId: string, retentionDays: number, warningDays: number): Promise<{ id: string; name: string }[]> {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() - retentionDays);

    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() - retentionDays + warningDays);

    const results = await this.db
      .select({ id: schema.conversations.id, name: schema.conversations.name })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.userId, userId),
          isNull(schema.conversations.archivedAt),
          or(
            and(
              isNotNull(schema.conversations.lastActivityAt),
              lt(schema.conversations.lastActivityAt, warningDate)
            ),
            and(
              isNull(schema.conversations.lastActivityAt),
              lt(schema.conversations.updatedAt, warningDate)
            )
          )
        )
      );

    return results;
  }

  async getExpiringFiles(userId: string, retentionDays: number, warningDays: number): Promise<{ id: string; originalName: string }[]> {
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() - retentionDays + warningDays);

    const results = await this.db
      .select({ id: schema.files.id, originalName: schema.files.originalName })
      .from(schema.files)
      .where(
        and(
          eq(schema.files.userId, userId),
          isNull(schema.files.archivedAt),
          lt(schema.files.createdAt, warningDate)
        )
      );

    return results;
  }

  async archiveExpiredConversations(userId: string, retentionDays: number): Promise<number> {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() - retentionDays);

    const results = await this.db
      .update(schema.conversations)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(schema.conversations.userId, userId),
          isNull(schema.conversations.archivedAt),
          or(
            and(
              isNotNull(schema.conversations.lastActivityAt),
              lt(schema.conversations.lastActivityAt, expirationDate)
            ),
            and(
              isNull(schema.conversations.lastActivityAt),
              lt(schema.conversations.updatedAt, expirationDate)
            )
          )
        )
      )
      .returning();

    return results.length;
  }

  async archiveExpiredFiles(userId: string, retentionDays: number): Promise<number> {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() - retentionDays);

    const results = await this.db
      .update(schema.files)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(schema.files.userId, userId),
          isNull(schema.files.archivedAt),
          lt(schema.files.createdAt, expirationDate)
        )
      )
      .returning();

    return results.length;
  }

  async deleteArchivedConversations(userId: string, gracePeriodDays: number): Promise<number> {
    const deleteDate = new Date();
    deleteDate.setDate(deleteDate.getDate() - gracePeriodDays);

    const results = await this.db
      .delete(schema.conversations)
      .where(
        and(
          eq(schema.conversations.userId, userId),
          isNotNull(schema.conversations.archivedAt),
          lt(schema.conversations.archivedAt, deleteDate)
        )
      )
      .returning();

    return results.length;
  }

  async deleteArchivedFiles(userId: string, gracePeriodDays: number): Promise<number> {
    const deleteDate = new Date();
    deleteDate.setDate(deleteDate.getDate() - gracePeriodDays);

    const results = await this.db
      .delete(schema.files)
      .where(
        and(
          eq(schema.files.userId, userId),
          isNotNull(schema.files.archivedAt),
          lt(schema.files.archivedAt, deleteDate)
        )
      )
      .returning();

    return results.length;
  }

  async deleteExpiredSessions(): Promise<number> {
    const now = new Date();

    const results = await this.db
      .delete(schema.sessions)
      .where(lt(schema.sessions.expire, now))
      .returning();

    return results.length;
  }

  async restoreConversation(id: string, userId: string): Promise<boolean> {
    const results = await this.db
      .update(schema.conversations)
      .set({ archivedAt: null })
      .where(
        and(
          eq(schema.conversations.id, id),
          eq(schema.conversations.userId, userId),
          isNotNull(schema.conversations.archivedAt)
        )
      )
      .returning();

    return results.length > 0;
  }

  async restoreFile(id: string, userId: string): Promise<boolean> {
    const results = await this.db
      .update(schema.files)
      .set({ archivedAt: null })
      .where(
        and(
          eq(schema.files.id, id),
          eq(schema.files.userId, userId),
          isNotNull(schema.files.archivedAt)
        )
      )
      .returning();

    return results.length > 0;
  }

  async getArchivedConversations(userId: string): Promise<Conversation[]> {
    return await this.db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.userId, userId),
          isNotNull(schema.conversations.archivedAt)
        )
      )
      .orderBy(desc(schema.conversations.archivedAt));
  }

  async getArchivedFiles(userId: string): Promise<File[]> {
    return await this.db
      .select()
      .from(schema.files)
      .where(
        and(
          eq(schema.files.userId, userId),
          isNotNull(schema.files.archivedAt)
        )
      )
      .orderBy(desc(schema.files.archivedAt));
  }

  async getTrashItems(userId: string): Promise<{ files: File[]; folders: Folder[]; conversations: Conversation[] }> {
    const files = await this.db.select().from(schema.files)
      .where(and(eq(schema.files.userId, userId), isNotNull(schema.files.deletedAt)));
    const folders = await this.db.select().from(schema.folders)
      .where(and(eq(schema.folders.userId, userId), isNotNull(schema.folders.deletedAt)));
    const conversations = await this.db.select().from(schema.conversations)
      .where(and(eq(schema.conversations.userId, userId), isNotNull(schema.conversations.deletedAt)));
    return { files, folders, conversations };
  }

  async softDeleteFile(id: string, userId: string): Promise<boolean> {
    const results = await this.db.update(schema.files)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.files.id, id), eq(schema.files.userId, userId)))
      .returning();
    return results.length > 0;
  }

  async softDeleteFolder(id: string, userId: string): Promise<boolean> {
    const deletedAt = new Date();

    // First, mark the folder as deleted
    const results = await this.db.update(schema.folders)
      .set({ deletedAt })
      .where(and(eq(schema.folders.id, id), eq(schema.folders.userId, userId)))
      .returning();

    if (results.length === 0) return false;

    // Cascade: soft delete all files in this folder
    await this.db.update(schema.files)
      .set({ deletedAt })
      .where(and(eq(schema.files.folderId, id), eq(schema.files.userId, userId)));

    // Cascade: soft delete all conversations in this folder
    await this.db.update(schema.conversations)
      .set({ deletedAt })
      .where(and(eq(schema.conversations.folderId, id), eq(schema.conversations.userId, userId)));

    // Cascade: soft delete all subfolders recursively
    const subfolders = await this.db.select({ id: schema.folders.id })
      .from(schema.folders)
      .where(and(eq(schema.folders.parentFolderId, id), eq(schema.folders.userId, userId)));

    for (const subfolder of subfolders) {
      await this.softDeleteFolder(subfolder.id, userId);
    }

    return true;
  }

  async softDeleteConversation(id: string, userId: string): Promise<boolean> {
    const results = await this.db.update(schema.conversations)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)))
      .returning();
    return results.length > 0;
  }

  async restoreFileFromTrash(id: string, userId: string): Promise<boolean> {
    // First get the file to check its folderId
    const fileResult = await this.db.select()
      .from(schema.files)
      .where(and(eq(schema.files.id, id), eq(schema.files.userId, userId), isNotNull(schema.files.deletedAt)))
      .limit(1);

    if (fileResult.length === 0) return false;

    const file = fileResult[0];
    let newFolderId = file.folderId;

    // Check if parent folder is still in trash
    if (file.folderId) {
      const folderResult = await this.db.select({ deletedAt: schema.folders.deletedAt })
        .from(schema.folders)
        .where(eq(schema.folders.id, file.folderId))
        .limit(1);

      // If folder doesn't exist or is in trash, set folderId to null (restore to project root)
      if (folderResult.length === 0 || folderResult[0].deletedAt !== null) {
        newFolderId = null;
      }
    }

    const results = await this.db.update(schema.files)
      .set({ deletedAt: null, folderId: newFolderId })
      .where(and(eq(schema.files.id, id), eq(schema.files.userId, userId), isNotNull(schema.files.deletedAt)))
      .returning();
    return results.length > 0;
  }

  async restoreFolderFromTrash(id: string, userId: string): Promise<boolean> {
    // First get the folder to check its parentFolderId
    const folderResult = await this.db.select()
      .from(schema.folders)
      .where(and(eq(schema.folders.id, id), eq(schema.folders.userId, userId), isNotNull(schema.folders.deletedAt)))
      .limit(1);

    if (folderResult.length === 0) return false;

    const folder = folderResult[0];
    let newParentFolderId = folder.parentFolderId;

    // Check if parent folder is still in trash
    if (folder.parentFolderId) {
      const parentResult = await this.db.select({ deletedAt: schema.folders.deletedAt })
        .from(schema.folders)
        .where(eq(schema.folders.id, folder.parentFolderId))
        .limit(1);

      // If parent folder doesn't exist or is in trash, set parentFolderId to null (restore to project root)
      if (parentResult.length === 0 || parentResult[0].deletedAt !== null) {
        newParentFolderId = null;
      }
    }

    // Restore the folder with potentially updated parentFolderId
    await this.db.update(schema.folders)
      .set({ deletedAt: null, parentFolderId: newParentFolderId })
      .where(eq(schema.folders.id, id));

    // Cascade: restore all files in this folder
    await this.db.update(schema.files)
      .set({ deletedAt: null })
      .where(and(eq(schema.files.folderId, id), eq(schema.files.userId, userId), isNotNull(schema.files.deletedAt)));

    // Cascade: restore all conversations in this folder
    await this.db.update(schema.conversations)
      .set({ deletedAt: null })
      .where(and(eq(schema.conversations.folderId, id), eq(schema.conversations.userId, userId), isNotNull(schema.conversations.deletedAt)));

    // Cascade: restore all subfolders recursively
    const subfolders = await this.db.select({ id: schema.folders.id })
      .from(schema.folders)
      .where(and(eq(schema.folders.parentFolderId, id), eq(schema.folders.userId, userId), isNotNull(schema.folders.deletedAt)));

    for (const subfolder of subfolders) {
      await this.restoreFolderFromTrash(subfolder.id, userId);
    }

    return true;
  }

  async restoreConversationFromTrash(id: string, userId: string): Promise<boolean> {
    // First get the conversation to check its folderId
    const convResult = await this.db.select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId), isNotNull(schema.conversations.deletedAt)))
      .limit(1);

    if (convResult.length === 0) return false;

    const conv = convResult[0];
    let newFolderId = conv.folderId;

    // Check if parent folder is still in trash
    if (conv.folderId) {
      const folderResult = await this.db.select({ deletedAt: schema.folders.deletedAt })
        .from(schema.folders)
        .where(eq(schema.folders.id, conv.folderId))
        .limit(1);

      // If folder doesn't exist or is in trash, set folderId to null (restore to project root)
      if (folderResult.length === 0 || folderResult[0].deletedAt !== null) {
        newFolderId = null;
      }
    }

    const results = await this.db.update(schema.conversations)
      .set({ deletedAt: null, folderId: newFolderId })
      .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId), isNotNull(schema.conversations.deletedAt)))
      .returning();
    return results.length > 0;
  }

  async permanentlyDeleteFile(id: string, userId: string): Promise<boolean> {
    const file = await this.db.select().from(schema.files)
      .where(and(eq(schema.files.id, id), eq(schema.files.userId, userId), isNotNull(schema.files.deletedAt)))
      .limit(1);
    if (file.length === 0) return false;

    await this.db.delete(schema.fileChunks).where(eq(schema.fileChunks.fileId, id));

    const results = await this.db.delete(schema.files)
      .where(and(eq(schema.files.id, id), eq(schema.files.userId, userId)))
      .returning();
    return results.length > 0;
  }

  async permanentlyDeleteFolder(id: string, userId: string): Promise<boolean> {
    const folder = await this.db.select().from(schema.folders)
      .where(and(eq(schema.folders.id, id), eq(schema.folders.userId, userId), isNotNull(schema.folders.deletedAt)))
      .limit(1);
    if (folder.length === 0) return false;

    // First, recursively delete subfolders
    const subfolders = await this.db.select({ id: schema.folders.id })
      .from(schema.folders)
      .where(and(eq(schema.folders.parentFolderId, id), eq(schema.folders.userId, userId)));

    for (const subfolder of subfolders) {
      await this.permanentlyDeleteFolder(subfolder.id, userId);
    }

    // Delete all files in this folder (and their chunks)
    const filesInFolder = await this.db.select({ id: schema.files.id })
      .from(schema.files)
      .where(and(eq(schema.files.folderId, id), eq(schema.files.userId, userId)));

    for (const file of filesInFolder) {
      await this.db.delete(schema.fileChunks).where(eq(schema.fileChunks.fileId, file.id));
    }
    await this.db.delete(schema.files)
      .where(and(eq(schema.files.folderId, id), eq(schema.files.userId, userId)));

    // Delete all conversations in this folder
    await this.db.delete(schema.conversations)
      .where(and(eq(schema.conversations.folderId, id), eq(schema.conversations.userId, userId)));

    // Finally delete the folder itself
    const results = await this.db.delete(schema.folders)
      .where(and(eq(schema.folders.id, id), eq(schema.folders.userId, userId)))
      .returning();
    return results.length > 0;
  }

  async permanentlyDeleteConversation(id: string, userId: string): Promise<boolean> {
    const conv = await this.db.select().from(schema.conversations)
      .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId), isNotNull(schema.conversations.deletedAt)))
      .limit(1);
    if (conv.length === 0) return false;

    const results = await this.db.delete(schema.conversations)
      .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)))
      .returning();
    return results.length > 0;
  }

  async emptyTrash(userId: string): Promise<{ files: number; folders: number; conversations: number }> {
    const trashedFiles = await this.db.select({ id: schema.files.id }).from(schema.files)
      .where(and(eq(schema.files.userId, userId), isNotNull(schema.files.deletedAt)));
    const trashedFolders = await this.db.select({ id: schema.folders.id }).from(schema.folders)
      .where(and(eq(schema.folders.userId, userId), isNotNull(schema.folders.deletedAt)));
    const trashedConversations = await this.db.select({ id: schema.conversations.id }).from(schema.conversations)
      .where(and(eq(schema.conversations.userId, userId), isNotNull(schema.conversations.deletedAt)));

    for (const file of trashedFiles) {
      await this.db.delete(schema.fileChunks).where(eq(schema.fileChunks.fileId, file.id));
    }

    const filesDeleted = await this.db.delete(schema.files)
      .where(and(eq(schema.files.userId, userId), isNotNull(schema.files.deletedAt)))
      .returning();
    const foldersDeleted = await this.db.delete(schema.folders)
      .where(and(eq(schema.folders.userId, userId), isNotNull(schema.folders.deletedAt)))
      .returning();
    const conversationsDeleted = await this.db.delete(schema.conversations)
      .where(and(eq(schema.conversations.userId, userId), isNotNull(schema.conversations.deletedAt)))
      .returning();

    return {
      files: filesDeleted.length,
      folders: foldersDeleted.length,
      conversations: conversationsDeleted.length
    };
  }

  // Google Drive temp file operations
  async createGoogleDriveTempFile(tempFile: InsertGoogleDriveTempFile): Promise<GoogleDriveTempFile> {
    const [created] = await this.db.insert(schema.googleDriveTempFiles).values(tempFile).returning();
    return created;
  }

  async getGoogleDriveTempFile(fileId: string, userId: string): Promise<GoogleDriveTempFile | undefined> {
    const results = await this.db.select().from(schema.googleDriveTempFiles)
      .where(and(eq(schema.googleDriveTempFiles.fileId, fileId), eq(schema.googleDriveTempFiles.userId, userId)))
      .limit(1);
    return results[0];
  }

  async getGoogleDriveTempFileByDriveId(googleDriveFileId: string, userId: string): Promise<GoogleDriveTempFile | undefined> {
    const results = await this.db.select().from(schema.googleDriveTempFiles)
      .where(and(eq(schema.googleDriveTempFiles.googleDriveFileId, googleDriveFileId), eq(schema.googleDriveTempFiles.userId, userId)))
      .limit(1);
    return results[0];
  }

  async updateGoogleDriveTempFile(id: string, userId: string, data: Partial<GoogleDriveTempFile>): Promise<GoogleDriveTempFile | undefined> {
    const [updated] = await this.db.update(schema.googleDriveTempFiles)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.googleDriveTempFiles.id, id), eq(schema.googleDriveTempFiles.userId, userId)))
      .returning();
    return updated;
  }

  async deleteGoogleDriveTempFile(id: string, userId: string): Promise<boolean> {
    const results = await this.db.delete(schema.googleDriveTempFiles)
      .where(and(eq(schema.googleDriveTempFiles.id, id), eq(schema.googleDriveTempFiles.userId, userId)))
      .returning();
    return results.length > 0;
  }

  async deleteExpiredGoogleDriveTempFiles(): Promise<number> {
    const now = new Date();
    const results = await this.db.delete(schema.googleDriveTempFiles)
      .where(lt(schema.googleDriveTempFiles.expiresAt, now))
      .returning();
    return results.length;
  }

  // Helper to get ef_search value - uniform high quality for all tiers
  private getEfSearchValue(subscriptionTier?: string): number {
    // All subscription tiers receive identical highest-quality RAG search
    // Free tier is limited by usage count only, not search quality
    return 200;
  }

  // pgvector-based semantic search operations
  async searchMessagesByVector(
    userId: string,
    queryEmbedding: number[],
    limit: number = 10,
    excludeConversationId?: string,
    includeArchived: boolean = false,
    subscriptionTier?: string
  ): Promise<Array<Message & { similarity: number; conversationId: string }>> {
    const vectorString = `[${queryEmbedding.join(',')}]`;
    const efSearch = this.getEfSearchValue(subscriptionTier);

    let query = `
      SELECT 
        m.*,
        1 - (m.embedding_vector <=> $1::vector) as similarity
      FROM messages m
      INNER JOIN conversations c ON m.conversation_id = c.id
      WHERE m.user_id = $2
        AND m.embedding_vector IS NOT NULL
    `;
    const params: any[] = [vectorString, userId];
    let paramIndex = 3;

    if (excludeConversationId) {
      query += ` AND m.conversation_id != $${paramIndex}`;
      params.push(excludeConversationId);
      paramIndex++;
    }

    if (!includeArchived) {
      query += ` AND c.archived_at IS NULL`;
    }

    query += ` ORDER BY similarity DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const pool = getPgVectorPool();
    const client = await pool.connect();
    try {
      // Set HNSW ef_search for this session (higher = more accurate but slower)
      await client.query(`SET hnsw.ef_search = ${efSearch}`);

      const result = await client.query(query, params);
      return result.rows.map(row => ({
        id: row.id,
        conversationId: row.conversation_id,
        userId: row.user_id,
        role: row.role,
        content: row.content,
        embedding: row.embedding,
        embeddingVector: row.embedding_vector,
        attachments: row.attachments,
        createdAt: row.created_at,
        similarity: parseFloat(row.similarity)
      }));
    } finally {
      client.release();
    }
  }

  async searchFileChunksByVector(
    userId: string,
    queryEmbedding: number[],
    limit: number = 10,
    includeArchived: boolean = false,
    subscriptionTier?: string
  ): Promise<Array<FileChunk & { similarity: number; fileId: string; projectId?: string }>> {
    const vectorString = `[${queryEmbedding.join(',')}]`;
    const efSearch = this.getEfSearchValue(subscriptionTier);

    let query = `
      SELECT 
        fc.*,
        f.project_id,
        1 - (fc.embedding_vector <=> $1::vector) as similarity
      FROM file_chunks fc
      INNER JOIN files f ON fc.file_id = f.id
      WHERE fc.user_id = $2
        AND fc.embedding_vector IS NOT NULL
    `;
    const params: any[] = [vectorString, userId];
    let paramIndex = 3;

    if (!includeArchived) {
      query += ` AND f.archived_at IS NULL AND f.deleted_at IS NULL`;
    }

    query += ` ORDER BY similarity DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const pool = getPgVectorPool();
    const client = await pool.connect();
    try {
      // Set HNSW ef_search for this session (higher = more accurate but slower)
      await client.query(`SET hnsw.ef_search = ${efSearch}`);

      const result = await client.query(query, params);
      return result.rows.map(row => ({
        id: row.id,
        fileId: row.file_id,
        userId: row.user_id,
        content: row.content,
        chunkIndex: row.chunk_index,
        tokenCount: row.token_count,
        embedding: row.embedding,
        embeddingVector: row.embedding_vector,
        metadata: row.metadata,
        attributes: row.attributes,
        createdAt: row.created_at,
        projectId: row.project_id,
        similarity: parseFloat(row.similarity)
      }));
    } finally {
      client.release();
    }
  }

  // Auto-migrate JSON embeddings to pgvector format on startup
  async migrateEmbeddingsToVector(): Promise<{ messages: number; fileChunks: number }> {
    const pool = getPgVectorPool();
    const client = await pool.connect();
    try {
      // Migrate messages
      const messagesResult = await client.query(`
        UPDATE messages 
        SET embedding_vector = embedding::vector 
        WHERE embedding IS NOT NULL AND embedding_vector IS NULL
      `);

      // Migrate file_chunks
      const chunksResult = await client.query(`
        UPDATE file_chunks 
        SET embedding_vector = embedding::vector 
        WHERE embedding IS NOT NULL AND embedding_vector IS NULL
      `);

      const migratedMessages = messagesResult.rowCount || 0;
      const migratedChunks = chunksResult.rowCount || 0;

      if (migratedMessages > 0 || migratedChunks > 0) {
        console.log(`[Embedding Migration] Migrated ${migratedMessages} messages and ${migratedChunks} file chunks to pgvector format`);
      }

      return { messages: migratedMessages, fileChunks: migratedChunks };
    } catch (error) {
      console.error('[Embedding Migration] Failed:', error);
      return { messages: 0, fileChunks: 0 };
    } finally {
      client.release();
    }
  }
}

export const storage = new DatabaseStorage();
