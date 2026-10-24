import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { PlatformDatabase } from "./db/client";
import { apiKeys, desktopSessions, organizationMemberships, organizations, users } from "./db/schema";

const mocks = vi.hoisted(() => ({ create: vi.fn(), revoke: vi.fn(), findKey: vi.fn(), listKeys: vi.fn(), updateKey: vi.fn(), setKeyEnabled: vi.fn() }));
vi.mock("./repositories/api-keys", () => ({ ApiKeyRepository: class { create = mocks.create; revoke = mocks.revoke; } }));
vi.mock("../gateway/workspace", () => ({ workspaceGateway: () => ({ findKey: mocks.findKey, listKeys: mocks.listKeys, updateKey: mocks.updateKey, setKeyEnabled: mocks.setKeyEnabled, revokeKey: mocks.revoke }) }));
vi.mock("../newapi/crypto", () => ({ decryptSecret: () => "sk-device" }));
import { resolveDesktopModelSession, revokeDesktopModelSession } from "./desktop-model-session";

const now = new Date("2026-10-23T01:00:00Z");
const sessionId = "270b5d37-24fe-4f28-94cc-40ca6fd7791e";
type Row = Record<string, unknown>;
function fixture() {
  const state = {
    session: { id: sessionId, userId: "user-1", tokenHash: "hash", expiresAt: new Date(now.getTime() + 86_400_000), authVersion: 1 } as Row | null,
    user: { id: "user-1", currentOrganizationId: "org-1", status: "active", authVersion: 1 },
    membership: true, keys: [] as Row[],
  };
  const rows = (table: unknown) => table === desktopSessions ? state.session ? [state.session] : [] : table === users ? [state.user] :
    table === organizationMemberships ? state.membership ? [{ userId: state.user.id, organizationId: state.user.currentOrganizationId }] : [] :
    table === organizations ? [{ id: state.user.currentOrganizationId, name: "Workspace" }] : table === apiKeys ? state.keys : [];
  function query(table: unknown) {
    const builder = { where: () => builder, limit: () => builder, for: () => builder,
      then: (resolve: (value: Row[]) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(rows(table)).then(resolve, reject) };
    return builder;
  }
  const tx = {
    select: () => ({ from: (table: unknown) => query(table) }),
    update: (table: unknown) => ({ set: (patch: Row) => ({ where: async (condition: SQL) => {
      const id = new PgDialect().sqlToQuery(condition).params.at(-1);
      if (table === desktopSessions && state.session && state.session.id === id) Object.assign(state.session, patch);
      if (table === apiKeys) state.keys.filter(k => k.id === id).forEach(k => Object.assign(k, patch));
    } }) }),
  };
  // Model the session row lock so concurrency tests exercise callers sharing a device.
  let lock = Promise.resolve();
  const database = { ...tx, transaction: async (operation: (value: typeof tx) => Promise<unknown>) => {
    const previous = lock; let release!: () => void; lock = new Promise<void>(r => { release = r; });
    await previous; try { return await operation(tx); } finally { release(); }
  } } as unknown as PlatformDatabase;
  mocks.create.mockImplementation(async (input: Row) => {
    const record = { ...input, id: `key-${state.keys.length + 1}`, status: "active", newApiTokenId: 7, newApiKeyCiphertext: "cipher" };
    state.keys.push(record); return { record, plaintext: "not-disclosed" };
  });
  mocks.revoke.mockImplementation(async (id: unknown) => { state.keys.filter(k => k.id === id).forEach(k => { k.status = "revoked"; }); });
  return { state, database };
}

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  vi.stubEnv("NEW_API_URL", "https://gateway.example"); vi.stubEnv("NEW_API_PUBLIC_URL", "");
  mocks.findKey.mockResolvedValue(null);
  mocks.listKeys.mockResolvedValue([{ id: 7, status: 1, expired_time: Math.floor(now.getTime() / 1000) + 600 }]);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [
    { id: "chat-1", supported_endpoint_types: ["openai"] },
    { id: "image-1", supported_endpoint_types: ["image-generation"] },
    { id: "native-claude", supported_endpoint_types: ["anthropic"] },
  ] })));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("desktop model leases", () => {
  it("creates a workspace-scoped device key, filters unsupported protocols, and reuses it on subsequent refresh", async () => {
    const f = fixture();
    const result = await resolveDesktopModelSession(f.database, "hash");
    expect(result.credential).toMatchObject({ organizationId: "org-1", apiKey: "sk-device", baseUrl: "https://gateway.example/v1", models: [{ id: "chat-1", name: "chat-1" }] });
    expect(Date.parse(result.credential.expiresAt) - now.getTime()).toBe(600_000);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", organizationId: "org-1", metadata: { desktopSessionId: sessionId } }));
    await resolveDesktopModelSession(f.database, "hash");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("rejects expired sessions, suspended accounts and lost membership before minting any key", async () => {
    for (const change of [(s: ReturnType<typeof fixture>["state"]) => { s.session!.expiresAt = new Date(0); },
      (s: ReturnType<typeof fixture>["state"]) => { s.user.status = "suspended"; },
      (s: ReturnType<typeof fixture>["state"]) => { s.membership = false; }]) {
      const f = fixture(); change(f.state);
      await expect(resolveDesktopModelSession(f.database, "hash")).rejects.toMatchObject({ status: expect.any(Number) });
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("renews short leases but never re-enables an explicitly disabled upstream key", async () => {
    const f = fixture(); await resolveDesktopModelSession(f.database, "hash");
    f.state.keys[0].expiresAt = new Date(now.getTime() + 30_000);
    await resolveDesktopModelSession(f.database, "hash");
    expect(mocks.updateKey).toHaveBeenCalledWith(7, expect.objectContaining({ allAvailableGroups: true }));
    mocks.listKeys.mockResolvedValue([{ id: 7, status: 2 }]);
    await expect(resolveDesktopModelSession(f.database, "hash")).rejects.toMatchObject({ status: 403 });
    expect(mocks.setKeyEnabled).not.toHaveBeenCalled();
  });

  it("serializes concurrent refreshes and prevents new leases after logout", async () => {
    const f = fixture();
    await Promise.all([resolveDesktopModelSession(f.database, "hash"), resolveDesktopModelSession(f.database, "hash")]);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await revokeDesktopModelSession(f.database, "hash");
    expect(mocks.revoke).toHaveBeenCalledWith("key-1");
    await expect(resolveDesktopModelSession(f.database, "hash")).rejects.toMatchObject({ status: 401 });
  });

  it("renews an automatically expired upstream key when the Reizo session remains valid", async () => {
    const f = fixture(); await resolveDesktopModelSession(f.database, "hash");
    f.state.keys[0].expiresAt = new Date(now.getTime() - 1_000);
    mocks.listKeys.mockResolvedValue([{ id: 7, status: 3, expired_time: Math.floor(now.getTime() / 1000) - 1 }]);
    expect(Date.parse((await resolveDesktopModelSession(f.database, "hash")).credential.expiresAt)).toBe(now.getTime() + 600_000);
    expect(mocks.setKeyEnabled).toHaveBeenCalledWith(7, true);
  });

  it("expires identity even when remote revocation fails, and allows DELETE to retry it", async () => {
    const f = fixture(); await resolveDesktopModelSession(f.database, "hash");
    mocks.revoke.mockRejectedValueOnce(new Error("offline"));
    await expect(revokeDesktopModelSession(f.database, "hash")).rejects.toThrow("offline");
    expect(f.state.session!.expiresAt).toEqual(new Date(0));
    await revokeDesktopModelSession(f.database, "hash");
    expect(f.state.keys[0].status).toBe("revoked");
  });

  it("replaces leases when switching workspaces and allows switching back", async () => {
    const f = fixture(); await resolveDesktopModelSession(f.database, "hash");
    f.state.user.currentOrganizationId = "org-2";
    expect((await resolveDesktopModelSession(f.database, "hash")).credential.organizationId).toBe("org-2");
    expect(f.state.keys[0]).toMatchObject({ status: "revoked", metadata: { desktopWorkspaceSwitched: true } });
    f.state.user.currentOrganizationId = "org-1";
    expect((await resolveDesktopModelSession(f.database, "hash")).credential.organizationId).toBe("org-1");
    expect(mocks.create).toHaveBeenCalledTimes(3);
    f.state.keys[2].status = "revoked";
    await expect(resolveDesktopModelSession(f.database, "hash")).rejects.toMatchObject({ status: 403 });
    expect(mocks.create).toHaveBeenCalledTimes(3);
  });

  it("revokes a minted key if workspace membership changes during model discovery", async () => {
    const f = fixture();
    vi.mocked(fetch).mockImplementationOnce(async () => {
      f.state.membership = false;
      return Response.json({ data: [{ id: "chat-1", supported_endpoint_types: ["openai"] }] });
    });
    await expect(resolveDesktopModelSession(f.database, "hash")).rejects.toMatchObject({ status: 403 });
    expect(f.state.keys[0].status).toBe("revoked");
  });
});
