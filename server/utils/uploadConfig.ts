import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { decodeFilename } from "./fileProcessing";

// Multer configuration for file uploads
const uploadStorage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
        const uploadDir = path.join(process.cwd(), "uploads");
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error as Error, uploadDir);
        }
    },
    filename: (_req, file, cb) => {
        const decodedName = decodeFilename(file.originalname);
        const uniqueFilename = `${randomUUID()}${path.extname(decodedName)}`;
        cb(null, uniqueFilename);
    },
});

export const upload = multer({
    storage: uploadStorage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    // Allow all file types
});
