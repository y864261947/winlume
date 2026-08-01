import { describe, expect, it } from "vitest";
import {
  canChangeOrganizationMembership,
  canManageOrganizationBilling,
  canManageOrganizationMembers,
  hasOrganizationRole,
} from "./authorization";

describe("organization authorization", () => {
  it("orders roles from viewer through owner", () => {
    expect(hasOrganizationRole("owner", "admin")).toBe(true);
    expect(hasOrganizationRole("admin", "member")).toBe(true);
    expect(hasOrganizationRole("member", "admin")).toBe(false);
    expect(hasOrganizationRole(undefined, "viewer")).toBe(false);
  });

  it("keeps billing owner-only and membership management admin-or-owner", () => {
    expect(canManageOrganizationBilling("owner")).toBe(true);
    expect(canManageOrganizationBilling("admin")).toBe(false);
    expect(canManageOrganizationMembers("admin")).toBe(true);
    expect(canManageOrganizationMembers("member")).toBe(false);
  });

  it("does not permit admins to elevate or modify privileged roles", () => {
    expect(canChangeOrganizationMembership("owner", "owner", "admin")).toBe(true);
    expect(canChangeOrganizationMembership("admin", "member", "viewer")).toBe(true);
    expect(canChangeOrganizationMembership("admin", "member", "admin")).toBe(false);
    expect(canChangeOrganizationMembership("admin", "owner", "viewer")).toBe(false);
    expect(canChangeOrganizationMembership("member", "viewer", "member")).toBe(false);
  });
});
