import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), content: vi.fn() }));
vi.mock("@/lib/platform/admin", () => ({
  requirePlatformAdmin: mocks.admin,
  PlatformAdminError: class extends Error { constructor(message: string, public status: number) { super(message); } },
}));
vi.mock("@/lib/portal/content-config", () => ({ getPublicPortalContent: mocks.content }));
vi.mock("@/lib/platform/auth", () => ({ getAuthMode: () => "legacy" }));
vi.mock("@/lib/agent/provider/gateway", () => ({ getGatewayBaseUrl: () => "https://gateway.test" }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUserId: async () => null }));
vi.mock("@/lib/agent/provider/studio-token", () => ({ resolveStudioToken: vi.fn() }));
import { GET } from "./route";
import { PlatformAdminError } from "@/lib/platform/admin";

describe("public catalog publication boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NEW_API_URL", "https://gateway.test");
    mocks.content.mockResolvedValue({ modelVendors: [] });
    mocks.admin.mockResolvedValue({ platformRole: "admin" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: [{ model_name: "hidden", quota_type: 0, model_price: 0, model_ratio: 1 }] }))));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
  it("does not publish the upstream catalog when no providers are enabled", async () => {
    const body = await (await GET(new Request("https://app.test/api/catalog/plaza"))).json();
    expect(body.data).toEqual([]);
  });
  it("does not restore sample rows when the gateway fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    const body = await (await GET(new Request("https://app.test/api/catalog/plaza"))).json();
    expect(body.data).toEqual([]);
  });
  it("keeps full import data available only to admins", async () => {
    const request = new Request("https://app.test/api/catalog/plaza?scope=admin-import");
    mocks.admin.mockRejectedValueOnce(new PlatformAdminError("Denied", 401));
    expect((await GET(request)).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    expect((await (await GET(request)).json()).data).toHaveLength(1);
  });

  // A 53-entry hard-coded list used to be merged in here; 49 of its names
  // were not servable by any enabled relay channel. An admin importing the
  // "full catalogue" was being offered models that cannot be served, and
  // nothing errored. The relay is the only source of truth now.
  //
  // This suite mocks getAuthMode as "legacy", so admin-import proxies
  // /api/pricing verbatim — asserting on that body proves no sample rows
  // are spliced in on the way through.
  it("does not inject hard-coded sample models into the admin import", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [{ model_name: "gpt-image-2.5" }] })),
    ));
    const body = await (await GET(new Request("https://app.test/api/catalog/plaza?scope=admin-import"))).json();
    const names = (body.data ?? []).map((m: { model_name: string }) => m.model_name);
    expect(names).toEqual(["gpt-image-2.5"]);
    for (const ghost of ["dall-e-3", "veo-3", "imagen-4", "flux-1.1-pro", "whisper-1"]) {
      expect(names).not.toContain(ghost);
    }
  });

  // An empty list is a visibly broken gateway; plausible ghosts are a
  // silently wrong one, and only the second reaches a customer.
  it("serves no ghost models when the gateway is down", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    const body = await (await GET(new Request("https://app.test/api/catalog/plaza?scope=admin-import"))).json();
    expect(body.data ?? []).toEqual([]);
  });
});
