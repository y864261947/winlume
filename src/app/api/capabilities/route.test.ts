import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadCapabilityCatalog: vi.fn(),
  getCurrentUserId: vi.fn(),
  resolveStudioToken: vi.fn(),
}));

vi.mock("@/lib/studio/capabilities.server", () => ({
  loadCapabilityCatalog: mocks.loadCapabilityCatalog,
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));
vi.mock("@/lib/agent/provider/studio-token", () => ({
  resolveStudioToken: mocks.resolveStudioToken,
}));

import { GET } from "./route";

describe("GET /api/capabilities", () => {
  it("returns the safe live catalog without caching", async () => {
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.resolveStudioToken.mockResolvedValue("user-studio-token");
    mocks.loadCapabilityCatalog.mockResolvedValue({
      models: ["gpt-test"],
      capabilities: [
        {
          id: "chat",
          availability: "available",
          supportedTools: ["write_artifact"],
          effectiveModel: "gpt-test",
        },
      ],
    });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toEqual(
      expect.objectContaining({
        models: ["gpt-test"],
        capabilities: [expect.objectContaining({ id: "chat" })],
      }),
    );
    expect(JSON.stringify(payload)).not.toMatch(/token|authorization|upstream/i);
    expect(mocks.loadCapabilityCatalog).toHaveBeenCalledWith({
      authToken: "user-studio-token",
    });
  });
});
