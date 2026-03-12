import { BaseStorage, schema, eq } from "./base";
import type { User, UpsertUser } from "@shared/schema";

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

    async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
        const results = await this.db
            .update(schema.users)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(schema.users.id, id))
            .returning();
        return results[0];
    }
}
