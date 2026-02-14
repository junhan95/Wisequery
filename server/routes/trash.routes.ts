import { Router } from "express";
import { isAuthenticated } from "../sessionAuth";
import { storage } from "../storage";
import path from "path";
import { promises as fs } from "fs";
import { supabaseStorageService } from "../supabaseStorage";
import { isObjectStoragePath } from "../utils/fileProcessing";

const router = Router();

// Get all trashed items
router.get("/trash", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const trashItems = await storage.getTrashItems(userId);
        res.json(trashItems);
    } catch (error) {
        console.error("Error fetching trash items:", error);
        res.status(500).json({ error: "Failed to fetch trash items" });
    }
});

// Restore file from trash
router.post("/trash/files/:id/restore", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { id } = req.params;

        const restored = await storage.restoreFileFromTrash(id, userId);
        if (restored) {
            await storage.createAuditEvent({
                userId,
                action: 'restore',
                entityType: 'file',
                entityId: id,
            });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "File not found in trash" });
        }
    } catch (error) {
        console.error("Error restoring file from trash:", error);
        res.status(500).json({ error: "Failed to restore file" });
    }
});

// Restore folder from trash
router.post("/trash/folders/:id/restore", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { id } = req.params;

        const restored = await storage.restoreFolderFromTrash(id, userId);
        if (restored) {
            await storage.createAuditEvent({
                userId,
                action: 'restore',
                entityType: 'folder',
                entityId: id,
            });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Folder not found in trash" });
        }
    } catch (error) {
        console.error("Error restoring folder from trash:", error);
        res.status(500).json({ error: "Failed to restore folder" });
    }
});

// Restore conversation from trash
router.post("/trash/conversations/:id/restore", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { id } = req.params;

        const restored = await storage.restoreConversationFromTrash(id, userId);
        if (restored) {
            await storage.createAuditEvent({
                userId,
                action: 'restore',
                entityType: 'conversation',
                entityId: id,
            });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Conversation not found in trash" });
        }
    } catch (error) {
        console.error("Error restoring conversation from trash:", error);
        res.status(500).json({ error: "Failed to restore conversation" });
    }
});

// Permanently delete file from trash
router.delete("/trash/files/:id", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { id } = req.params;

        const trashItems = await storage.getTrashItems(userId);
        const file = trashItems.files.find(f => f.id === id);

        if (!file) {
            res.status(404).json({ error: "File not found in trash" });
            return;
        }

        if (isObjectStoragePath(file.filename)) {
            try {
                await supabaseStorageService.deleteObject(file.filename);
            } catch (error) {
                console.error(`Failed to delete Object Storage file ${file.filename}:`, error);
            }
        } else {
            const filePath = path.join(process.cwd(), "uploads", file.filename);
            try {
                await fs.unlink(filePath);
            } catch (error) {
                console.error(`Failed to delete physical file ${file.filename}:`, error);
            }
        }

        const deleted = await storage.permanentlyDeleteFile(id, userId);
        if (deleted) {
            await storage.createAuditEvent({
                userId,
                action: 'delete',
                entityType: 'file',
                entityId: id,
            });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "File not found in trash" });
        }
    } catch (error) {
        console.error("Error permanently deleting file:", error);
        res.status(500).json({ error: "Failed to delete file permanently" });
    }
});

// Permanently delete folder from trash
router.delete("/trash/folders/:id", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { id } = req.params;

        const trashItems = await storage.getTrashItems(userId);

        const getFolderAndSubfolderIds = (folderId: string): string[] => {
            const ids = [folderId];
            for (const folder of trashItems.folders) {
                if (folder.parentFolderId === folderId) {
                    ids.push(...getFolderAndSubfolderIds(folder.id));
                }
            }
            return ids;
        };

        const folderIds = getFolderAndSubfolderIds(id);

        for (const file of trashItems.files) {
            if (file.folderId && folderIds.includes(file.folderId)) {
                if (isObjectStoragePath(file.filename)) {
                    try {
                        await supabaseStorageService.deleteObject(file.filename);
                    } catch (error) {
                        console.error(`Failed to delete Object Storage file ${file.filename}:`, error);
                    }
                } else {
                    const filePath = path.join(process.cwd(), "uploads", file.filename);
                    try {
                        await fs.unlink(filePath);
                    } catch (error) {
                        console.error(`Failed to delete physical file ${file.filename}:`, error);
                    }
                }
            }
        }

        const deleted = await storage.permanentlyDeleteFolder(id, userId);
        if (deleted) {
            await storage.createAuditEvent({
                userId,
                action: 'delete',
                entityType: 'folder',
                entityId: id,
            });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Folder not found in trash" });
        }
    } catch (error) {
        console.error("Error permanently deleting folder:", error);
        res.status(500).json({ error: "Failed to delete folder permanently" });
    }
});

// Permanently delete conversation from trash
router.delete("/trash/conversations/:id", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { id } = req.params;

        const deleted = await storage.permanentlyDeleteConversation(id, userId);
        if (deleted) {
            await storage.createAuditEvent({
                userId,
                action: 'delete',
                entityType: 'conversation',
                entityId: id,
            });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Conversation not found in trash" });
        }
    } catch (error) {
        console.error("Error permanently deleting conversation:", error);
        res.status(500).json({ error: "Failed to delete conversation permanently" });
    }
});

// Empty entire trash
router.post("/trash/empty", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;

        const trashItems = await storage.getTrashItems(userId);

        for (const file of trashItems.files) {
            if (isObjectStoragePath(file.filename)) {
                try {
                    await supabaseStorageService.deleteObject(file.filename);
                } catch (error) {
                    console.error(`Failed to delete Object Storage file ${file.filename}:`, error);
                }
            } else {
                const filePath = path.join(process.cwd(), "uploads", file.filename);
                try {
                    await fs.unlink(filePath);
                } catch (error) {
                    console.error(`Failed to delete physical file ${file.filename}:`, error);
                }
            }
        }

        const result = await storage.emptyTrash(userId);

        await storage.createAuditEvent({
            userId,
            action: 'delete',
            entityType: 'trash',
            entityId: 'all',
        });

        res.json({
            success: true,
            deleted: result
        });
    } catch (error) {
        console.error("Error emptying trash:", error);
        res.status(500).json({ error: "Failed to empty trash" });
    }
});

export default router;
