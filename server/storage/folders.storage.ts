import { BaseStorage, schema, eq, and, max, isNull } from "./base";
import type { Folder, InsertFolder } from "@shared/schema";

export class FoldersMixin extends BaseStorage {
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
}
