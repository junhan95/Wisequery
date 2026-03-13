import { Router } from "express";
import { isAuthenticated } from "../sessionAuth";
import { storage } from "../storage";
import { upload } from "../utils/uploadConfig";
import { sendSmsVerificationCode, generateVerificationCode } from "../services/sms.service";

const router = Router();

// Get current user
router.get("/auth/user", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const userId = user.id;
        const userInfo = await storage.getUser(userId);
        res.json(userInfo);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch user info" });
    }
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

// ─── 휴대폰 인증 ───────────────────────────────────────────────────────────────

// 인증번호 전송 (로그인 후 전화번호 미인증 사용자)
router.post("/auth/phone/send", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const { phone } = req.body;

        if (!phone || !/^(010|011|016|017|018|019)[0-9]{7,8}$/.test(phone.replace(/[^0-9]/g, ""))) {
            return res.status(400).json({ error: "올바른 휴대폰 번호를 입력해주세요." });
        }

        const normalized = phone.replace(/[^0-9]/g, "");

        // 이미 다른 사용자가 사용 중인 번호인지 확인 (단, 본인 번호는 허용)
        const existingUser = await storage.getUserByPhone(normalized);
        if (existingUser && existingUser.id !== user.id && existingUser.phoneVerified) {
            // 동일 번호로 인증된 계정이 있음 → 이후 verify 단계에서 병합
            // 여기서는 차단하지 않고 진행
        }

        const code = generateVerificationCode();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5분

        await storage.createPhoneVerification(normalized, code, expiresAt);
        await sendSmsVerificationCode(normalized, code);

        res.json({ message: "인증번호를 전송했습니다." });
    } catch (error: any) {
        console.error("SMS 전송 오류:", error);
        res.status(500).json({ error: error.message || "SMS 전송 중 오류가 발생했습니다." });
    }
});

// 인증번호 확인 및 계정 연동
router.post("/auth/phone/verify", isAuthenticated, async (req, res) => {
    try {
        const currentUser = req.user as any;
        const { phone, code } = req.body;

        if (!phone || !code) {
            return res.status(400).json({ error: "전화번호와 인증번호를 입력해주세요." });
        }

        const normalized = phone.replace(/[^0-9]/g, "");
        const verification = await storage.getPhoneVerification(normalized);

        if (!verification) {
            return res.status(400).json({ error: "인증번호를 먼저 요청해주세요." });
        }

        if (new Date() > verification.expiresAt) {
            await storage.deletePhoneVerification(normalized);
            return res.status(400).json({ error: "인증번호가 만료되었습니다. 다시 요청해주세요." });
        }

        if (verification.code !== code) {
            return res.status(400).json({ error: "인증번호가 올바르지 않습니다." });
        }

        // 인증 성공 → OTP 레코드 삭제
        await storage.deletePhoneVerification(normalized);

        // 동일 전화번호로 이미 인증된 기존 계정이 있는지 확인
        const existingPhoneUser = await storage.getUserByPhone(normalized);

        if (existingPhoneUser && existingPhoneUser.id !== currentUser.id) {
            // ── 계정 병합 ──────────────────────────────────────────────────────────
            // currentUser(새 OAuth 계정) → existingPhoneUser(기존 전화 인증 계정)으로 병합
            // 새 OAuth provider를 기존 계정의 social_account로 연결
            await storage.createSocialAccount(
                existingPhoneUser.id,
                currentUser.authProvider,
                currentUser.email
            );

            // 새 계정의 social_accounts도 기존 계정으로 재배정
            await storage.reassignSocialAccounts(currentUser.id, existingPhoneUser.id);

            // 새 계정 삭제 (cascade로 관련 데이터도 정리)
            await storage.deleteUser(currentUser.id);

            // 기존 계정으로 재로그인
            const mergedUser = await storage.getUser(existingPhoneUser.id);
            if (!mergedUser) {
                return res.status(500).json({ error: "계정 병합 중 오류가 발생했습니다." });
            }

            req.login(mergedUser, (err) => {
                if (err) return res.status(500).json({ error: "로그인 갱신 실패" });
                res.json({ merged: true, user: mergedUser });
            });
        } else {
            // ── 신규 전화번호: 현재 계정에 저장 ──────────────────────────────────────
            const updatedUser = await storage.updateUser(currentUser.id, {
                phone: normalized,
                phoneVerified: true,
            });

            // social_accounts에도 현재 provider 등록
            await storage.createSocialAccount(
                currentUser.id,
                currentUser.authProvider,
                currentUser.email
            );

            req.login(updatedUser!, (err) => {
                if (err) return res.status(500).json({ error: "로그인 갱신 실패" });
                res.json({ merged: false, user: updatedUser });
            });
        }
    } catch (error: any) {
        console.error("인증번호 확인 오류:", error);
        res.status(500).json({ error: error.message || "인증 처리 중 오류가 발생했습니다." });
    }
});

// 연결된 소셜 계정 목록 조회
router.get("/auth/social-accounts", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const accounts = await storage.getSocialAccountsByUserId(user.id);
        res.json(accounts);
    } catch (error) {
        res.status(500).json({ error: "소셜 계정 조회 실패" });
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
            res.clearCookie("connect.sid");
            res.redirect("/");
        });
    });
});

export default router;

