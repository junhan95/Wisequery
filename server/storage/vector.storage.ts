import { BaseStorage, getPgVectorPool } from "./base";
import type { Message, FileChunk } from "@shared/schema";

export class VectorSearchMixin extends BaseStorage {
    // Helper to get ef_search value - uniform high quality for all tiers
    private getEfSearchValue(subscriptionTier?: string): number {
        // All subscription tiers receive identical highest-quality RAG search
        // Free tier is limited by usage count only, not search quality
        return 200;
    }

    // pgvector-based semantic search operations
    async searchMessagesByVector(
        userId: string,
        queryEmbedding: number[],
        limit: number = 10,
        excludeConversationId?: string,
        includeArchived: boolean = false,
        subscriptionTier?: string
    ): Promise<Array<Message & { similarity: number; conversationId: string }>> {
        const vectorString = `[${queryEmbedding.join(',')}]`;
        const efSearch = this.getEfSearchValue(subscriptionTier);

        let query = `
      SELECT 
        m.*,
        1 - (m.embedding_vector <=> $1::vector) as similarity
      FROM messages m
      INNER JOIN conversations c ON m.conversation_id = c.id
      WHERE m.user_id = $2
        AND m.embedding_vector IS NOT NULL
    `;
        const params: any[] = [vectorString, userId];
        let paramIndex = 3;

        if (excludeConversationId) {
            query += ` AND m.conversation_id != $${paramIndex}`;
            params.push(excludeConversationId);
            paramIndex++;
        }

        if (!includeArchived) {
            query += ` AND c.archived_at IS NULL`;
        }

        query += ` ORDER BY similarity DESC LIMIT $${paramIndex}`;
        params.push(limit);

        const pool = getPgVectorPool();
        const client = await pool.connect();
        try {
            // Set HNSW ef_search for this session (higher = more accurate but slower)
            await client.query(`SET hnsw.ef_search = ${efSearch}`);

            const result = await client.query(query, params);
            return result.rows.map(row => ({
                id: row.id,
                conversationId: row.conversation_id,
                userId: row.user_id,
                role: row.role,
                content: row.content,
                embedding: row.embedding,
                embeddingVector: row.embedding_vector,
                attachments: row.attachments,
                createdAt: row.created_at,
                similarity: parseFloat(row.similarity)
            }));
        } finally {
            client.release();
        }
    }

    async searchFileChunksByVector(
        userId: string,
        queryEmbedding: number[],
        limit: number = 10,
        includeArchived: boolean = false,
        subscriptionTier?: string
    ): Promise<Array<FileChunk & { similarity: number; fileId: string; projectId?: string }>> {
        const vectorString = `[${queryEmbedding.join(',')}]`;
        const efSearch = this.getEfSearchValue(subscriptionTier);

        let query = `
      SELECT 
        fc.*,
        f.project_id,
        1 - (fc.embedding_vector <=> $1::vector) as similarity
      FROM file_chunks fc
      INNER JOIN files f ON fc.file_id = f.id
      WHERE fc.user_id = $2
        AND fc.embedding_vector IS NOT NULL
    `;
        const params: any[] = [vectorString, userId];
        let paramIndex = 3;

        if (!includeArchived) {
            query += ` AND f.archived_at IS NULL AND f.deleted_at IS NULL`;
        }

        query += ` ORDER BY similarity DESC LIMIT $${paramIndex}`;
        params.push(limit);

        const pool = getPgVectorPool();
        const client = await pool.connect();
        try {
            // Set HNSW ef_search for this session (higher = more accurate but slower)
            await client.query(`SET hnsw.ef_search = ${efSearch}`);

            const result = await client.query(query, params);
            return result.rows.map(row => ({
                id: row.id,
                fileId: row.file_id,
                userId: row.user_id,
                content: row.content,
                chunkIndex: row.chunk_index,
                tokenCount: row.token_count,
                embedding: row.embedding,
                embeddingVector: row.embedding_vector,
                metadata: row.metadata,
                attributes: row.attributes,
                createdAt: row.created_at,
                projectId: row.project_id,
                similarity: parseFloat(row.similarity)
            }));
        } finally {
            client.release();
        }
    }

    // Auto-migrate JSON embeddings to pgvector format on startup
    async migrateEmbeddingsToVector(): Promise<{ messages: number; fileChunks: number }> {
        const pool = getPgVectorPool();
        const client = await pool.connect();
        try {
            // Migrate messages
            const messagesResult = await client.query(`
        UPDATE messages 
        SET embedding_vector = embedding::vector 
        WHERE embedding IS NOT NULL AND embedding_vector IS NULL
      `);

            // Migrate file_chunks
            const chunksResult = await client.query(`
        UPDATE file_chunks 
        SET embedding_vector = embedding::vector 
        WHERE embedding IS NOT NULL AND embedding_vector IS NULL
      `);

            const migratedMessages = messagesResult.rowCount || 0;
            const migratedChunks = chunksResult.rowCount || 0;

            if (migratedMessages > 0 || migratedChunks > 0) {
                console.log(`[Embedding Migration] Migrated ${migratedMessages} messages and ${migratedChunks} file chunks to pgvector format`);
            }

            return { messages: migratedMessages, fileChunks: migratedChunks };
        } catch (error) {
            console.error('[Embedding Migration] Failed:', error);
            return { messages: 0, fileChunks: 0 };
        } finally {
            client.release();
        }
    }
}
