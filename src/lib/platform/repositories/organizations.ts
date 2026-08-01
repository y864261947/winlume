import { and, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { PlatformDatabase } from "../db/client";
import { organizationMemberships, organizations, users } from "../db/schema";
import type { OrganizationRole } from "../types";

export type OrganizationRecord = InferSelectModel<typeof organizations>;
export type OrganizationMembershipRecord = InferSelectModel<typeof organizationMemberships>;
export type OrganizationMemberRecord = OrganizationMembershipRecord & {
  user: Pick<InferSelectModel<typeof users>, "id" | "username" | "displayName" | "email" | "image" | "status">;
};

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  ownerUserId: string;
}

export function normalizeOrganizationSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export class OrganizationRepository {
  constructor(private readonly database: PlatformDatabase) {}

  async create(input: CreateOrganizationInput): Promise<OrganizationRecord> {
    const slug = normalizeOrganizationSlug(input.slug);
    if (!slug) throw new Error("An organization slug is required.");
    const name = input.name.trim();
    if (!name) throw new Error("An organization name is required.");

    return this.database.transaction(async (tx) => {
      const [organization] = await tx
        .insert(organizations)
        .values({ slug, name, createdByUserId: input.ownerUserId })
        .returning();
      if (!organization) throw new Error("Failed to create organization.");
      await tx.insert(organizationMemberships).values({
        organizationId: organization.id,
        userId: input.ownerUserId,
        role: "owner",
      });
      return organization;
    });
  }

  async findById(id: string): Promise<OrganizationRecord | null> {
    const [organization] = await this.database.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    return organization ?? null;
  }

  async listMembershipsForUser(userId: string): Promise<OrganizationMembershipRecord[]> {
    return this.database
      .select()
      .from(organizationMemberships)
      .where(eq(organizationMemberships.userId, userId));
  }

  async getMembership(organizationId: string, userId: string): Promise<OrganizationMembershipRecord | null> {
    const [membership] = await this.database
      .select()
      .from(organizationMemberships)
      .where(and(eq(organizationMemberships.organizationId, organizationId), eq(organizationMemberships.userId, userId)))
      .limit(1);
    return membership ?? null;
  }

  async listMembers(organizationId: string): Promise<OrganizationMemberRecord[]> {
    const rows = await this.database
      .select({
        id: organizationMemberships.id,
        organizationId: organizationMemberships.organizationId,
        userId: organizationMemberships.userId,
        role: organizationMemberships.role,
        createdAt: organizationMemberships.createdAt,
        updatedAt: organizationMemberships.updatedAt,
        user: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          email: users.email,
          image: users.image,
          status: users.status,
        },
      })
      .from(organizationMemberships)
      .innerJoin(users, eq(organizationMemberships.userId, users.id))
      .where(eq(organizationMemberships.organizationId, organizationId));
    return rows;
  }

  async upsertMembership(
    organizationId: string,
    userId: string,
    role: OrganizationRole,
  ): Promise<OrganizationMembershipRecord> {
    const [membership] = await this.database
      .insert(organizationMemberships)
      .values({ organizationId, userId, role })
      .onConflictDoUpdate({
        target: [organizationMemberships.organizationId, organizationMemberships.userId],
        set: { role, updatedAt: new Date() },
      })
      .returning();
    if (!membership) throw new Error("Failed to save organization membership.");
    return membership;
  }

  async removeMembership(organizationId: string, userId: string): Promise<boolean> {
    const deleted = await this.database
      .delete(organizationMemberships)
      .where(and(eq(organizationMemberships.organizationId, organizationId), eq(organizationMemberships.userId, userId)))
      .returning({ id: organizationMemberships.id });
    return deleted.length === 1;
  }
}
