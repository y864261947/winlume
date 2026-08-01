import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  getAgentRunService: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));

vi.mock("@/lib/agent/infrastructure", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/infrastructure")>();
  return { ...actual, getAgentRunService: mocks.getAgentRunService };
});

import { GET } from "./route";

describe("GET /api/runs/[id]/events", () => {
  afterEach(() => vi.clearAllMocks());

  it("rejects a zero event limit instead of returning the complete log", async () => {
    mocks.getCurrentUserId.mockResolvedValue("user-1");

    const response = await GET(
      new NextRequest("http://localhost/api/runs/run-1/events?limit=0"),
      { params: Promise.resolve({ id: "run-1" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.getAgentRunService).not.toHaveBeenCalled();
  });
});
