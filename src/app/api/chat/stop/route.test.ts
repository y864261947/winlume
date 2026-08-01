import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  getAgentRunService: vi.fn(),
  getSession: vi.fn(),
  cancelSession: vi.fn(),
  stopTurn: vi.fn(),
  repairDanglingInStore: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));

vi.mock("@/lib/agent/infrastructure", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/infrastructure")>();
  return { ...actual, getAgentRunService: mocks.getAgentRunService };
});

vi.mock("@/lib/agent/turn-registry", () => ({
  stopTurn: mocks.stopTurn,
}));

vi.mock("@/lib/agent/dangling", () => ({
  repairDanglingInStore: mocks.repairDanglingInStore,
}));

vi.mock("@/lib/host/web/store-singleton", () => ({
  webStore: { sessions: { getSession: mocks.getSession } },
}));

import { POST } from "./route";

describe("POST /api/chat/stop", () => {
  afterEach(() => vi.clearAllMocks());

  it("cancels the durable session run before falling back to the local registry", async () => {
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.getSession.mockResolvedValue({ id: "session-1", userId: "user-1" });
    mocks.cancelSession.mockResolvedValue({ id: "run-1", status: "cancelled" });
    mocks.getAgentRunService.mockReturnValue({ cancelSession: mocks.cancelSession });
    mocks.stopTurn.mockReturnValue({ stopped: false, reason: "no_active_turn" });
    mocks.repairDanglingInStore.mockResolvedValue(undefined);

    const response = await POST(
      new Request("http://localhost/api/chat/stop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "session-1" }),
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      stopped: true,
      runId: "run-1",
    });
    expect(mocks.cancelSession).toHaveBeenCalledWith("user-1", "session-1");
    expect(mocks.stopTurn).toHaveBeenCalledWith("session-1", "user-1");
  });
});
