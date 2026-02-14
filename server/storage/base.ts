import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import * as schema from "@shared/schema";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

// Singleton Pool for pgvector operations - prevents connection exhaustion
let pgVectorPool: Pool | null = null;

export function getPgVectorPool(): Pool {
    if (!pgVectorPool) {
        pgVectorPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 10,  // Maximum 10 connections in pool
            idleTimeoutMillis: 30000,  // Close idle connections after 30 seconds
            connectionTimeoutMillis: 10000  // Timeout after 10 seconds when acquiring connection
        });

        // Handle pool errors gracefully
        pgVectorPool.on('error', (err) => {
            console.error('[PgVector Pool] Unexpected error:', err);
        });
    }
    return pgVectorPool;
}

export type DrizzleDB = ReturnType<typeof drizzle>;

/**
 * DatabaseStorage의 기본 클래스.
 * DB 연결을 초기화하고 하위 mixin들에게 db 인스턴스를 제공합니다.
 */
export class BaseStorage {
    protected db: DrizzleDB;

    constructor() {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error("DATABASE_URL environment variable is not set");
        }
        const pool = new Pool({ connectionString });
        this.db = drizzle(pool, { schema });
    }
}

// Re-export schema and drizzle utilities for use in mixin files
export { schema };
export { eq, desc, sql, max, and, lt, isNull, isNotNull, or } from "drizzle-orm";
