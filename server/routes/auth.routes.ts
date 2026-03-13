import { Router } from "express";
import { isAuthenticated } from "../sessionAuth";
import { storage } from "../storage";
import { upload } from "../utils/uploadConfig";
import { sendSmsVerificationCode, generateVerificationCode } from "../services/sms.service";

// ─── OTP 브루트포스 방어: 인메모리 시도 카운터 ────────────────────────────────
// key: "userId:phone", value: { count, lockedUntil }
const otpAttempts = new Map<string, { count: number; lockedUntil: number }>();
const OTP_MAX_ATTEMPTS = 5;          // 최대 5회 시도
const OTP_LOCKOUT_MS   = 10 * 60 * 1000; // 10분 잠금

function getOtpAttemptKey(userId: string, phone: string): string {
    return `${userId}:${phone}`;
}

function checkOtpLock(key: string): { locked: boolean; remainingMs?: number } {
    const record = otpAttempts.get(key);
    if (!record) return { locked: false };
    if (record.lockedUntil > Date.now()) {
        return { locked: true, remainingMs: record.lockedUntil - Date.now() };
    }
    // 잠금 해제 시간 지남 → 초기화
    otpAttempts.delete(key);
    return { locked: false };
}

function recordOtpFailure(key: string): void {
    const record = otpAttempts.get(key) ?? { count: 0, lockedUntil: 0 };
    record.count += 1;
    if (record.count >= OTP_MAX_ATTEMPTS) {
        record.lockedUntil = Date.now() + OTP_LOCKOUT_MS;
    }
    otpAttempts.set(key, record);
}

function clearOtpAttempts(key: string): void {
    otpAttempts.delete(key);
}

// 내부 에러를 클라이언트에 노출하지 않는 안전한 에러 응답
function safeError(res: any, status: number, userMessage: string, internalError?: unknown): void {
    if (internalError) {
        console.error(`[auth] ${userMessage}:`, internalError);
    }
    res.status(status).json({ error: userMessage });
}

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

// 인증번호 전송
router.post("/auth/phone/send", isAuthenticated, async (req, res) => {
    try {
        const user = req.user as any;
        const { phone } = req.body;

        if (!phone || !/^(010|011|016|017|018|019)[0-9]{7,8}$/.test(phone.replace(/[^0-9]/g, ""))) {
            return res.status(400).json({ error: "올바른 휴대폰 번호를 입력해주세요." });
        }

        const normalized = phone.replace(/[^0-9]/g, "");

        // 재전송 시 잠금 카운터 초기화 (새 코드 발급)
        clearOtpAttempts(getOtpAttemptKey(user.id, normalized));

        const code = generateVerificationCode();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5분

        await storage.createPhoneVerification(normalized, code, expiresAt);
        await sendSmsVerificationCode(normalized, code);

        console.info(`[auth] SMS sent user=${user.id} phone=***${normalized.slice(-4)}`);
        res.json({ message: "인증번호를 전송했습니다." });
    } catch (error) {
        safeError(res, 500, "SMS 전송 중 오류가 발생했습니다.", error);
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

        // 인증번호는 6자리 숫자여야 함
        if (!/^\d{6}$/.test(String(code))) {
            return res.status(400).json({ error: "인증번호 형식이 올바르지 않습니다." });
        }

        const normalized = phone.replace(/[^0-9]/g, "");
        const attemptKey = getOtpAttemptKey(currentUser.id, normalized);

        // ── 브루트포스 잠금 체크 ──────────────────────────────────────────────────
        const lockStatus = checkOtpLock(attemptKey);
        if (lockStatus.locked) {
            const remainingMin = Math.ceil((lockStatus.remainingMs ?? 0) / 60000);
            console.warn(`[auth] OTP locked user=${currentUser.id} phone=***${normalized.slice(-4)}`);
            return res.status(429).json({
                error: `인증 시도 횟수를 초과했습니다. ${remainingMin}분 후 다시 시도해주세요.`,
            });
        }

        const verification = await storage.getPhoneVerification(normalized);

        if (!verification) {
            return res.status(400).json({ error: "인증번호를 먼저 요청해주세요." });
        }

        if (new Date() > verification.expiresAt) {
            await storage.deletePhoneVerification(normalized);
            return res.status(400).json({ error: "인증번호가 만료되었습니다. 다시 요청해주세요." });
        }

        // ── 코드 불일치: 실패 카운터 증가 ──────────────────────────────────────────
        if (verification.code !== code) {
            recordOtpFailure(attemptKey);
            const record = otpAttempts.get(attemptKey);
            const remaining = OTP_MAX_ATTEMPTS - (record?.count ?? 0);
            console.warn(`[auth] OTP mismatch user=${currentUser.id} attempts=${record?.count}`);
            return res.status(400).json({
                error: remaining > 0
                    ? `인증번호가 올바르지 않습니다. (남은 시도: ${remaining}회)`
                    : "인증 시도 횟수를 초과했습니다. 10분 후 다시 시도해주세요.",
            });
        }

        // ── 인증 성공 ─────────────────────────────────────────────────────────────
        clearOtpAttempts(attemptKey);
        await storage.deletePhoneVerification(normalized);

        // 동일 전화번호로 이미 인증된 기존 계정 확인
        const existingPhoneUser = await storage.getUserByPhone(normalized);

        if (existingPhoneUser && existingPhoneUser.id !== currentUser.id) {
            // ── 계정 병합 ─────────────────────────────────────────────────────────
            console.info(
                `[auth] Account merge: new=${currentUser.id} (${currentUser.authProvider}) → existing=${existingPhoneUser.id} phone=***${normalized.slice(-4)}`
            );

            await storage.createSocialAccount(existingPhoneUser.id, currentUser.authProvider, currentUser.email);
            await storage.reassignSocialAccounts(currentUser.id, existingPhoneUser.id);
            await storage.deleteUser(currentUser.id);

            const mergedUser = await storage.getUser(existingPhoneUser.id);
            if (!mergedUser) {
                return safeError(res, 500, "계정 병합 중 오류가 발생했습니다.");
            }

            req.login(mergedUser, (err) => {
                if (err) return safeError(res, 500, "로그인 갱신에 실패했습니다.", err);
                res.json({ merged: true, user: mergedUser });
            });
        } else {
            // ── 신규 전화번호 등록 ────────────────────────────────────────────────
            console.info(`[auth] Phone verified user=${currentUser.id} phone=***${normalized.slice(-4)}`);

            const updatedUser = await storage.updateUser(currentUser.id, {
                phone: normalized,
                phoneVerified: true,
            });

            await storage.createSocialAccount(currentUser.id, currentUser.authProvider, currentUser.email);

            req.login(updatedUser!, (err) => {
                if (err) return safeError(res, 500, "로그인 갱신에 실패했습니다.", err);
                res.json({ merged: false, user: updatedUser });
            });
        }
    } catch (error) {
        safeError(res, 500, "인증 처리 중 오류가 발생했습니다.", error);
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

