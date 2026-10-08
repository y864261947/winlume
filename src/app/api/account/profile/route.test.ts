import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mock = vi.hoisted(() => ({ auth: vi.fn(), update: vi.fn(), start: vi.fn(), complete: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentAuthContext: mock.auth }));
vi.mock("@/lib/platform/auth", () => ({ getAuthMode: () => "reizo" }));
vi.mock("@/lib/platform/db/client", () => ({ getPlatformDb: () => ({}) }));
vi.mock("@/lib/platform/rate-limit", () => ({ consumeRateLimit: mock.limit }));
vi.mock("@/lib/platform/profile-service", () => ({ ProfileService: class { update = mock.update; startEmail = mock.start; completeEmail = mock.complete; } }));
import { POST } from "./route";

const request = (body: unknown, origin = "https://reizo.example") => new NextRequest("https://reizo.example/api/account/profile", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mock.auth.mockResolvedValue({ userId: "owner", authVersion: 3 }); mock.limit.mockReturnValue(true); mock.update.mockResolvedValue({ display_name: "New" }); });

describe("profile mutation boundary", () => {
  it("rejects cross-origin requests before touching session or storage", async () => {
    expect((await POST(request({ action: "name", name: "New" }, "https://other.example"))).status).toBe(403);
    expect(mock.auth).not.toHaveBeenCalled();
  });
  it("requires a real authenticated account", async () => {
    mock.auth.mockResolvedValue(null);
    expect((await POST(request({ action: "name", name: "New" }))).status).toBe(401);
    expect(mock.update).not.toHaveBeenCalled();
  });
  it("uses session ownership, never a submitted user ID or privilege", async () => {
    expect((await POST(request({ action: "name", name: " New ", userId: "victim", platformRole: "admin" }))).status).toBe(200);
    expect(mock.update).toHaveBeenCalledWith({ userId: "owner", authVersion: 3 }, { displayName: "New" });
  });
  it("rejects empty names and malformed request bodies", async () => {
    expect((await POST(request({ action: "name", name: " " }))).status).toBe(400);
    expect((await POST(request(null))).status).toBe(400);
    expect(mock.update).not.toHaveBeenCalled();
  });
  it("enforces request size and operation rate limits", async () => {
    expect((await POST(request({ action: "name", name: "a".repeat(5000) }))).status).toBe(413);
    mock.limit.mockReturnValue(false);
    expect((await POST(request({ action: "name", name: "New" }))).status).toBe(429);
  });
  it("requires email verification instead of accepting direct email edits", async () => {
    expect((await POST(request({ action: "email", email: "test@example.com" }))).status).toBe(400);
    expect(mock.update).not.toHaveBeenCalled();
  });
});
