import { Router } from "express";
import { isAuthenticated } from "../sessionAuth";
import { storage } from "../storage";
import { insertFolderSchema } from "@shared/schema";
import { z } from "zod";

const router = Router();

// List all folders
router.get("/folders", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const folders = await storage.getFolders(userId);
        res.json(folders);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch folders" });
    }
});

// List folders by project
router.get("/projects/:projectId/folders", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { projectId } = req.params;
        const folders = await storage.getFoldersByProject(projectId, userId);
        res.json(folders);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch folders" });
    }
});

// Create folder
router.post("/folders", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const data = insertFolderSchema.parse(req.body);
        const folder = await storage.createFolder(data, userId);
        res.json(folder);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.errors });
        } else {
            res.status(500).json({ error: "Failed to create folder" });
        }
    }
});

// Update folder
router.patch("/folders/:id", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { id } = req.params;
        const updateSchema = z.object({
            name: z.string().optional(),
            order: z.number().optional(),
            projectId: z.string().optional(),
            parentFolderId: z.string().nullable().optional(),
        });
        const data = updateSchema.parse(req.body);

        // Get the current folder to check if projectId is changing
        const currentFolder = await storage.getFolder(id, userId);
        if (!currentFolder) {
            res.status(404).json({ error: "Folder not found" });
            return;
        }

        // If projectId is changing, collect all affected folder/conversation IDs BEFORE any updates
        let descendantFolderIds: string[] = [];
        let affectedConversationIds: string[] = [];

        if (data.projectId && data.projectId !== currentFolder.projectId) {
            const allFolders = await storage.getFolders(userId);
            const allConversations = await storage.getConversations(userId);

            // Helper function to recursively find all descendant folder IDs
            const findDescendants = (parentId: string, folderList: typeof allFolders): string[] => {
                const descendants: string[] = [];
                const children = folderList.filter(f => f.parentFolderId === parentId);
                for (const child of children) {
                    descendants.push(child.id);
                    descendants.push(...findDescendants(child.id, folderList));
                }
                return descendants;
            };

            descendantFolderIds = findDescendants(id, allFolders);

            const allAffectedFolderIds = [id, ...descendantFolderIds];
            affectedConversationIds = allConversations
                .filter(conv => conv.folderId && allAffectedFolderIds.includes(conv.folderId))
                .map(conv => conv.id);
        }

        // Now update the main folder
        const folder = await storage.updateFolder(id, userId, data);
        if (!folder) {
            res.status(404).json({ error: "Folder not found" });
            return;
        }

        // If projectId changed, cascade update to descendants
        if (data.projectId && data.projectId !== currentFolder.projectId) {
            const newProjectId = data.projectId;

            for (const descendantId of descendantFolderIds) {
                await storage.updateFolder(descendantId, userId, { projectId: newProjectId });
            }

            for (const convId of affectedConversationIds) {
                await storage.updateConversation(convId, userId, { projectId: newProjectId });
            }
        }

        res.json(folder);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.errors });
        } else {
            res.status(500).json({ error: "Failed to update folder" });
        }
    }
});

// Delete folder (soft delete)
router.delete("/folders/:id", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { id } = req.params;
        const deleted = await storage.softDeleteFolder(id, userId);
        if (!deleted) {
            res.status(404).json({ error: "Folder not found" });
            return;
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete folder" });
    }
});

export default router;
