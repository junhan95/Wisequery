import { Router } from "express";
import { isAuthenticated } from "../sessionAuth";
import { storage } from "../storage";
import { upload } from "../utils/uploadConfig";

const router = Router();

// Get current user
// req.user is already the fresh user object fetched from DB by deserializeUser
router.get("/auth/user", isAuthenticated, (req, res) => {
    res.json(req.user);
});

// Update profile
router.patch("/auth/profile", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const { firstName, lastName, department, jobTitle, phone } = req.body;

        const updateData: Record<string, any> = {};
        if (firstName !== undefined) updateData.firstName = firstName;
        if (lastName !== undefined) updateData.lastName = lastName;
        if (department !== undefined) updateData.department = department;
        if (jobTitle !== undefined) updateData.jobTitle = jobTitle;
        if (phone !== undefined) updateData.phone = phone;

        const updated = await storage.updateUser(userId, updateData);

        if (!updated) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: "Failed to update profile" });
    }
});

// Upload profile image
router.post("/auth/profile/image", isAuthenticated, upload.single("file"), async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;

        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const profileImageUrl = `/uploads/${req.file.filename}`;
        const updated = await storage.updateUser(userId, { profileImageUrl });

        if (!updated) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json({ profileImageUrl, user: updated });
    } catch (error) {
        res.status(500).json({ error: "Failed to upload profile image" });
    }
});

// Logout
router.get("/logout", (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error("Logout error:", err);
            return res.status(500).json({ error: "Failed to logout" });
        }
        req.session.destroy((err) => {
            if (err) {
                console.error("Session destroy error:", err);
            }
            // Cookie options must match those used at creation time for the browser
            // to correctly remove the cookie (sameSite + secure must align).
            res.clearCookie("connect.sid", {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
            });
            res.redirect("/");
        });
    });
});

export default router;

