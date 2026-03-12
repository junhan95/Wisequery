-- Migration: Add HNSW vector indexes for pgvector semantic search
-- These indexes dramatically improve vector similarity search performance.
-- HNSW (Hierarchical Navigable Small World) provides approximate nearest neighbor
-- search with tunable accuracy vs speed trade-off.
--
-- Parameters:
--   m = 16             : max connections per node (higher = better recall, more memory)
--   ef_construction = 64 : build-time quality (higher = better index, slower build)
--
-- Run with: psql $DATABASE_URL -f migrations/0001_add_hnsw_vector_indexes.sql
-- Use CONCURRENTLY to avoid locking the table on production deployments.

-- HNSW index for file_chunks.embedding_vector
-- Used by: searchFileChunksByVector() in vector.storage.ts
CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_file_chunks_embedding_hnsw
  ON file_chunks
  USING hnsw (embedding_vector vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- HNSW index for messages.embedding_vector
-- Used by: searchMessagesByVector() in vector.storage.ts
CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_messages_embedding_hnsw
  ON messages
  USING hnsw (embedding_vector vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Composite B-tree index: files (userId, conversationId)
-- Used by: getFilesByConversation() - most frequent file query in chat context
CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_files_user_conversation
  ON files (user_id, conversation_id)
  WHERE deleted_at IS NULL;

-- Composite B-tree index: file_chunks (fileId, chunkIndex)
-- Used by: getFileChunks() ORDER BY chunk_index - ensures sequential chunk assembly
CREATE INDEX CONCURRENTLY IF NOT EXISTS IDX_file_chunks_file_chunk_order
  ON file_chunks (file_id, chunk_index);
