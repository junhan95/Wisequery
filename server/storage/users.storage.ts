import { BaseStorage, schema, eq, and, sql } from "./base";
import type {
    User,
    UpsertUser,
    VerificationCode,
    InsertVerificationCode,
} from "@shared/schema";

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

    async updateUserStripeCustomerId(userId: string, stripeCustomerId: string): Promise<User | undefined> {
        const results = await this.db
            .update(schema.users)
            .set({ stripeCustomerId, updatedAt: new Date() })
            .where(eq(schema.users.id, userId))
            .returning();
        return results[0];
    }

    // Verification code operations
    async createVerificationCode(insertCode: InsertVerificationCode): Promise<VerificationCode> {
        const results = await this.db
            .insert(schema.verificationCodes)
            .values(insertCode)
            .returning();
        return results[0];
    }

    async getVerificationCode(email: string, code: string, type: string): Promise<VerificationCode | undefined> {
        const now = new Date();
        const [verificationCode] = await this.db
            .select()
            .from(schema.verificationCodes)
            .where(
                and(
                    eq(schema.verificationCodes.email, email),
                    eq(schema.verificationCodes.code, code),
                    eq(schema.verificationCodes.type, type),
                    sql`${schema.verificationCodes.expiresAt} > ${now}`
                )
            );
        return verificationCode;
    }

    async deleteVerificationCode(id: string): Promise<void> {
        await this.db
            .delete(schema.verificationCodes)
            .where(eq(schema.verificationCodes.id, id));
    }

    async deleteVerificationCodesByEmailAndType(email: string, type: string): Promise<void> {
        await this.db
            .delete(schema.verificationCodes)
            .where(
                and(
                    eq(schema.verificationCodes.email, email),
                    eq(schema.verificationCodes.type, type)
                )
            );
    }

    async deleteExpiredVerificationCodes(): Promise<void> {
        const now = new Date();
        await this.db
            .delete(schema.verificationCodes)
            .where(sql`${schema.verificationCodes.expiresAt} <= ${now}`);
    }
}
