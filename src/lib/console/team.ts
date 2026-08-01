import type { OrganizationRole } from "@/lib/platform";
import type { ConsoleTeam, ConsoleTeamMember } from "./types";
import { ConsoleRequestError, type ConsoleRequestContext } from "./server";
import {
  ensureMembershipChangeAllowed,
  ensureOrganizationMemberManager,
  ensureOwnerCountSafe,
  listConsoleOrganizations,
  mapTeamMember,
  parseOrganizationRole,
  requireConsoleOrganization,
} from "./workspace";

type TeamMutationInput = Record<string, unknown>;

function objectInput(value: unknown): TeamMutationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConsoleRequestError("请求内容无效。", 400, "invalid_request");
  }
  return value as TeamMutationInput;
}

function organizationIdFrom(input: TeamMutationInput): string | null {
  if (input.organizationId === undefined || input.organizationId === null || input.organizationId === "") return null;
  if (typeof input.organizationId !== "string") {
    throw new ConsoleRequestError("工作区标识无效。", 400, "invalid_organization_id");
  }
  return input.organizationId;
}

function roleFrom(input: TeamMutationInput): OrganizationRole {
  return parseOrganizationRole(input.role);
}

async function memberForUser(
  context: ConsoleRequestContext,
  organizationId: string,
  userId: string,
): Promise<ConsoleTeamMember> {
  const members = await context.repositories.organizations.listMembers(organizationId);
  const member = members.find((item) => item.userId === userId);
  if (!member) throw new ConsoleRequestError("未找到该工作区成员。", 404, "organization_member_not_found");
  return mapTeamMember(member, context.userId);
}

export async function getConsoleTeam(
  context: ConsoleRequestContext,
  organizationId?: string | null,
): Promise<ConsoleTeam> {
  const selected = await requireConsoleOrganization(context, organizationId);
  const [organizations, members] = await Promise.all([
    listConsoleOrganizations(context),
    context.repositories.organizations.listMembers(selected.organization.id),
  ]);
  return {
    organizations,
    organization: selected.organization,
    members: members
      .map((member) => mapTeamMember(member, context.userId))
      .sort((left, right) => {
        const rank: Record<OrganizationRole, number> = { owner: 3, admin: 2, member: 1, viewer: 0 };
        return rank[right.role] - rank[left.role] || left.displayName.localeCompare(right.displayName, "zh-CN");
      }),
    actorRole: selected.membership.role,
    canManageMembers: selected.membership.role === "owner" || selected.membership.role === "admin",
  };
}

export async function addConsoleTeamMember(
  context: ConsoleRequestContext,
  value: unknown,
): Promise<ConsoleTeamMember> {
  const input = objectInput(value);
  const selected = await requireConsoleOrganization(context, organizationIdFrom(input));
  ensureOrganizationMemberManager(selected.membership.role);
  const identifier = typeof input.identifier === "string" ? input.identifier.trim() : "";
  if (!identifier || identifier.length > 320) {
    throw new ConsoleRequestError("请输入已注册成员的用户名或邮箱。", 400, "invalid_member_identifier");
  }
  const role = roleFrom(input);
  const target = identifier.includes("@")
    ? await context.repositories.users.findByEmail(identifier)
    : await context.repositories.users.findByUsername(identifier);
  if (!target || target.status !== "active") {
    throw new ConsoleRequestError("未找到可添加的已注册成员。", 404, "organization_member_user_not_found");
  }
  const existing = await context.repositories.organizations.getMembership(selected.organization.id, target.id);
  ensureMembershipChangeAllowed(selected.membership.role, existing?.role ?? "viewer", role);
  await context.repositories.organizations.upsertMembership(selected.organization.id, target.id, role);
  return memberForUser(context, selected.organization.id, target.id);
}

export async function updateConsoleTeamMember(
  context: ConsoleRequestContext,
  userId: string,
  value: unknown,
): Promise<ConsoleTeamMember> {
  const input = objectInput(value);
  const selected = await requireConsoleOrganization(context, organizationIdFrom(input));
  ensureOrganizationMemberManager(selected.membership.role);
  const target = await context.repositories.organizations.getMembership(selected.organization.id, userId);
  if (!target) throw new ConsoleRequestError("未找到该工作区成员。", 404, "organization_member_not_found");
  const role = roleFrom(input);
  ensureMembershipChangeAllowed(selected.membership.role, target.role, role);
  if (target.role !== role) {
    const members = await context.repositories.organizations.listMembers(selected.organization.id);
    ensureOwnerCountSafe(members, target.role, role);
    await context.repositories.organizations.upsertMembership(selected.organization.id, target.userId, role);
  }
  return memberForUser(context, selected.organization.id, target.userId);
}

export async function removeConsoleTeamMember(
  context: ConsoleRequestContext,
  userId: string,
  organizationId?: string | null,
): Promise<void> {
  const selected = await requireConsoleOrganization(context, organizationId);
  ensureOrganizationMemberManager(selected.membership.role);
  const target = await context.repositories.organizations.getMembership(selected.organization.id, userId);
  if (!target) throw new ConsoleRequestError("未找到该工作区成员。", 404, "organization_member_not_found");
  ensureMembershipChangeAllowed(selected.membership.role, target.role, "viewer");
  const members = await context.repositories.organizations.listMembers(selected.organization.id);
  ensureOwnerCountSafe(members, target.role, "viewer");
  const removed = await context.repositories.organizations.removeMembership(selected.organization.id, target.userId);
  if (!removed) throw new ConsoleRequestError("未找到该工作区成员。", 404, "organization_member_not_found");
}

export function parseTeamOrganizationId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new ConsoleRequestError("工作区标识无效。", 400, "invalid_organization_id");
  return value;
}
