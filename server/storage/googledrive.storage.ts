import { BaseStorage, schema, eq, and, lt } from "./base";
import type { GoogleDriveTempFile, InsertGoogleDriveTempFile } from "@shared/schema";

export class GoogleDriveMixin extends BaseStorage {
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
}
