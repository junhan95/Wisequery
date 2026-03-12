import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

export function getSession() {
    const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
    const pgStore = connectPg(session);
    const sessionStore = new pgStore({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: false,
        ttl: sessionTtl,
        tableName: "sessions",
    });
    return session({
        secret: process.env.SESSION_SECRET!,
        store: sessionStore,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            // 'lax' is required for OAuth: allows the session cookie (carrying OAuth state)
            // to be sent when the OAuth provider redirects back to our callback URL.
            // Without this, Chrome/Safari may block the cookie → state mismatch → auth failure.
            sameSite: 'lax',
            maxAge: sessionTtl,
        },
    });
}

export async function setupAuth(app: Express) {
    app.set("trust proxy", 1);
    app.use(getSession());
    app.use(passport.initialize());
    app.use(passport.session());

    // Store only user ID in session — avoids storing the full object (Date serialization,
    // large payload, stale data). Always fetch fresh user data from DB on each request.
    passport.serializeUser((user: any, cb) => cb(null, user.id));
    passport.deserializeUser(async (id: string, cb) => {
        try {
            const user = await storage.getUser(id);
            cb(null, user ?? false);
        } catch (err) {
            cb(err);
        }
    });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const user = req.user as any;

    if (user.id) {
        return next();
    }

    return res.status(401).json({ message: "Unauthorized" });
};

export const isAdmin: RequestHandler = (req, res, next) => {
    const user = req.user as any;
    if (user?.role !== "admin") {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
    }
    next();
};
