import { BaseStorage, schema, eq, desc, and, isNull } from "./base";
import type { Conversation, InsertConversation } from "@shared/schema";

export class ConversationsMixin extends BaseStorage {
    async getConversations(userId: string): Promise<Conversation[]> {
        return await this.db
            .select()
            .from(schema.conversations)
            .where(and(eq(schema.conversations.userId, userId), isNull(schema.conversations.deletedAt)))
            .orderBy(desc(schema.conversations.updatedAt));
    }

    async getConversation(id: string, userId: string): Promise<Conversation | undefined> {
        const results = await this.db
            .select()
            .from(schema.conversations)
            .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)))
            .limit(1);
        return results[0];
    }

    async getConversationsByProject(projectId: string, userId: string): Promise<Conversation[]> {
        return await this.db
            .select()
            .from(schema.conversations)
            .where(and(eq(schema.conversations.projectId, projectId), eq(schema.conversations.userId, userId), isNull(schema.conversations.deletedAt)))
            .orderBy(desc(schema.conversations.updatedAt));
    }

    async createConversation(insertConversation: InsertConversation, userId: string): Promise<Conversation> {
        const results = await this.db
            .insert(schema.conversations)
            .values({ userId, ...insertConversation })
            .returning();
        return results[0];
    }

    async updateConversation(
        id: string,
        userId: string,
        data: Partial<InsertConversation>
    ): Promise<Conversation | undefined> {
        const results = await this.db
            .update(schema.conversations)
            .set({ ...data, updatedAt: new Date() })
            .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)))
            .returning();
        return results[0];
    }

    async deleteConversation(id: string, userId: string): Promise<boolean> {
        const results = await this.db
            .delete(schema.conversations)
            .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, userId)))
            .returning();
        return results.length > 0;
    }
}
