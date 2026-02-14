import { BaseStorage, schema, eq, and, max } from "./base";
import type { Project, InsertProject } from "@shared/schema";

export class ProjectsMixin extends BaseStorage {
    async getProjects(userId: string): Promise<Project[]> {
        return await this.db
            .select()
            .from(schema.projects)
            .where(eq(schema.projects.userId, userId))
            .orderBy(schema.projects.order);
    }

    async getProject(id: string, userId: string): Promise<Project | undefined> {
        const results = await this.db
            .select()
            .from(schema.projects)
            .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
            .limit(1);
        return results[0];
    }

    async createProject(insertProject: InsertProject, userId: string): Promise<Project> {
        const maxOrderResult = await this.db
            .select({ value: max(schema.projects.order) })
            .from(schema.projects)
            .where(eq(schema.projects.userId, userId));
        const maxOrder = maxOrderResult[0]?.value ?? -1;

        const results = await this.db
            .insert(schema.projects)
            .values({ userId, ...insertProject, order: maxOrder + 1 })
            .returning();
        return results[0];
    }

    async updateProject(
        id: string,
        userId: string,
        data: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'userId'>>
    ): Promise<Project | undefined> {
        const results = await this.db
            .update(schema.projects)
            .set({ ...data, updatedAt: new Date() })
            .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
            .returning();
        return results[0];
    }

    async deleteProject(id: string, userId: string): Promise<boolean> {
        const results = await this.db
            .delete(schema.projects)
            .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
            .returning();
        return results.length > 0;
    }
}
