import { describe, expect, it } from "vitest";
import { createDesktopGrant, desktopBearer, desktopCodeHash, desktopUserIsValid, hashDesktopSecret } from "./desktop-auth";

describe("desktop login credentials", () => {
  it("stores only hashes and creates independent high-entropy tokens", () => {
    const a = createDesktopGrant(); const b = createDesktopGrant();
    expect(a.token).not.toBe(b.token); expect(a.row.id).not.toBe(b.row.id);
    expect(a.token).toHaveLength(43); expect(a.row.tokenHash).toBe(hashDesktopSecret(a.token));
    expect(JSON.stringify(a.row)).not.toContain(a.token);
    expect(desktopCodeHash(a.code.toLowerCase())).toBe(a.row.codeHash);
    expect(desktopCodeHash("abcd")).toBeNull();
  });
  it("accepts credentials only in the Bearer header, never query strings or cookies", () => {
    const grant = createDesktopGrant();
    expect(desktopBearer(new Request(`https://example.com?token=${grant.token}`, { headers: { cookie: `token=${grant.token}` } }))).toBeNull();
    expect(desktopBearer(new Request("https://example.com", { headers: { authorization: `Bearer ${grant.token}` } }))).toBe(grant.token);
  });
  it("rejects disabled/deleted users, expired grants and password-reset auth versions", () => {
    const now = new Date(); const grant = { authVersion: 2, expiresAt: new Date(now.getTime() + 1000) };
    expect(desktopUserIsValid(grant, { status: "active", authVersion: 2 }, now)).toBe(true);
    expect(desktopUserIsValid(grant, { status: "suspended", authVersion: 2 }, now)).toBe(false);
    expect(desktopUserIsValid(grant, { status: "active", authVersion: 3 }, now)).toBe(false);
    expect(desktopUserIsValid(grant, null, now)).toBe(false);
    expect(desktopUserIsValid({ ...grant, expiresAt: now }, { status: "active", authVersion: 2 }, now)).toBe(false);
  });
});
