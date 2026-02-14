import { BaseStorage, schema, eq, sql, and, isNull } from "./base";
import type { Message, InsertMessage } from "@shared/schema";

export class MessagesMixin extends BaseStorage {
    async getMessages(conversationId: string, userId: string): Promise<Message[]> {
        return await this.db
            .select()
            .from(schema.messages)
            .where(and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.userId, userId)))
            .orderBy(schema.messages.createdAt);
    }

    async getAllMessages(userId: string, includeArchived = false): Promise<Message[]> {
        if (includeArchived) {
            return await this.db
                .select()
                .from(schema.messages)
                .where(eq(schema.messages.userId, userId));
        }

        // Exclude messages from archived conversations
        return await this.db
            .select({
                id: schema.messages.id,
                conversationId: schema.messages.conversationId,
                userId: schema.messages.userId,
                role: schema.messages.role,
                content: schema.messages.content,
                embedding: schema.messages.embedding,
                embeddingVector: schema.messages.embeddingVector,
                attachments: schema.messages.attachments,
                createdAt: schema.messages.createdAt,
            })
            .from(schema.messages)
            .innerJoin(schema.conversations, eq(schema.messages.conversationId, schema.conversations.id))
            .where(and(
                eq(schema.messages.userId, userId),
                isNull(schema.conversations.archivedAt)
            ));
    }

    async getAIQueryCount(userId: string): Promise<number> {
        const result = await this.db
            .select({ count: sql<number>`count(*)::int` })
            .from(schema.messages)
            .where(and(
                eq(schema.messages.userId, userId),
                eq(schema.messages.role, 'assistant')
            ));
        return result[0]?.count || 0;
    }

    async createMessage(insertMessage: InsertMessage, userId: string): Promise<Message> {
        const results = await this.db
            .insert(schema.messages)
            .values({ userId, ...insertMessage } as any)
            .returning();

        await this.db
            .update(schema.conversations)
            .set({ updatedAt: new Date() })
            .where(and(eq(schema.conversations.id, insertMessage.conversationId), eq(schema.conversations.userId, userId)));

        return results[0];
    }

    async updateMessageEmbedding(id: string, userId: string, embedding: string, embeddingVector?: number[]): Promise<void> {
        const updateData: { embedding: string; embeddingVector?: number[] } = { embedding };
        if (embeddingVector) {
            updateData.embeddingVector = embeddingVector;
        }
        await this.db
            .update(schema.messages)
            .set(updateData)
            .where(and(eq(schema.messages.id, id), eq(schema.messages.userId, userId)));
    }
}
