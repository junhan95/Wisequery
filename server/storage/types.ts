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

    // Embedding migration
    migrateEmbeddingsToVector(): Promise<{ messages: number; fileChunks: number }>;
}
