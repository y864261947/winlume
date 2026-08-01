import type { OrganizationRole } from "./types";

const organizationRoleRank: Record<OrganizationRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export function hasOrganizationRole(
  actual: OrganizationRole | null | undefined,
  required: OrganizationRole,
): boolean {
  return actual !== null && actual !== undefined && organizationRoleRank[actual] >= organizationRoleRank[required];
}

export function canManageOrganizationMembers(role: OrganizationRole | null | undefined): boolean {
  return hasOrganizationRole(role, "admin");
}

export function canManageOrganizationBilling(role: OrganizationRole | null | undefined): boolean {
  return role === "owner";
}

export function canManageOrganizationResources(role: OrganizationRole | null | undefined): boolean {
  return hasOrganizationRole(role, "admin");
}

/**
 * Owners may manage every role. Admins may manage member/viewer accounts only;
 * this keeps ownership and administrator elevation owner-controlled.
 */
export function canChangeOrganizationMembership(
  actorRole: OrganizationRole | null | undefined,
  currentRole: OrganizationRole,
  nextRole: OrganizationRole,
): boolean {
  if (actorRole === "owner") return true;
  if (actorRole !== "admin") return false;
  return currentRole !== "owner" && currentRole !== "admin" && nextRole !== "owner" && nextRole !== "admin";
}
