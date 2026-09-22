import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({ status: 0 }));
vi.mock("@/lib/platform/admin", () => {
  class PlatformAdminError extends Error { constructor(message: string, readonly status: number) { super(message); } }
  return { PlatformAdminError, requirePlatformAdmin: async () => { if (state.status) throw new PlatformAdminError("无权限", state.status); } };
});
vi.mock("@/lib/service-integrations/service", () => ({ listServices: vi.fn(async () => []), saveService: vi.fn(), testService: vi.fn() }));
import { GET, POST } from "./route";
import { listServices, saveService, testService } from "@/lib/service-integrations/service";
beforeEach(() => { state.status = 0; vi.clearAllMocks(); });
function request(body: unknown, headers: Record<string, string> = {}) { return new NextRequest("https://reizo.test/api/admin/service-integrations", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }); }
describe("service admin authorization", () => {
  it.each([401, 403])("denies all actions with status %s before accessing credentials", async (status) => {
    state.status = status;
    expect((await GET()).status).toBe(status);
    for (const action of ["save", "test"]) expect((await POST(request({ id: "tavily", action, revision: 0 }))).status).toBe(status);
    expect(listServices).not.toHaveBeenCalled(); expect(saveService).not.toHaveBeenCalled(); expect(testService).not.toHaveBeenCalled();
  });
  it("prevents caching and rejects cross-site mutations and unknown providers", async () => {
    expect((await GET()).headers.get("cache-control")).toBe("no-store");
    expect((await POST(request({ id: "tavily", action: "test", revision: 0 }, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await POST(request({ id: "custom", action: "test", revision: 0 }))).status).toBe(400);
    expect(testService).not.toHaveBeenCalled();
  });
  it("does not expose database errors containing credentials", async () => {
    vi.mocked(saveService).mockRejectedValueOnce(new Error("SQL encrypted:key test-key"));
    const result = await POST(request({ id: "tavily", action: "save", config: {} }));
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("test-key");
  });
});
