import { BaseStorage, schema, eq, and, isNotNull } from "./base";
import type { File, Folder, Conversation } from "@shared/schema";

export class TrashMixin extends BaseStorage {
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
}
