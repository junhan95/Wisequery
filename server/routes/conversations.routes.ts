import { Router } from "express";
import { isAuthenticated } from "../sessionAuth";
import { storage } from "../storage";
import { insertConversationSchema } from "@shared/schema";
import { z } from "zod";
import { PLAN_LIMITS } from "../stripe";

const router = Router();

// List conversations
router.get("/conversations", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const conversations = await storage.getConversations(userId);
        res.json(conversations);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch conversations" });
    }
});

// Create conversation
router.post("/conversations", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;

        const subscription = await storage.getSubscription(userId);
        const plan = (subscription?.plan || "free") as keyof typeof PLAN_LIMITS;
        const planLimit = PLAN_LIMITS[plan]?.conversations ?? PLAN_LIMITS.free.conversations;

        if (planLimit > 0) {
            const existingConversations = await storage.getConversations(userId);
            if (existingConversations.length >= planLimit) {
                return res.status(403).json({
                    error: `Plan limit reached. You can have up to ${planLimit} conversations on the ${plan} plan.`,
                    limitType: "conversations",
                    currentPlan: plan,
                    limit: planLimit,
                    current: existingConversations.length
                });
            }
        }

        const data = insertConversationSchema.parse(req.body);
        const conversation = await storage.createConversation(data, userId);
        res.json(conversation);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.errors });
        } else {
            res.status(500).json({ error: "Failed to create conversation" });
        }
    }
});

// Update conversation
router.patch("/conversations/:id", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { id } = req.params;
        const data = insertConversationSchema.partial().parse(req.body);
        const conversation = await storage.updateConversation(id, userId, data);
        if (!conversation) {
            res.status(404).json({ error: "Conversation not found" });
            return;
        }
        res.json(conversation);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.errors });
        } else {
            res.status(500).json({ error: "Failed to update conversation" });
        }
    }
});

// Delete conversation (soft delete)
router.delete("/conversations/:id", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { id } = req.params;
        const deleted = await storage.softDeleteConversation(id, userId);
        if (!deleted) {
            res.status(404).json({ error: "Conversation not found" });
            return;
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete conversation" });
    }
});

export default router;
