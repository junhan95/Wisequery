import { Router } from "express";
import { isAuthenticated } from "../sessionAuth";
import { storage } from "../storage";
import { insertProjectSchema } from "@shared/schema";
import { z } from "zod";
import { PLAN_LIMITS } from "../stripe";

const router = Router();

// List projects
router.get("/projects", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const projects = await storage.getProjects(userId);
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch projects" });
    }
});

// Create project
router.post("/projects", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;

        const subscription = await storage.getSubscription(userId);
        const plan = (subscription?.plan || "free") as keyof typeof PLAN_LIMITS;
        const planLimit = PLAN_LIMITS[plan]?.projects ?? PLAN_LIMITS.free.projects;

        if (planLimit > 0) {
            const existingProjects = await storage.getProjects(userId);
            if (existingProjects.length >= planLimit) {
                return res.status(403).json({
                    error: `Plan limit reached. You can have up to ${planLimit} projects on the ${plan} plan.`,
                    limitType: "projects",
                    currentPlan: plan,
                    limit: planLimit,
                    current: existingProjects.length
                });
            }
        }

        const data = insertProjectSchema.parse(req.body);
        const project = await storage.createProject(data, userId);
        res.json(project);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.errors });
        } else {
            res.status(500).json({ error: "Failed to create project" });
        }
    }
});

// Update project
router.patch("/projects/:id", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { id } = req.params;
        const updateSchema = z.object({
            name: z.string().optional(),
            order: z.number().optional(),
        });
        const data = updateSchema.parse(req.body);
        const project = await storage.updateProject(id, userId, data);
        if (!project) {
            res.status(404).json({ error: "Project not found" });
            return;
        }
        res.json(project);
    } catch (error) {
        const { id } = req.params;
        console.error(`[PATCH /api/projects/${id}] Error:`, error);
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.errors });
        } else {
            res.status(500).json({ error: "Failed to update project" });
        }
    }
});

// Delete project
router.delete("/projects/:id", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { id } = req.params;
        const deleted = await storage.deleteProject(id, userId);
        if (!deleted) {
            res.status(404).json({ error: "Project not found" });
            return;
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete project" });
    }
});

export default router;
