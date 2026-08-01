import {
  canChangeOrganizationMembership,
  canManageOrganizationMembers,
  canManageOrganizationResources,
  type OrganizationMembershipRecord,
  type OrganizationMemberRecord,
  type OrganizationRole,
  type OrganizationRecord,
} from "@/lib/platform";
import type {
  ConsoleOrganization,
  ConsoleOrganizationRole,
  ConsoleTeamMember,
} from "./types";
import { ConsoleRequestError, type ConsoleRequestContext } from "./server";

const roleRank: Record<ConsoleOrganizationRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

const organizationRoles: readonly ConsoleOrganizationRole[] = ["owner", "admin", "member", "viewer"];

export function parseOrganizationRole(value: unknown): ConsoleOrganizationRole {
  if (typeof value === "string" && organizationRoles.includes(value as ConsoleOrganizationRole)) {
    return value as ConsoleOrganizationRole;
  }
  throw new ConsoleRequestError("角色无效。", 400, "invalid_organization_role");
}

export function mapOrganization(
  organization: OrganizationRecord,
  membership: OrganizationMembershipRecord,
): ConsoleOrganization {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    role: membership.role,
  };
}

export function mapTeamMember(record: OrganizationMemberRecord, currentUserId: string): ConsoleTeamMember {
  return {
    id: record.id,
    userId: record.userId,
    username: record.user.username,
    displayName: record.user.displayName,
    email: record.user.email,
    image: record.user.image,
    status: record.user.status,
    role: record.role,
    joinedAt: record.createdAt.toISOString(),
    isCurrentUser: record.userId === currentUserId,
  };
}

type AccessibleOrganization = {
  organization: OrganizationRecord;
  membership: OrganizationMembershipRecord;
};

async function accessibleOrganizations(context: ConsoleRequestContext): Promise<AccessibleOrganization[]> {
  const memberships = await context.repositories.organizations.listMembershipsForUser(context.userId);
  const records = await Promise.all(
    memberships.map(async (membership) => {
      const organization = await context.repositories.organizations.findById(membership.organizationId);
      return organization ? { organization, membership } : null;
    }),
  );
  return records.filter((record): record is AccessibleOrganization => Boolean(record));
}

function sortOrganizations(records: AccessibleOrganization[]): AccessibleOrganization[] {
  return [...records].sort((left, right) => {
    const roleDifference = roleRank[right.membership.role] - roleRank[left.membership.role];
    return roleDifference || left.organization.name.localeCompare(right.organization.name, "zh-CN");
  });
}

export async function listConsoleOrganizations(context: ConsoleRequestContext): Promise<ConsoleOrganization[]> {
  return sortOrganizations(await accessibleOrganizations(context)).map(({ organization, membership }) =>
    mapOrganization(organization, membership),
  );
}

export async function findConsoleOrganization(
  context: ConsoleRequestContext,
  organizationId?: string | null,
): Promise<{ organization: ConsoleOrganization; membership: OrganizationMembershipRecord } | null> {
  const records = sortOrganizations(await accessibleOrganizations(context));
  if (!records.length) {
    if (organizationId) {
      throw new ConsoleRequestError("你无权访问该工作区。", 403, "organization_forbidden");
    }
    return null;
  }
  const selected = organizationId
    ? records.find((record) => record.organization.id === organizationId)
    : records[0];
  if (!selected) throw new ConsoleRequestError("你无权访问该工作区。", 403, "organization_forbidden");
  return {
    organization: mapOrganization(selected.organization, selected.membership),
    membership: selected.membership,
  };
}

export async function requireConsoleOrganization(
  context: ConsoleRequestContext,
  organizationId?: string | null,
) {
  const selected = await findConsoleOrganization(context, organizationId);
  if (!selected) {
    throw new ConsoleRequestError("当前账户还没有工作区。", 404, "organization_not_found");
  }
  return selected;
}

export function ensureOrganizationMemberManager(role: OrganizationRole): void {
  if (!canManageOrganizationMembers(role)) {
    throw new ConsoleRequestError("只有工作区 owner 或 admin 可以管理成员。", 403, "organization_membership_forbidden");
  }
}

export function ensureOrganizationResourceManager(role: OrganizationRole): void {
  if (!canManageOrganizationResources(role)) {
    throw new ConsoleRequestError("只有工作区 owner 或 admin 可以修改共享预设。", 403, "organization_resource_forbidden");
  }
}

export function ensureMembershipChangeAllowed(
  actorRole: OrganizationRole,
  currentRole: OrganizationRole,
  nextRole: OrganizationRole,
): void {
  if (!canChangeOrganizationMembership(actorRole, currentRole, nextRole)) {
    throw new ConsoleRequestError("当前角色不能执行这项成员变更。", 403, "organization_membership_forbidden");
  }
}

export function ensureOwnerCountSafe(
  members: Array<{ role: OrganizationRole }>,
  currentRole: OrganizationRole,
  nextRole: OrganizationRole,
): void {
  if (currentRole !== "owner" || nextRole === "owner") return;
  const ownerCount = members.filter((member) => member.role === "owner").length;
  if (ownerCount <= 1) {
    throw new ConsoleRequestError("工作区至少需要一位 owner。", 409, "organization_owner_required");
  }
}
