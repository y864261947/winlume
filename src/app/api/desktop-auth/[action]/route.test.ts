import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
const mocks = vi.hoisted(() => ({ db: vi.fn(), auth: vi.fn(), limit: vi.fn(), mode: vi.fn(), models: vi.fn(), revoke: vi.fn() }));
vi.mock("@/lib/platform/desktop-model-session", () => ({
  resolveDesktopModelSession: mocks.models, revokeDesktopModelSession: mocks.revoke,
  DesktopModelSessionError: class extends Error { constructor(message: string, public status: number) { super(message); } },
}));
vi.mock("@/lib/platform/db/client", () => ({ getPlatformDb: mocks.db }));
vi.mock("@/lib/auth/session", () => ({ getCurrentAuthContext: mocks.auth }));
vi.mock("@/lib/platform/rate-limit", () => ({ consumeRateLimit: mocks.limit }));
vi.mock("@/lib/platform/auth", () => ({ getAuthMode: mocks.mode }));
import { GET, POST, DELETE } from "./route";
import { createDesktopGrant } from "@/lib/platform/desktop-auth";

const origin = "https://reizo.example";
const grant = createDesktopGrant();
function req(action: string, method = "GET", options: { body?: unknown; origin?: string; token?: string } = {}) {
  return new Request(`${origin}/api/desktop-auth/${action}`, { method, headers: { ...(options.origin ? { origin: options.origin } : {}), ...(options.token ? { authorization: `Bearer ${options.token}` } : {}), ...(options.body ? { "content-type": "application/json" } : {}) }, ...(options.body ? { body: JSON.stringify(options.body) } : {}) });
}
const context = (action: string) => ({ params: Promise.resolve({ action }) });
const select = (rows: unknown[]) => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("NEXTAUTH_URL", origin); mocks.mode.mockReturnValue("reizo"); mocks.limit.mockReturnValue(true); mocks.auth.mockResolvedValue({ userId: 'u', authVersion: 1 }); mocks.db.mockReturnValue({}); });

describe("desktop auth routes", () => {
  it("requires the desktop bearer for model bootstrap and keeps the response uncached", async () => {
    expect((await GET(req('model-session'), context('model-session'))).status).toBe(401);
    expect(mocks.models).not.toHaveBeenCalled();
    mocks.models.mockResolvedValue({ credential: { apiKey: 'sk-device-test' } });
    const response = await GET(req('model-session', 'GET', { token: grant.token }), context('model-session'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.models).toHaveBeenCalledOnce();
    expect((await response.json()).credential.apiKey).toBe('sk-device-test');
  });
  it("starts with hashed persistence and does not put the token in the browser URL", async () => {
    const values = vi.fn(async () => undefined);
    mocks.db.mockReturnValue({ delete: () => ({ where: async () => undefined }), insert: () => ({ values }) });
    const response = await POST(req("start", "POST"), context("start"));
    const result = await response.json();
    expect(response.status).toBe(201); expect(result.verificationUrl).toBe(`${origin}/desktop/connect?request=${result.requestId}`);
    expect(JSON.stringify(values.mock.calls[0])).not.toContain(result.token);
  });
  it("requires same-origin JSON and a valid browser login for approval", async () => {
    expect((await POST(req("approve", "POST", { origin: 'https://evil.example', body: {} }), context("approve"))).status).toBe(403);
    expect((await POST(req("approve", "POST", { body: {} }), context("approve"))).status).toBe(403);
    mocks.auth.mockResolvedValue(null);
    expect((await POST(req("approve", "POST", { origin, body: {} }), context("approve"))).status).toBe(401);
  });
  it("conditionally approves only a matching, unclaimed, unexpired request", async () => {
    const where = vi.fn<(condition: SQL) => { returning: () => Promise<{ id: string }[]> }>().mockReturnValue({ returning: async () => [{ id: grant.row.id }] });
    mocks.db.mockReturnValue({ update: () => ({ set: () => ({ where }) }) });
    const response = await POST(req("approve", "POST", { origin, body: { requestId: grant.row.id, code: grant.code } }), context("approve"));
    expect(response.status).toBe(200);
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.sql).toContain('"user_id" is null'); expect(query.sql).toContain('"expires_at" >'); expect(query.params).toContain(grant.row.codeHash);
    where.mockReturnValue({ returning: async () => [] });
    expect((await POST(req("approve", "POST", { origin, body: { requestId: grant.row.id, code: grant.code } }), context("approve"))).status).toBe(409);
  });
  it("never exposes the confirmation code through the public request endpoint", async () => {
    mocks.db.mockReturnValue({ select: () => select([{ expiresAt: grant.row.expiresAt }]) });
    const response = await GET(new Request(`${origin}/api/desktop-auth/request?request=${grant.row.id}`), context("request"));
    expect(await response.json()).toEqual({ expiresAt: grant.row.expiresAt.toISOString() });
  });
  it("returns pending without a user, then validates current user status and authVersion", async () => {
    const selectMock = vi.fn().mockReturnValueOnce(select([{ ...grant.row, userId: null }]));
    mocks.db.mockReturnValue({ select: selectMock });
    expect(await (await GET(req("session", "GET", { token: grant.token }), context("session"))).json()).toMatchObject({ status: 'pending' });
    selectMock.mockReturnValueOnce(select([{ ...grant.row, userId: 'u', authVersion: 1 }])).mockReturnValueOnce(select([{ id: 'u', username: 'test', displayName: 'Test', email: null, status: 'active', authVersion: 2 }]));
    expect((await GET(req("session", "GET", { token: grant.token }), context("session"))).status).toBe(401);
  });
  it("rejects missing credentials and revokes by token hash", async () => {
    expect((await GET(req("session"), context("session"))).status).toBe(401);
    const where = vi.fn<(condition: SQL) => Promise<void>>().mockResolvedValue(undefined); mocks.db.mockReturnValue({ delete: () => ({ where }) });
    expect((await DELETE(req("session", "DELETE", { token: grant.token }), context("session"))).status).toBe(200);
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toContain(grant.row.tokenHash);
  });
  it("returns only public identity for a live grant and rejects an expired one", async () => {
    const selectMock = vi.fn().mockReturnValueOnce(select([{ ...grant.row, userId: 'u', authVersion: 1 }]))
      .mockReturnValueOnce(select([{ id: 'u', username: 'test', displayName: 'Test', email: null, status: 'active', authVersion: 1 }]));
    mocks.db.mockReturnValue({ select: selectMock });
    const response = await GET(req("session", "GET", { token: grant.token }), context("session"));
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'authenticated', expiresAt: grant.row.expiresAt.toISOString(), user: { id: 'u', username: 'test', displayName: 'Test', email: null } });
    selectMock.mockReturnValueOnce(select([{ ...grant.row, expiresAt: new Date(0) }]));
    expect((await GET(req("session", "GET", { token: grant.token }), context("session"))).status).toBe(401);
  });
  it("bounds creation and fails closed when unavailable or legacy", async () => {
    mocks.limit.mockReturnValue(false); expect((await POST(req("start", "POST"), context("start"))).status).toBe(429);
    mocks.mode.mockReturnValue('legacy'); expect((await POST(req("start", "POST"), context("start"))).status).toBe(503);
  });
  it.skipIf(!process.env.REIZO_DESKTOP_SOURCE)("speaks the desktop client's actual protocol through approval, restart and logout", async () => {
    // Optional cross-repository acceptance; ordinary web CI needs no sibling checkout.
    const modulePath = `${process.env.REIZO_DESKTOP_SOURCE!.replace(/\\/g, '/')}/src/main/account/service.ts`;
    const { AccountService } = await import(/* @vite-ignore */ modulePath);
    let row: (ReturnType<typeof createDesktopGrant>['row'] & { userId: string | null; authVersion: number | null }) | null = null;
    let disk: object | null = null;
    const account = { id: 'u', username: 'test', displayName: 'Test', email: null, status: 'active', authVersion: 1 };
    const { desktopSessions } = await import('@/lib/platform/db/schema');
    mocks.db.mockReturnValue({
      delete: () => ({ where: async (condition: SQL) => { if (new PgDialect().sqlToQuery(condition).sql.includes('token_hash')) row = null; } }),
      insert: () => ({ values: async (value: ReturnType<typeof createDesktopGrant>['row']) => { row = { ...value, userId: null, authVersion: null }; } }),
      select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => table === desktopSessions ? (row ? [row] : []) : [account] }) }) }),
      update: () => ({ set: (patch: object) => ({ where: () => ({ returning: async () => { if (!row || row.userId) return []; row = { ...row, ...patch }; return [{ id: row.id }]; } }) }) }),
    });
    const fetcher: typeof fetch = async (input, init) => {
      const request = new Request(String(input), init); const action = new URL(request.url).pathname.split('/').pop()!;
      return (request.method === 'POST' ? POST : request.method === 'DELETE' ? DELETE : GET)(request, context(action));
    };
    const open = vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined);
    const modelLease = { organizationId: 'org-1', organizationName: 'Workspace', apiKey: 'sk-device-test', baseUrl: 'https://gateway.example/v1',
      expiresAt: new Date(Date.now() + 600_000).toISOString(), models: [{ id: 'chat-1', name: 'Chat' }] };
    mocks.models.mockResolvedValue({ credential: modelLease });
    const deps = { origin, fetch: fetcher, read: () => disk, write: (value: object | null) => { disk = value; }, open, connected: vi.fn(), modelSessions: true };
    const client = new AccountService(deps);
    const pending = await client.start(); expect(pending.status).toBe('pending');
    expect((await client.refresh()).status).toBe('pending');
    const requestId = new URL(open.mock.calls[0][0]).searchParams.get('request');
    expect((await POST(req('approve', 'POST', { origin, body: { requestId, code: pending.code } }), context('approve'))).status).toBe(200);
    const connected = await client.refresh();
    expect(connected).toMatchObject({ status: 'authenticated', user: { id: 'u', displayName: 'Test' }, models: { ready: true, organizationId: 'org-1' } });
    expect(JSON.stringify(connected)).not.toContain('sk-device-test');
    expect(client.modelCredential()).toEqual(modelLease);
    expect(disk).not.toBeNull(); expect(deps.connected).toHaveBeenCalledOnce();
    const restart = new AccountService(deps);
    expect(restart.modelCredential()).toBeNull();
    expect((await restart.refresh()).status).toBe('authenticated');
    mocks.models.mockResolvedValue({ credential: { ...modelLease, organizationId: 'org-2' } });
    await restart.refresh(); expect(restart.modelCredential().organizationId).toBe('org-2');
    await restart.logout(); expect(disk).toBeNull(); expect(row).toBeNull();
    expect(restart.modelCredential()).toBeNull(); expect(mocks.revoke).toHaveBeenCalledOnce();
    expect((await client.refresh()).status).toBe('signed-out');
  });
});
