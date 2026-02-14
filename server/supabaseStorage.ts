import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Response } from "express";
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "wisequery-files";

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
    if (!supabaseClient) {
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error(
                "Supabase Storage not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables."
            );
        }
        supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false },
        });
    }
    return supabaseClient;
}

export class SupabaseStorageNotFoundError extends Error {
    constructor() {
        super("File not found in storage");
        this.name = "SupabaseStorageNotFoundError";
        Object.setPrototypeOf(this, SupabaseStorageNotFoundError.prototype);
    }
}

export class SupabaseStorageService {
    /**
     * Upload a buffer to Supabase Storage.
     * Returns the storage path (e.g., "supabase/uploads/{uuid}.ext")
     */
    async uploadBuffer(
        buffer: Buffer,
        filename: string,
        contentType: string
    ): Promise<string> {
        const client = getSupabaseClient();
        const objectId = randomUUID();
        const ext = filename.substring(filename.lastIndexOf("."));
        const storagePath = `uploads/${objectId}${ext}`;

        const { error } = await client.storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, buffer, {
                contentType,
                upsert: false,
            });

        if (error) {
            throw new Error(`Failed to upload file to Supabase Storage: ${error.message}`);
        }

        // Return a prefixed path so we can identify Supabase-stored files
        return `supabase/${storagePath}`;
    }

    /**
     * Download a file as Buffer from Supabase Storage.
     */
    async getObjectBuffer(storagePath: string): Promise<Buffer | null> {
        const client = getSupabaseClient();
        const internalPath = this.toInternalPath(storagePath);

        const { data, error } = await client.storage
            .from(STORAGE_BUCKET)
            .download(internalPath);

        if (error) {
            if (error.message?.includes("not found") || error.message?.includes("Object not found")) {
                return null;
            }
            throw new Error(`Failed to download from Supabase Storage: ${error.message}`);
        }

        if (!data) return null;

        // Convert Blob to Buffer
        const arrayBuffer = await data.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    /**
     * Stream a file to Express Response for download.
     */
    async downloadObject(storagePath: string, res: Response, cacheTtlSec: number = 3600): Promise<void> {
        const buffer = await this.getObjectBuffer(storagePath);
        if (!buffer) {
            throw new SupabaseStorageNotFoundError();
        }

        // Determine content type from extension
        const ext = storagePath.substring(storagePath.lastIndexOf(".")).toLowerCase();
        const contentType = this.getContentType(ext);

        res.set({
            "Content-Type": contentType,
            "Content-Length": buffer.length.toString(),
            "Cache-Control": `private, max-age=${cacheTtlSec}`,
        });

        res.send(buffer);
    }

    /**
     * Delete a file from Supabase Storage.
     */
    async deleteObject(storagePath: string): Promise<boolean> {
        const client = getSupabaseClient();
        const internalPath = this.toInternalPath(storagePath);

        const { error } = await client.storage
            .from(STORAGE_BUCKET)
            .remove([internalPath]);

        if (error) {
            console.error("Error deleting from Supabase Storage:", error);
            return false;
        }
        return true;
    }

    /**
     * Check if a file exists in Supabase Storage.
     */
    async fileExists(storagePath: string): Promise<boolean> {
        const buffer = await this.getObjectBuffer(storagePath);
        return buffer !== null;
    }

    /**
     * Convert external storage path to internal Supabase Storage path.
     * External: "supabase/uploads/uuid.ext"
     * Internal: "uploads/uuid.ext"
     */
    private toInternalPath(storagePath: string): string {
        if (storagePath.startsWith("supabase/")) {
            return storagePath.substring("supabase/".length);
        }
        // Legacy: /objects/uploads/uuid.ext → uploads/uuid.ext
        if (storagePath.startsWith("/objects/")) {
            return storagePath.substring("/objects/".length);
        }
        return storagePath;
    }

    private getContentType(ext: string): string {
        const mimeTypes: Record<string, string> = {
            ".pdf": "application/pdf",
            ".doc": "application/msword",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xls": "application/vnd.ms-excel",
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".ppt": "application/vnd.ms-powerpoint",
            ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".txt": "text/plain",
            ".csv": "text/csv",
            ".json": "application/json",
            ".zip": "application/zip",
            ".mp4": "video/mp4",
            ".mp3": "audio/mpeg",
        };
        return mimeTypes[ext] || "application/octet-stream";
    }
}

/**
 * Check if a filename is stored in Supabase Storage or legacy Replit Object Storage.
 */
export function isCloudStoragePath(filename: string): boolean {
    return filename.startsWith("supabase/") || filename.startsWith("/objects/");
}

export const supabaseStorageService = new SupabaseStorageService();
