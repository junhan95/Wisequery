import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, index, customType } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Custom pgvector type for embedding vectors
// text-embedding-3-small produces 1536-dimensional vectors
export const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    // Parse PostgreSQL vector format: [1,2,3,...]
    const cleaned = value.replace(/[\[\]]/g, "");
    return cleaned ? cleaned.split(",").map(Number) : [];
  },
});

// Attachment type for messages
export interface Attachment {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

// Session storage table
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  password: varchar("password"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  emailVerified: timestamp("email_verified"),
  authProvider: varchar("auth_provider").default("email"),
  stripeCustomerId: varchar("stripe_customer_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const projects = pgTable(
  "projects",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    order: integer("order").notNull().default(0),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("IDX_projects_user_id").on(table.userId),
    index("IDX_projects_user_created").on(table.userId, table.createdAt),
  ],
);

export const folders = pgTable("folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  parentFolderId: varchar("parent_folder_id").references((): any => folders.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  order: integer("order").notNull().default(0),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const conversations = pgTable(
  "conversations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    folderId: varchar("folder_id").references(() => folders.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    instructions: text("instructions"),
    archivedAt: timestamp("archived_at"),
    deletedAt: timestamp("deleted_at"),
    lastActivityAt: timestamp("last_activity_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("IDX_conversations_user_id").on(table.userId),
    index("IDX_conversations_project_id").on(table.projectId),
    index("IDX_conversations_user_project").on(table.userId, table.projectId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    embedding: text("embedding"), // Legacy: JSON string format
    embeddingVector: vector("embedding_vector"), // pgvector: native vector type for fast similarity search
    attachments: jsonb("attachments").$type<Attachment[] | null>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("IDX_messages_user_id").on(table.userId),
    index("IDX_messages_conversation_id").on(table.conversationId),
    index("IDX_messages_user_conversation").on(table.userId, table.conversationId),
  ],
);

export const files = pgTable(
  "files",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    folderId: varchar("folder_id").references(() => folders.id, { onDelete: "set null" }),
    conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    filename: varchar("filename").notNull(),
    originalName: varchar("original_name").notNull(),
    mimeType: varchar("mime_type").notNull(),
    size: integer("size").notNull(),
    content: text("content"),
    embedding: text("embedding"), // Legacy: JSON string format
    embeddingVector: vector("embedding_vector"), // pgvector: native vector type
    chunkingStatus: varchar("chunking_status").default("pending"),
    archivedAt: timestamp("archived_at"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("IDX_files_user_id").on(table.userId),
    index("IDX_files_project_id").on(table.projectId),
    index("IDX_files_user_project").on(table.userId, table.projectId),
  ],
);

// Chunk attributes for filtering (OpenAI Vector Store compatible)
export interface ChunkAttributes {
  projectId?: string;
  projectName?: string;
  fileName?: string;
  fileType?: string;
  mimeType?: string;
  uploadedAt?: number; // Unix timestamp
  folderId?: string;
  folderName?: string;
  [key: string]: string | number | boolean | undefined;
}

export const fileChunks = pgTable(
  "file_chunks",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    fileId: varchar("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count").notNull(),
    embedding: text("embedding"), // Legacy: JSON string format
    embeddingVector: vector("embedding_vector"), // pgvector: native vector type
    metadata: jsonb("metadata").$type<{ startChar?: number; endChar?: number; }>(),
    attributes: jsonb("attributes").$type<ChunkAttributes>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("IDX_file_chunks_user_id").on(table.userId),
    index("IDX_file_chunks_file_id").on(table.fileId),
    index("IDX_file_chunks_user_file").on(table.userId, table.fileId),
  ],
);

export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  plan: varchar("plan").notNull().default("free"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  stripeStatus: varchar("stripe_status"),
  stripePriceId: varchar("stripe_price_id"),
  stripeCurrentPeriodEnd: timestamp("stripe_current_period_end"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verificationCodes = pgTable("verification_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull(),
  code: varchar("code").notNull(),
  type: varchar("type").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Retention policies per subscription plan
export const retentionPolicies = pgTable("retention_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  plan: varchar("plan").notNull().unique(),
  conversationRetentionDays: integer("conversation_retention_days").notNull().default(30),
  fileRetentionDays: integer("file_retention_days").notNull().default(60),
  sessionRetentionDays: integer("session_retention_days").notNull().default(7),
  archiveGracePeriodDays: integer("archive_grace_period_days").notNull().default(30),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Pending notifications for expiration warnings
export const pendingNotifications = pgTable("pending_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type").notNull(),
  entityType: varchar("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  entityName: varchar("entity_name"),
  scheduledFor: timestamp("scheduled_for").notNull(),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Audit events for compliance and tracking
export const auditEvents = pgTable("audit_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action").notNull(),
  entityType: varchar("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  entityName: varchar("entity_name"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Google Drive temporary files for Office document editing
export const googleDriveTempFiles = pgTable("google_drive_temp_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileId: varchar("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  googleDriveFileId: varchar("google_drive_file_id").notNull(),
  googleMimeType: varchar("google_mime_type").notNull(),
  editUrl: varchar("edit_url").notNull(),
  status: varchar("status").notNull().default("editing"), // editing, synced, expired
  lastSyncedAt: timestamp("last_synced_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  userId: true,
  order: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFolderSchema = createInsertSchema(folders).omit({
  id: true,
  userId: true,
  order: true,
  createdAt: true,
  updatedAt: true,
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

const attachmentSchema = z.object({
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  size: z.number(),
  url: z.string(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  userId: true,
  createdAt: true,
  embedding: true,
  attachments: true,
}).extend({
  attachments: z.array(attachmentSchema).optional(),
});

export const insertFileSchema = createInsertSchema(files).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  embedding: true,
});

export const insertFileChunkSchema = createInsertSchema(fileChunks).omit({
  id: true,
  createdAt: true,
  embedding: true,
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  stripeSubscriptionId: z.string().nullable().optional(),
  stripePriceId: z.string().nullable().optional(),
  stripeStatus: z.string().nullable().optional(),
  stripeCurrentPeriodEnd: z.date().nullable().optional(),
});

export const insertVerificationCodeSchema = createInsertSchema(verificationCodes).omit({
  id: true,
  createdAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export type InsertVerificationCode = z.infer<typeof insertVerificationCodeSchema>;
export type VerificationCode = typeof verificationCodes.$inferSelect;

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

export type InsertFolder = z.infer<typeof insertFolderSchema>;
export interface Folder {
  id: string;
  userId: string;
  projectId: string;
  parentFolderId: string | null;
  name: string;
  order: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export type InsertFile = z.infer<typeof insertFileSchema>;
export type File = typeof files.$inferSelect;

export type InsertFileChunk = z.infer<typeof insertFileChunkSchema>;
export type FileChunk = typeof fileChunks.$inferSelect;

export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

export const insertRetentionPolicySchema = createInsertSchema(retentionPolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPendingNotificationSchema = createInsertSchema(pendingNotifications).omit({
  id: true,
  createdAt: true,
  sentAt: true,
});

export const insertAuditEventSchema = createInsertSchema(auditEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertRetentionPolicy = z.infer<typeof insertRetentionPolicySchema>;
export type RetentionPolicy = typeof retentionPolicies.$inferSelect;

export type InsertPendingNotification = z.infer<typeof insertPendingNotificationSchema>;
export type PendingNotification = typeof pendingNotifications.$inferSelect;

export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;
export type AuditEvent = typeof auditEvents.$inferSelect;

export const insertGoogleDriveTempFileSchema = createInsertSchema(googleDriveTempFiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSyncedAt: true,
});

export type InsertGoogleDriveTempFile = z.infer<typeof insertGoogleDriveTempFileSchema>;
export type GoogleDriveTempFile = typeof googleDriveTempFiles.$inferSelect;

export interface ChatRequest {
  conversationId: string;
  message: string;
}

export interface SearchResult {
  messageId: string;
  conversationId: string;
  conversationName: string;
  projectName: string;
  role: string;
  messageContent: string;
  similarity: number;
  createdAt: string;
  matchType: 'exact' | 'semantic' | 'file_chunk';
  pairedMessage?: {
    role: string;
    content: string;
    createdAt: string;
  };
}
