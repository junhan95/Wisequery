import { BaseStorage, schema, eq, and } from "./base";
import type { User, UpsertUser, SocialAccount, PhoneVerification } from "@shared/schema";

export class UsersMixin extends BaseStorage {
    // User operations
    async getUser(id: string): Promise<User | undefined> {
        const [user] = await this.db.select().from(schema.users).where(eq(schema.users.id, id));
        return user;
    }

    async getUserByEmail(email: string): Promise<User | undefined> {
        const [user] = await this.db.select().from(schema.users).where(eq(schema.users.email, email));
        return user;
    }

    async createUser(userData: UpsertUser): Promise<User> {
        const [user] = await this.db
            .insert(schema.users)
            .values(userData)
            .returning();
        return user;
    }

    async upsertUser(userData: UpsertUser): Promise<User> {
        const [user] = await this.db
            .insert(schema.users)
            .values(userData)
            .onConflictDoUpdate({
                target: schema.users.id,
                set: {
                    ...userData,
                    updatedAt: new Date(),
                },
            })
            .returning();
        return user;
    }

    async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
        const results = await this.db
            .update(schema.users)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(schema.users.id, id))
            .returning();
        return results[0];
    }

    async getUserByPhone(phone: string): Promise<User | undefined> {
        const normalized = phone.replace(/[^0-9]/g, "");
        const [user] = await this.db
            .select()
            .from(schema.users)
            .where(eq(schema.users.phone, normalized));
        return user;
    }

    async deleteUser(id: string): Promise<boolean> {
        const result = await this.db
            .delete(schema.users)
            .where(eq(schema.users.id, id));
        return (result.rowCount ?? 0) > 0;
    }

    // ── Social Accounts ──────────────────────────────────────────────────

    async getSocialAccountByProviderEmail(provider: string, providerEmail: string): Promise<SocialAccount | undefined> {
        const [account] = await this.db
            .select()
            .from(schema.socialAccounts)
            .where(
                and(
                    eq(schema.socialAccounts.provider, provider),
                    eq(schema.socialAccounts.providerEmail, providerEmail)
                )
            );
        return account;
    }

    async getSocialAccountsByUserId(userId: string): Promise<SocialAccount[]> {
        return this.db
            .select()
            .from(schema.socialAccounts)
            .where(eq(schema.socialAccounts.userId, userId));
    }

    async createSocialAccount(userId: string, provider: string, providerEmail: string): Promise<SocialAccount> {
        const [account] = await this.db
            .insert(schema.socialAccounts)
            .values({ userId, provider, providerEmail })
            .onConflictDoUpdate({
                target: [schema.socialAccounts.provider, schema.socialAccounts.providerEmail],
                set: { userId },
            })
            .returning();
        return account;
    }

    async reassignSocialAccounts(fromUserId: string, toUserId: string): Promise<void> {
        await this.db
            .update(schema.socialAccounts)
            .set({ userId: toUserId })
            .where(eq(schema.socialAccounts.userId, fromUserId));
    }

    // ── Phone Verifications ───────────────────────────────────────────────

    async createPhoneVerification(phone: string, code: string, expiresAt: Date): Promise<PhoneVerification> {
        const normalized = phone.replace(/[^0-9]/g, "");
        // 기존 코드 삭제 후 새로 생성
        await this.db
            .delete(schema.phoneVerifications)
            .where(eq(schema.phoneVerifications.phone, normalized));

        const [verification] = await this.db
            .insert(schema.phoneVerifications)
            .values({ phone: normalized, code, expiresAt })
            .returning();
        return verification;
    }

    async getPhoneVerification(phone: string): Promise<PhoneVerification | undefined> {
        const normalized = phone.replace(/[^0-9]/g, "");
        const [verification] = await this.db
            .select()
            .from(schema.phoneVerifications)
            .where(eq(schema.phoneVerifications.phone, normalized));
        return verification;
    }

    async deletePhoneVerification(phone: string): Promise<void> {
        const normalized = phone.replace(/[^0-9]/g, "");
        await this.db
            .delete(schema.phoneVerifications)
            .where(eq(schema.phoneVerifications.phone, normalized));
    }
}
