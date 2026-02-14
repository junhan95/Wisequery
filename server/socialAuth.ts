import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as NaverStrategy } from "passport-naver-v2";
import { Strategy as KakaoStrategy } from "passport-kakao";
import type { Express } from "express";
import { storage } from "./storage";

/**
 * Social Login OAuth configuration
 * Supports: Google, Naver, Kakao
 */

interface OAuthProfile {
    provider: string;
    email: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
}

/**
 * Find or create a user from OAuth profile data
 */
async function findOrCreateUser(profile: OAuthProfile) {
    // Check if user exists by email
    let user = await storage.getUserByEmail(profile.email);

    if (user) {
        // Update auth provider and profile if needed
        await storage.updateUser(user.id, {
            authProvider: profile.provider,
            profileImageUrl: profile.profileImageUrl || user.profileImageUrl,
            emailVerified: user.emailVerified || new Date(),
        });
        return await storage.getUser(user.id);
    }

    // Create new user
    user = await storage.createUser({
        email: profile.email,
        password: null,
        firstName: profile.firstName || null,
        lastName: profile.lastName || null,
        profileImageUrl: profile.profileImageUrl || null,
        emailVerified: new Date(),
        authProvider: profile.provider,
    });

    // Create free plan subscription for new users
    await storage.createSubscription({ plan: "free" }, user.id);

    return user;
}

/**
 * Setup OAuth strategies and routes
 */
export function setupSocialAuth(app: Express) {
    const callbackBaseUrl = process.env.APP_URL || "http://localhost:5000";

    // =====================
    // Google OAuth Strategy
    // =====================
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        passport.use(
            new GoogleStrategy(
                {
                    clientID: process.env.GOOGLE_CLIENT_ID,
                    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                    callbackURL: `${callbackBaseUrl}/api/auth/google/callback`,
                    scope: ["profile", "email"],
                },
                async (_accessToken, _refreshToken, profile, done) => {
                    try {
                        const email = profile.emails?.[0]?.value;
                        if (!email) {
                            return done(new Error("No email found in Google profile"));
                        }

                        const user = await findOrCreateUser({
                            provider: "google",
                            email,
                            firstName: profile.name?.givenName || undefined,
                            lastName: profile.name?.familyName || undefined,
                            profileImageUrl: profile.photos?.[0]?.value || undefined,
                        });

                        done(null, user);
                    } catch (error) {
                        done(error as Error);
                    }
                }
            )
        );

        // Google OAuth routes
        app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
        app.get(
            "/api/auth/google/callback",
            passport.authenticate("google", { failureRedirect: "/login?error=google_failed" }),
            (_req, res) => {
                res.redirect("/");
            }
        );

        console.log("✅ Google OAuth configured");
    } else {
        console.warn("⚠️ Google OAuth not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)");
    }

    // =====================
    // Naver OAuth Strategy
    // =====================
    if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
        passport.use(
            new NaverStrategy(
                {
                    clientID: process.env.NAVER_CLIENT_ID,
                    clientSecret: process.env.NAVER_CLIENT_SECRET,
                    callbackURL: `${callbackBaseUrl}/api/auth/naver/callback`,
                },
                async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
                    try {
                        const email = profile.email || profile._json?.email;
                        if (!email) {
                            return done(new Error("No email found in Naver profile"));
                        }

                        const user = await findOrCreateUser({
                            provider: "naver",
                            email,
                            firstName: profile.name || profile._json?.name || undefined,
                            lastName: undefined,
                            profileImageUrl: profile.profileImage || profile._json?.profile_image || undefined,
                        });

                        done(null, user);
                    } catch (error) {
                        done(error as Error);
                    }
                }
            )
        );

        // Naver OAuth routes
        app.get("/api/auth/naver", passport.authenticate("naver"));
        app.get(
            "/api/auth/naver/callback",
            passport.authenticate("naver", { failureRedirect: "/login?error=naver_failed" }),
            (_req, res) => {
                res.redirect("/");
            }
        );

        console.log("✅ Naver OAuth configured");
    } else {
        console.warn("⚠️ Naver OAuth not configured (missing NAVER_CLIENT_ID / NAVER_CLIENT_SECRET)");
    }

    // =====================
    // Kakao OAuth Strategy
    // =====================
    if (process.env.KAKAO_CLIENT_ID) {
        passport.use(
            new KakaoStrategy(
                {
                    clientID: process.env.KAKAO_CLIENT_ID,
                    clientSecret: process.env.KAKAO_CLIENT_SECRET || "",
                    callbackURL: `${callbackBaseUrl}/api/auth/kakao/callback`,
                },
                async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
                    try {
                        const email =
                            profile._json?.kakao_account?.email ||
                            `kakao_${profile.id}@kakao.user`;

                        const nickname = profile._json?.properties?.nickname || profile.displayName || null;
                        const profileImage =
                            profile._json?.properties?.profile_image ||
                            profile._json?.kakao_account?.profile?.profile_image_url ||
                            null;

                        const user = await findOrCreateUser({
                            provider: "kakao",
                            email,
                            firstName: nickname || undefined,
                            lastName: undefined,
                            profileImageUrl: profileImage || undefined,
                        });

                        done(null, user);
                    } catch (error) {
                        done(error as Error);
                    }
                }
            )
        );

        // Kakao OAuth routes
        app.get("/api/auth/kakao", passport.authenticate("kakao"));
        app.get(
            "/api/auth/kakao/callback",
            passport.authenticate("kakao", { failureRedirect: "/login?error=kakao_failed" }),
            (_req, res) => {
                res.redirect("/");
            }
        );

        console.log("✅ Kakao OAuth configured");
    } else {
        console.warn("⚠️ Kakao OAuth not configured (missing KAKAO_CLIENT_ID)");
    }
}
