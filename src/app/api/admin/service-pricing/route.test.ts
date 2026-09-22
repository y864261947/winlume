import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/platform/admin", () => ({ requirePlatformAdmin: mocks.admin, PlatformAdminError: class extends Error { constructor(message: string, public status: number) { super(message); } } }));
vi.mock("@/lib/service-pricing/store", () => ({ readPrices: mocks.read, savePrice: mocks.save }));
import { PlatformAdminError } from "@/lib/platform/admin";
import { GET, PUT } from "./route";
function req(body: string, headers = {}) { return new NextRequest("https://reizo-ai.com/api/admin/service-pricing", {method:"PUT", headers:{"content-type":"application/json", ...headers}, body}); }
beforeEach(() => { vi.resetAllMocks(); mocks.admin.mockResolvedValue({}); mocks.read.mockResolvedValue([]); });
describe("admin service pricing", () => {
  it("denies unauthenticated reads and writes before touching storage", async () => {
    mocks.admin.mockRejectedValue(new PlatformAdminError("Unauthorized", 401));
    expect((await GET()).status).toBe(401);
    expect((await PUT(req('{}'))).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects cross-site requests and malformed payloads", async () => {
    expect((await PUT(req('{}', {"sec-fetch-site":"cross-site"}))).status).toBe(403);
    expect((await PUT(req('{'))).status).toBe(400);
    expect((await PUT(req('{"id":"unknown"}'))).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("never caches private prices and hides raw database errors", async () => {
    expect((await GET()).headers.get('cache-control')).toBe('no-store');
    mocks.read.mockRejectedValue(new Error('sensitive SQL payload'));
    const response = await GET(); expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('sensitive');
  });
});
