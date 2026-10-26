import { beforeEach, expect, it, vi } from "vitest";
import { DESKTOP_SESSION_MS, hashDesktopSecret } from "@/lib/platform/desktop-auth";

const mocks = vi.hoisted(() => ({ db: vi.fn(), mode: vi.fn(), auth: vi.fn(), limit: vi.fn(), values: vi.fn(), models: vi.fn(), revoke: vi.fn() }));
vi.mock("@/lib/platform/db/client", () => ({ getPlatformDb: mocks.db }));
vi.mock("@/lib/platform/auth", () => ({ getAuthMode: mocks.mode, authenticatePlatformCredentials: mocks.auth }));
vi.mock("@/lib/platform/rate-limit", () => ({ consumeRateLimit: mocks.limit }));
vi.mock("@/lib/auth/session", () => ({ getCurrentAuthContext: vi.fn() }));
vi.mock("@/lib/platform/desktop-model-session", () => ({ resolveDesktopModelSession: mocks.models, revokeDesktopModelSession: mocks.revoke, DesktopModelSessionError: class extends Error { status = 503; } }));
import { POST } from "./route";

const origin = "https://reizo.example";
const user = { id: "11111111-1111-4111-8111-111111111111", username: "alice", displayName: "Alice", email: "alice@example.com", authVersion: 3, status: "active" };
const request = (body: unknown = { username: "alice", password: " secret " }, headers: Record<string, string> = {}) => new Request(`${origin}/api/desktop-auth/login`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("NEXTAUTH_URL", origin);
  mocks.mode.mockReturnValue("reizo"); mocks.limit.mockReturnValue(true); mocks.auth.mockResolvedValue(user);
  mocks.values.mockResolvedValue(undefined); mocks.db.mockReturnValue({ insert: () => ({ values: mocks.values }) });
});

it("reuses website password verification and persists only a hashed, revocable desktop grant", async () => {
  const before = Date.now();
  const response = await POST(request({ username: "  alice@example.com  ", password: " secret " }));
  const body = await response.json();
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(mocks.auth).toHaveBeenCalledWith({ username: "alice@example.com", password: " secret " });
  expect(body).toMatchObject({ status: "authenticated", user: { id: user.id, username: "alice" } });
  expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const row = mocks.values.mock.calls[0][0];
  expect(row).toMatchObject({ userId: user.id, authVersion: 3, tokenHash: hashDesktopSecret(body.token) });
  expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(before + DESKTOP_SESSION_MS);
  expect(JSON.stringify(row)).not.toContain(body.token); expect(JSON.stringify(row)).not.toContain("secret");
  expect(body).not.toHaveProperty("codeHash"); expect(body).not.toHaveProperty("code");
});
it("does not issue a grant for invalid or unavailable-password accounts", async () => {
  mocks.auth.mockResolvedValue(null);
  const response = await POST(request()); expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "账号或密码不正确。" }); expect(mocks.values).not.toHaveBeenCalled();
});
it("rejects cross-origin submissions, malformed input and oversized bodies before password verification", async () => {
  expect((await POST(request(undefined, { Origin: "https://evil.example" }))).status).toBe(403);
  expect((await POST(request({}, { "Content-Type": "text/plain" }))).status).toBe(415);
  for (const body of [null, [], {}, { username: "a", password: "" }, { username: "a", password: "p".repeat(129) }, { username: "a".repeat(321), password: "x" }]) expect((await POST(request(body))).status).toBe(400);
  expect((await POST(request({ username: "a", password: "x".repeat(5000) }))).status).toBe(413);
  expect((await POST(new Request(`${origin}/api/desktop-auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }))).status).toBe(400);
  expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.values).not.toHaveBeenCalled();
});
it("limits both network and account attempts before password verification", async () => {
  mocks.limit.mockReturnValueOnce(false);
  expect((await POST(request())).status).toBe(429);
  mocks.limit.mockReturnValueOnce(true).mockReturnValueOnce(false);
  expect((await POST(request())).status).toBe(429);
  expect(mocks.limit).toHaveBeenLastCalledWith(`desktop-password:account:${hashDesktopSecret("alice")}`, 10, 300_000);
  expect(mocks.auth).not.toHaveBeenCalled();
});
it("fails safely on unavailable services without echoing internal details", async () => {
  mocks.mode.mockReturnValueOnce("legacy"); expect((await POST(request())).status).toBe(503);
  mocks.db.mockReturnValueOnce(null); expect((await POST(request())).status).toBe(503);
  mocks.auth.mockRejectedValueOnce(new Error("database secret"));
  const result = await POST(request()); expect(result.status).toBe(503);
  expect(JSON.stringify(await result.json())).not.toContain("database secret"); expect(mocks.values).not.toHaveBeenCalled();
});

it.skipIf(!process.env.REIZO_DESKTOP_SOURCE)("logs the real desktop service in without browser approval, then supports session refresh and logout", async () => {
  const { AccountService } = await import(/* @vite-ignore */ `${process.env.REIZO_DESKTOP_SOURCE!.replace(/\\/g, "/")}/src/main/account/service.ts`);
  const routes = await import("../[action]/route");
  const { desktopSessions } = await import("@/lib/platform/db/schema");
  let row: Record<string, unknown> | null = null;
  let disk: unknown = null;
  mocks.db.mockReturnValue({
    insert: () => ({ values: async (value: Record<string, unknown>) => { row = value; } }),
    select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => table === desktopSessions ? (row ? [row] : []) : [user] }) }) }),
    delete: () => ({ where: async () => { row = null; } }),
  });
  mocks.models.mockResolvedValue({ credential: { organizationId: "org", organizationName: "Workspace", apiKey: "sk-test-device", baseUrl: "https://gateway.example/v1", expiresAt: new Date(Date.now() + 600_000).toISOString(), models: [{ id: "chat", name: "Chat" }] } });
  const open = vi.fn();
  const fetcher: typeof fetch = async (input, init) => {
    const req = new Request(String(input), init);
    const action = new URL(req.url).pathname.split("/").pop()!;
    if (action === "login") return POST(req);
    return (req.method === "DELETE" ? routes.DELETE : routes.GET)(req, { params: Promise.resolve({ action }) });
  };
  const client = new AccountService({ origin, fetch: fetcher, read: () => disk, write: (value: unknown) => { disk = value; }, open, connected: vi.fn(), modelSessions: true });
  expect(await client.loginWithPassword({ username: "alice", password: "secret" })).toMatchObject({ status: "authenticated", user: { id: user.id }, models: { ready: true } });
  expect(open).not.toHaveBeenCalled(); expect(JSON.stringify(disk)).not.toContain('"password"');
  expect((await client.refresh()).status).toBe("authenticated");
  await client.logout(); expect(disk).toBeNull(); expect(row).toBeNull(); expect(mocks.revoke).toHaveBeenCalledOnce();
});
