import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  getAgentRunService: vi.fn(),
  getWorkflowProjection: vi.fn(),
  executeWorkflowCommand: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));

vi.mock("@/lib/agent/infrastructure", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/infrastructure")>();
  return { ...actual, getAgentRunService: mocks.getAgentRunService };
});

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ id: "session-1" }) };
const projection = {
  workflowId: "workflow-1",
  pack: { id: "content-office", version: "1.1.0", title: "内容与办公工作流" },
  currentStage: { id: "intake", title: "需求澄清", index: 0, total: 4 },
  outputs: {},
  actions: ["approve", "request_changes"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUserId.mockResolvedValue("user-1");
  mocks.getAgentRunService.mockReturnValue({
    getWorkflowProjection: mocks.getWorkflowProjection,
    executeWorkflowCommand: mocks.executeWorkflowCommand,
  });
  mocks.getWorkflowProjection.mockResolvedValue(projection);
  mocks.executeWorkflowCommand.mockResolvedValue({
    sourceRun: { id: "run-1" },
    startedRun: { id: "run-revision" },
    created: true,
  });
});

describe("/api/sessions/[id]/workflow", () => {
  it("requires authentication before reading Workflow state", async () => {
    mocks.getCurrentUserId.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/sessions/session-1/workflow"),
      context,
    );

    expect(response.status).toBe(401);
    expect(mocks.getAgentRunService).not.toHaveBeenCalled();
  });

  it("returns the persisted, public Workflow projection", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/sessions/session-1/workflow"),
      context,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ workflow: projection });
    expect(mocks.getWorkflowProjection).toHaveBeenCalledWith("user-1", "session-1");
  });

  it("requires an idempotency key and a strict command body", async () => {
    const missingKey = await POST(
      new NextRequest("http://localhost/api/sessions/session-1/workflow", {
        method: "POST",
        body: JSON.stringify({ action: "approve", runId: "run-1" }),
      }),
      context,
    );
    const unknownField = await POST(
      new NextRequest("http://localhost/api/sessions/session-1/workflow", {
        method: "POST",
        headers: { "idempotency-key": "decision-1" },
        body: JSON.stringify({
          action: "approve",
          runId: "run-1",
          stageId: "client-owned-stage",
        }),
      }),
      context,
    );

    expect(missingKey.status).toBe(400);
    expect(unknownField.status).toBe(400);
    expect(mocks.executeWorkflowCommand).not.toHaveBeenCalled();
  });

  it("applies a command and returns only its public result plus refreshed projection", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/sessions/session-1/workflow", {
        method: "POST",
        headers: { "idempotency-key": "decision-revision-1" },
        body: JSON.stringify({
          action: "request_changes",
          runId: "run-1",
          note: "补充验收标准",
        }),
      }),
      context,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.executeWorkflowCommand).toHaveBeenCalledWith({
      action: "request_changes",
      userId: "user-1",
      sessionId: "session-1",
      runId: "run-1",
      idempotencyKey: "decision-revision-1",
      occurredAt: expect.any(String),
      note: "补充验收标准",
    });
    expect(payload).toEqual({
      command: {
        sourceRunId: "run-1",
        startedRunId: "run-revision",
        created: true,
      },
      workflow: projection,
    });
    expect(JSON.stringify(payload)).not.toContain("metadata");
    expect(JSON.stringify(payload)).not.toContain("allowedToolNames");
  });
});
