import { Router } from "express";
import { isAuthenticated } from "../sessionAuth";
import { storage } from "../storage";
import { expirationScheduler, DEFAULT_RETENTION_POLICIES } from "../scheduler";

const router = Router();

// Get retention policy for a plan
router.get("/admin/retention-policies/:plan", isAuthenticated, async (req, res) => {
    try {
        const { plan } = req.params;
        const policy = await storage.getRetentionPolicy(plan);
        if (policy) {
            res.json(policy);
        } else {
            res.json(DEFAULT_RETENTION_POLICIES[plan] || DEFAULT_RETENTION_POLICIES.free);
        }
    } catch (error) {
        console.error("Error fetching retention policy:", error);
        res.status(500).json({ error: "Failed to fetch retention policy" });
    }
});

// Get all retention policies
router.get("/admin/retention-policies", isAuthenticated, async (req, res) => {
    try {
        res.json(DEFAULT_RETENTION_POLICIES);
    } catch (error) {
        console.error("Error fetching retention policies:", error);
        res.status(500).json({ error: "Failed to fetch retention policies" });
    }
});

// Get archived conversations
router.get("/archived/conversations", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const archived = await storage.getArchivedConversations(userId);
        res.json(archived);
    } catch (error) {
        console.error("Error fetching archived conversations:", error);
        res.status(500).json({ error: "Failed to fetch archived conversations" });
    }
});

// Get archived files
router.get("/archived/files", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const archived = await storage.getArchivedFiles(userId);
        res.json(archived);
    } catch (error) {
        console.error("Error fetching archived files:", error);
        res.status(500).json({ error: "Failed to fetch archived files" });
    }
});

// Restore conversation from archive
router.post("/conversations/:id/restore", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { id } = req.params;

        const restored = await storage.restoreConversation(id, userId);
        if (restored) {
            await storage.createAuditEvent({
                userId,
                action: 'restore',
                entityType: 'conversation',
                entityId: id,
            });
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Conversation not found or not archived" });
        }
    } catch (error) {
        console.error("Error restoring conversation:", error);
        res.status(500).json({ error: "Failed to restore conversation" });
    }
});

// Get audit events
router.get("/audit-events", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const limit = parseInt(req.query.limit as string) || 50;
        const events = await storage.getAuditEvents(userId, limit);
        res.json(events);
    } catch (error) {
        console.error("Error fetching audit events:", error);
        res.status(500).json({ error: "Failed to fetch audit events" });
    }
});

// Get pending notifications
router.get("/notifications", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const notifications = await storage.getPendingNotifications(userId);
        res.json(notifications);
    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ error: "Failed to fetch notifications" });
    }
});

// Run maintenance
router.post("/admin/run-maintenance", isAuthenticated, async (req, res) => {
    try {
        expirationScheduler.runDailyMaintenance();
        res.json({ success: true, message: "Maintenance job started" });
    } catch (error) {
        console.error("Error starting maintenance:", error);
        res.status(500).json({ error: "Failed to start maintenance" });
    }
});

// Migrate embeddings to pgvector format
router.post("/embeddings/migrate", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;

        const pool = new (await import("@neondatabase/serverless")).Pool({
            connectionString: process.env.DATABASE_URL
        });

        let messagesConverted = 0;
        let chunksConverted = 0;
        let filesConverted = 0;

        const messagesResult = await pool.query(`
      UPDATE messages 
      SET embedding_vector = embedding::vector 
      WHERE user_id = $1 
        AND embedding IS NOT NULL 
        AND embedding_vector IS NULL
      RETURNING id
    `, [userId]);
        messagesConverted = messagesResult.rowCount || 0;

        const chunksResult = await pool.query(`
      UPDATE file_chunks 
      SET embedding_vector = embedding::vector 
      WHERE user_id = $1 
        AND embedding IS NOT NULL 
        AND embedding_vector IS NULL
      RETURNING id
    `, [userId]);
        chunksConverted = chunksResult.rowCount || 0;

        const filesResult = await pool.query(`
      UPDATE files 
      SET embedding_vector = embedding::vector 
      WHERE user_id = $1 
        AND embedding IS NOT NULL 
        AND embedding_vector IS NULL
      RETURNING id
    `, [userId]);
        filesConverted = filesResult.rowCount || 0;

        await pool.end();

        console.log(`[Embedding Migration] User ${userId}: ${messagesConverted} messages, ${chunksConverted} chunks, ${filesConverted} files converted`);

        res.json({
            success: true,
            messagesConverted,
            chunksConverted,
            filesConverted,
            message: `Migrated ${messagesConverted} messages, ${chunksConverted} file chunks, ${filesConverted} files to pgvector format`
        });
    } catch (error) {
        console.error("Error migrating embeddings:", error);
        res.status(500).json({ error: "Failed to migrate embeddings" });
    }
});

export default router;
