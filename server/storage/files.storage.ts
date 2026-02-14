import { BaseStorage, schema, eq, desc, and, isNull } from "./base";
import type { File, InsertFile } from "@shared/schema";

export class FilesMixin extends BaseStorage {
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
            .values({ userId, ...insertFile } as any)
            .returning();
        return results[0];
    }

    async updateFile(id: string, userId: string, data: Partial<InsertFile>): Promise<File | undefined> {
        const results = await this.db
            .update(schema.files)
            .set({ ...data, updatedAt: new Date() } as any)
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
}
