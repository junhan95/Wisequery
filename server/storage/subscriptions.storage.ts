import { BaseStorage, schema, eq, and, isNull } from "./base";
import type { Subscription, InsertSubscription, FileChunk, InsertFileChunk } from "@shared/schema";

export class SubscriptionsMixin extends BaseStorage {
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
}

export class FileChunksMixin extends BaseStorage {
    async getFileChunks(fileId: string, userId: string): Promise<FileChunk[]> {
        return await this.db
            .select()
            .from(schema.fileChunks)
            .where(and(eq(schema.fileChunks.fileId, fileId), eq(schema.fileChunks.userId, userId)))
            .orderBy(schema.fileChunks.chunkIndex);
    }

    async getFileChunksByProject(projectId: string, userId: string): Promise<FileChunk[]> {
        // This method depends on getFilesByProject — handled in composed class
        const projectFiles = await this.db
            .select()
            .from(schema.files)
            .where(and(eq(schema.files.projectId, projectId), eq(schema.files.userId, userId), isNull(schema.files.deletedAt)));
        if (projectFiles.length === 0) return [];

        const allChunks: FileChunk[] = [];
        for (const file of projectFiles) {
            const chunks = await this.getFileChunks(file.id, userId);
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
                tokenCount: schema.fileChunks.tokenCount,
                embedding: schema.fileChunks.embedding,
                embeddingVector: schema.fileChunks.embeddingVector,
                metadata: schema.fileChunks.metadata,
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
            .values(chunk as any)
            .returning();
        return results[0];
    }

    async createFileChunks(chunks: InsertFileChunk[]): Promise<FileChunk[]> {
        if (chunks.length === 0) return [];
        const results = await this.db
            .insert(schema.fileChunks)
            .values(chunks as any)
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
}
