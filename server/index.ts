import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";

const app = express();

// =====================
// Security Middleware
// =====================

// Helmet: HTTP security headers (XSS, clickjacking, MIME sniffing protection)
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for SPA (Vite injects inline scripts)
  crossOriginEmbedderPolicy: false, // Allow cross-origin resources (fonts, images)
}));

// CORS: Allow only trusted origins
const allowedOrigins = [
  'https://wisequery.app',
  'https://www.wisequery.app',
  'https://wisequery.onrender.com',
  'http://localhost:5000',
  'http://localhost:3000',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, same-origin, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies for session auth
}));

// Rate Limiting: General API (100 requests per 15 minutes per IP)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => !req.path.startsWith('/api'), // Only limit API routes
});

// Rate Limiting: Auth endpoints (20 per 15 minutes - stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later.' },
});

// Rate Limiting: Chat/AI endpoints (30 per 15 minutes)
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests, please try again later.' },
});

// Apply rate limiters
app.use('/api/', generalLimiter);
app.use('/api/auth/', authLimiter);
app.use('/api/chat', chatLimiter);

// =====================
// Core Middleware
// =====================

// Add compression middleware globally
app.use(compression());

// Add custom flush for SSE routes (compression skips text/event-stream)
app.use((req, res, next) => {
  // Add flush method for all responses (especially SSE which compression skips)
  if (!res.flush) {
    (res as any).flush = function () {
      // Write SSE comment through HTTP response API to preserve chunk framing
      if (!this.writableEnded && !this.socket?.destroyed) {
        this.write(':\n\n');
      }
    };
  }
  next();
});

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

// Stripe webhook needs raw body, exclude from JSON parsing
app.use((req, res, next) => {
  if (req.originalUrl === '/api/stripe/webhook') {
    next();
  } else {
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })(req, res, next);
  }
});
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Auto-migrate embeddings to pgvector format on startup
  await storage.migrateEmbeddingsToVector();

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);
  });
})();
