import { BaseStorage, schema, eq, desc, and, lt, isNull, isNotNull, or } from "./base";
import type {
    RetentionPolicy,
    InsertRetentionPolicy,
    PendingNotification,
    InsertPendingNotification,
    AuditEvent,
    InsertAuditEvent,
    Conversation,
    File,
} from "@shared/schema";

export class AdminMixin extends BaseStorage {
    // Retention policy implementations
    async getRetentionPolicy(plan: string): Promise<RetentionPolicy | undefined> {
        const [policy] = await this.db
            .select()
            .from(schema.retentionPolicies)
            .where(eq(schema.retentionPolicies.plan, plan));
        return policy;
    }

    async createRetentionPolicy(policy: InsertRetentionPolicy): Promise<RetentionPolicy> {
        const [result] = await this.db
            .insert(schema.retentionPolicies)
            .values(policy)
            .returning();
        return result;
    }

    async updateRetentionPolicy(plan: string, data: Partial<InsertRetentionPolicy>): Promise<RetentionPolicy | undefined> {
        const [result] = await this.db
            .update(schema.retentionPolicies)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(schema.retentionPolicies.plan, plan))
            .returning();
        return result;
    }

    // Pending notification implementations
    async createPendingNotification(notification: InsertPendingNotification): Promise<PendingNotification> {
        const [result] = await this.db
            .insert(schema.pendingNotifications)
            .values(notification)
            .returning();
        return result;
    }

    async getPendingNotifications(userId: string): Promise<PendingNotification[]> {
        return await this.db
            .select()
            .from(schema.pendingNotifications)
            .where(and(
                eq(schema.pendingNotifications.userId, userId),
                isNull(schema.pendingNotifications.sentAt)
            ))
            .orderBy(schema.pendingNotifications.scheduledFor);
    }

    async markNotificationSent(id: string): Promise<void> {
        await this.db
            .update(schema.pendingNotifications)
            .set({ sentAt: new Date() })
            .where(eq(schema.pendingNotifications.id, id));
    }

    // Audit event implementations
    async createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent> {
        const [result] = await this.db
            .insert(schema.auditEvents)
            .values(event)
            .returning();
        return result;
    }

    async getAuditEvents(userId: string, limit?: number): Promise<AuditEvent[]> {
        let query = this.db
            .select()
            .from(schema.auditEvents)
            .where(eq(schema.auditEvents.userId, userId))
            .orderBy(desc(schema.auditEvents.createdAt));

        if (limit) {
            query = query.limit(limit) as typeof query;
        }

        return await query;
    }

    // Expiration/archival implementations
    async getUsersWithExpiringItems(warningDays: number): Promise<{ id: string; email: string; plan: string }[]> {
        const warningDate = new Date();
        warningDate.setDate(warningDate.getDate() + warningDays);

        const results = await this.db
            .select({
                id: schema.users.id,
                email: schema.users.email,
                plan: schema.subscriptions.plan,
            })
            .from(schema.users)
            .innerJoin(schema.subscriptions, eq(schema.users.id, schema.subscriptions.userId))
            .innerJoin(schema.conversations, eq(schema.users.id, schema.conversations.userId))
            .where(
                and(
                    isNull(schema.conversations.archivedAt),
                    or(
                        lt(schema.conversations.lastActivityAt, warningDate),
                        lt(schema.conversations.updatedAt, warningDate)
                    )
                )
            );

        const uniqueUsers = new Map<string, { id: string; email: string; plan: string }>();
        for (const row of results) {
            if (row.email && !uniqueUsers.has(row.id)) {
                uniqueUsers.set(row.id, { id: row.id, email: row.email, plan: row.plan });
            }
        }
        return Array.from(uniqueUsers.values());
    }

    async getAllUsersWithSubscriptions(): Promise<{ id: string; email: string; plan: string }[]> {
        const results = await this.db
            .select({
                id: schema.users.id,
                email: schema.users.email,
                plan: schema.subscriptions.plan,
            })
            .from(schema.users)
            .innerJoin(schema.subscriptions, eq(schema.users.id, schema.subscriptions.userId));

        return results.filter(r => r.email !== null).map(r => ({
            id: r.id,
            email: r.email!,
            plan: r.plan,
        }));
    }

    async getExpiringConversations(userId: string, retentionDays: number, warningDays: number): Promise<{ id: string; name: string }[]> {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() - retentionDays);

        const warningDate = new Date();
        warningDate.setDate(warningDate.getDate() - retentionDays + warningDays);

        const results = await this.db
            .select({ id: schema.conversations.id, name: schema.conversations.name })
            .from(schema.conversations)
            .where(
                and(
                    eq(schema.conversations.userId, userId),
                    isNull(schema.conversations.archivedAt),
                    or(
                        and(
                            isNotNull(schema.conversations.lastActivityAt),
                            lt(schema.conversations.lastActivityAt, warningDate)
                        ),
                        and(
                            isNull(schema.conversations.lastActivityAt),
                            lt(schema.conversations.updatedAt, warningDate)
                        )
                    )
                )
            );

        return results;
    }

    async getExpiringFiles(userId: string, retentionDays: number, warningDays: number): Promise<{ id: string; originalName: string }[]> {
        const warningDate = new Date();
        warningDate.setDate(warningDate.getDate() - retentionDays + warningDays);

        const results = await this.db
            .select({ id: schema.files.id, originalName: schema.files.originalName })
            .from(schema.files)
            .where(
                and(
                    eq(schema.files.userId, userId),
                    isNull(schema.files.archivedAt),
                    lt(schema.files.createdAt, warningDate)
                )
            );

        return results;
    }

    async archiveExpiredConversations(userId: string, retentionDays: number): Promise<number> {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() - retentionDays);

        const results = await this.db
            .update(schema.conversations)
            .set({ archivedAt: new Date() })
            .where(
                and(
                    eq(schema.conversations.userId, userId),
                    isNull(schema.conversations.archivedAt),
                    or(
                        and(
                            isNotNull(schema.conversations.lastActivityAt),
                            lt(schema.conversations.lastActivityAt, expirationDate)
                        ),
                        and(
                            isNull(schema.conversations.lastActivityAt),
                            lt(schema.conversations.updatedAt, expirationDate)
                        )
                    )
                )
            )
            .returning();

        return results.length;
    }

    async archiveExpiredFiles(userId: string, retentionDays: number): Promise<number> {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() - retentionDays);

        const results = await this.db
            .update(schema.files)
            .set({ archivedAt: new Date() })
            .where(
                and(
                    eq(schema.files.userId, userId),
                    isNull(schema.files.archivedAt),
                    lt(schema.files.createdAt, expirationDate)
                )
            )
            .returning();

        return results.length;
    }

    async deleteArchivedConversations(userId: string, gracePeriodDays: number): Promise<number> {
        const deleteDate = new Date();
        deleteDate.setDate(deleteDate.getDate() - gracePeriodDays);

        const results = await this.db
            .delete(schema.conversations)
            .where(
                and(
                    eq(schema.conversations.userId, userId),
                    isNotNull(schema.conversations.archivedAt),
                    lt(schema.conversations.archivedAt, deleteDate)
                )
            )
            .returning();

        return results.length;
    }

    async deleteArchivedFiles(userId: string, gracePeriodDays: number): Promise<number> {
        const deleteDate = new Date();
        deleteDate.setDate(deleteDate.getDate() - gracePeriodDays);

        const results = await this.db
            .delete(schema.files)
            .where(
                and(
                    eq(schema.files.userId, userId),
                    isNotNull(schema.files.archivedAt),
                    lt(schema.files.archivedAt, deleteDate)
                )
            )
            .returning();

        return results.length;
    }

    async deleteExpiredSessions(): Promise<number> {
        const now = new Date();

        const results = await this.db
            .delete(schema.sessions)
            .where(lt(schema.sessions.expire, now))
            .returning();

        return results.length;
    }

    async restoreConversation(id: string, userId: string): Promise<boolean> {
        const results = await this.db
            .update(schema.conversations)
            .set({ archivedAt: null })
            .where(
                and(
                    eq(schema.conversations.id, id),
                    eq(schema.conversations.userId, userId),
                    isNotNull(schema.conversations.archivedAt)
                )
            )
            .returning();

        return results.length > 0;
    }

    async restoreFile(id: string, userId: string): Promise<boolean> {
        const results = await this.db
            .update(schema.files)
            .set({ archivedAt: null })
            .where(
                and(
                    eq(schema.files.id, id),
                    eq(schema.files.userId, userId),
                    isNotNull(schema.files.archivedAt)
                )
            )
            .returning();

        return results.length > 0;
    }

    async getArchivedConversations(userId: string): Promise<Conversation[]> {
        return await this.db
            .select()
            .from(schema.conversations)
            .where(
                and(
                    eq(schema.conversations.userId, userId),
                    isNotNull(schema.conversations.archivedAt)
                )
            )
            .orderBy(desc(schema.conversations.archivedAt));
    }

    async getArchivedFiles(userId: string): Promise<File[]> {
        return await this.db
            .select()
            .from(schema.files)
            .where(
                and(
                    eq(schema.files.userId, userId),
                    isNotNull(schema.files.archivedAt)
                )
            )
            .orderBy(desc(schema.files.archivedAt));
    }
}
