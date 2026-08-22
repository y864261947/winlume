import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const coordinator = {
    getRun: vi.fn(),
    replay: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  };
  return {
    coordinator,
    getCurrentUserId: vi.fn(),
    getAgentRunService: vi.fn(),
  };
});

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));

vi.mock("@/lib/agent/infrastructure", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/infrastructure")>();
  return { ...actual, getAgentRunService: mocks.getAgentRunService };
});

import { GET } from "./route";

describe("GET /api/runs/[id]/stream", () => {
  afterEach(() => vi.clearAllMocks());

  it("rejects unauthenticated requests", async () => {
    mocks.getCurrentUserId.mockResolvedValue(null);
    const response = await GET(new NextRequest("http://localhost/api/runs/run-1/stream"), {
      params: Promise.resolve({ id: "run-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("404s when the run doesn't belong to the caller", async () => {
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.coordinator.getRun.mockResolvedValue({ id: "run-1", userId: "someone-else" });
    mocks.getAgentRunService.mockReturnValue({ coordinator: mocks.coordinator });

    const response = await GET(new NextRequest("http://localhost/api/runs/run-1/stream"), {
      params: Promise.resolve({ id: "run-1" }),
    });
    expect(response.status).toBe(404);
  });

  it("streams replayed events as UIMessageChunks and closes on terminal status", async () => {
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.coordinator.getRun
      .mockResolvedValueOnce({ id: "run-1", userId: "user-1", status: "running" })
      .mockResolvedValueOnce({ id: "run-1", userId: "user-1", status: "completed" });
    mocks.coordinator.replay.mockResolvedValueOnce([
      {
        sequence: 1,
        type: "agent.event",
        payload: { event: { type: "message_start", messageId: "msg-1" } },
      },
      {
        sequence: 2,
        type: "agent.event",
        payload: { event: { type: "text_delta", text: "喵" } },
      },
    ]);
    mocks.getAgentRunService.mockReturnValue({ coordinator: mocks.coordinator });

    const response = await GET(new NextRequest("http://localhost/api/runs/run-1/stream"), {
      params: Promise.resolve({ id: "run-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    const body = await response.text();
    expect(body).toContain(`"type":"start","messageId":"msg-1"`);
    expect(body).toContain(`"type":"text-delta","id":"text-0","delta":"喵"`);
    expect(body).toContain(`"type":"data-run-cursor"`);
    expect(body).toContain(`"eventType":"message_start"`);
  });

  it("returns 204 when the durable run is already terminal", async () => {
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.coordinator.getRun.mockResolvedValue({
      id: "run-1",
      userId: "user-1",
      status: "completed",
    });
    mocks.getAgentRunService.mockReturnValue({ coordinator: mocks.coordinator });

    const response = await GET(
      new NextRequest("http://localhost/api/runs/run-1/stream"),
      { params: Promise.resolve({ id: "run-1" }) },
    );
    expect(response.status).toBe(204);
  });
});
