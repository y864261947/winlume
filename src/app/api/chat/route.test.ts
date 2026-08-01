import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const listeners = new Set<(event: unknown) => void>();
  const coordinator = {
    submit: vi.fn(),
    subscribe: vi.fn((_runId: string, listener: (event: unknown) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    replay: vi.fn(),
    getRun: vi.fn(),
  };
  return {
    coordinator,
    listeners,
    getCurrentUserId: vi.fn(),
    getAgentRunService: vi.fn(),
    registerTurn: vi.fn(),
    unregisterTurn: vi.fn(),
    getSession: vi.fn(),
    createSession: vi.fn(),
    getProject: vi.fn(),
    start: vi.fn(),
  };
});

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));

vi.mock("@/lib/agent/infrastructure", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/infrastructure")>();
  return {
    ...actual,
    getAgentRunService: mocks.getAgentRunService,
  };
});

vi.mock("@/lib/agent/turn-registry", () => ({
  registerTurn: mocks.registerTurn,
  unregisterTurn: mocks.unregisterTurn,
}));

vi.mock("@/lib/host/web/store-singleton", () => ({
  webStore: {
    sessions: {
      getSession: mocks.getSession,
      createSession: mocks.createSession,
    },
    projects: {
      getProject: mocks.getProject,
    },
  },
}));

import { POST } from "./route";

describe("POST /api/chat", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.listeners.clear();
  });

  it("submits a durable run and streams persisted agent events as SSE", async () => {
    const run = {
      id: "run-1",
      userId: "user-1",
      sessionId: "session-1",
      projectId: "project-1",
      status: "completed",
    };
    const events = [
      {
        sequence: 1,
        type: "run.created",
        payload: { userId: "user-1", sessionId: "session-1", executionMode: "ai-sdk" },
      },
      {
        sequence: 2,
        type: "run.status_changed",
        payload: { from: "queued", to: "running" },
      },
      {
        sequence: 3,
        type: "agent.event",
        payload: { event: { type: "text_delta", text: "Hello from the run" } },
      },
      {
        sequence: 4,
        type: "agent.event",
        payload: { event: { type: "done", reason: "completed" } },
      },
      {
        sequence: 5,
        type: "run.status_changed",
        payload: { from: "running", to: "completed" },
      },
    ];

    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.getSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      model: "gpt-4o-mini",
      projectId: "project-1",
    });
    mocks.getProject.mockResolvedValue({ id: "project-1", name: "Project" });
    mocks.registerTurn.mockReturnValue({ controller: new AbortController() });
    mocks.coordinator.submit.mockResolvedValue({
      run,
      queueJobId: "job-1",
      created: true,
      policy: { allowed: true },
    });
    mocks.coordinator.replay.mockImplementation(
      async (_runId: string, after = 0) =>
        events.filter((event) => event.sequence > after),
    );
    mocks.coordinator.getRun.mockResolvedValue(run);
    mocks.getAgentRunService.mockReturnValue({
      coordinator: mocks.coordinator,
      findActiveSessionRun: vi.fn().mockResolvedValue(null),
      start: mocks.start,
    });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "session-1",
          message: "Write a greeting",
          executionMode: "ai-sdk",
        }),
      }) as never,
    );

    expect(response.headers.get("x-run-id")).toBe("run-1");
    expect(mocks.coordinator.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        sessionId: "session-1",
        projectId: "project-1",
        input: expect.objectContaining({
          message: "Write a greeting",
          executionMode: "ai-sdk",
          model: "gpt-4o-mini",
        }),
      }),
    );
    expect(mocks.start).toHaveBeenCalledOnce();

    const stream = await response.text();
    expect(stream).toContain('"type":"run"');
    expect(stream).toContain('"status":"running"');
    expect(stream).toContain('"text":"Hello from the run"');
    expect(stream).toContain('"type":"done"');
  });

  it("reconnects to an active idempotent run without submitting a second turn", async () => {
    const run = {
      id: "run-active",
      userId: "user-1",
      sessionId: "session-1",
      idempotencyKey: "retry-key",
      status: "running",
    };
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.getSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      model: "gpt-4o-mini",
    });
    mocks.coordinator.replay.mockResolvedValue([
      {
        sequence: 1,
        type: "run.status_changed",
        payload: { from: "running", to: "completed" },
      },
    ]);
    mocks.coordinator.getRun.mockResolvedValue({ ...run, status: "completed" });
    mocks.getAgentRunService.mockReturnValue({
      coordinator: mocks.coordinator,
      findActiveSessionRun: vi.fn().mockResolvedValue(run),
      start: mocks.start,
    });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "retry-key",
        },
        body: JSON.stringify({ sessionId: "session-1", message: "Retry me" }),
      }) as never,
    );

    expect(response.headers.get("x-run-id")).toBe("run-active");
    expect(mocks.coordinator.submit).not.toHaveBeenCalled();
    expect(mocks.registerTurn).not.toHaveBeenCalled();
    await expect(response.text()).resolves.toContain('"status":"completed"');
  });
});
