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

  it("submits a durable run and streams persisted events as AI SDK UIMessageChunks", async () => {
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
        payload: { event: { type: "message_start", messageId: "msg-1" } },
      },
      {
        sequence: 4,
        type: "agent.event",
        payload: { event: { type: "text_delta", text: "Hello from the run" } },
      },
      {
        sequence: 5,
        type: "agent.event",
        payload: { event: { type: "done", reason: "completed" } },
      },
      {
        sequence: 6,
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
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(stream).toContain('"type":"data-session"');
    expect(stream).toContain('"type":"data-run"');
    expect(stream).toContain('"type":"start","messageId":"msg-1"');
    expect(stream).toContain('"type":"text-start","id":"text-0"');
    expect(stream).toContain('"type":"text-delta","id":"text-0","delta":"Hello from the run"');
    expect(stream).toContain('"type":"finish","finishReason":"stop"');
    expect(stream).not.toContain('"type":"text_delta"');
  });

  it("turns Composer image settings into a tool allowlist and run metadata", async () => {
    const run = {
      id: "run-image-1",
      userId: "user-1",
      sessionId: "session-1",
      status: "completed",
    };
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.getSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      model: "gpt-4o-mini",
    });
    mocks.registerTurn.mockReturnValue({ controller: new AbortController() });
    mocks.coordinator.submit.mockResolvedValue({
      run,
      queueJobId: "job-image-1",
      created: true,
      policy: { allowed: true },
    });
    mocks.coordinator.replay.mockResolvedValue([]);
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
          message: "生成一张产品图",
          composerOptions: { mode: "image", size: "1536x1024", count: 2 },
        }),
      }) as never,
    );
    await response.text();

    expect(mocks.coordinator.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          allowedToolNames: expect.arrayContaining(["generate_image"]),
          metadata: {
            composerOptions: { mode: "image", size: "1536x1024", count: 2 },
          },
        }),
      }),
    );
  });

  it("rejects video generation while the capability is not configured", async () => {
    mocks.getCurrentUserId.mockResolvedValue("user-1");

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "session-1",
          message: "生成视频",
          composerOptions: { mode: "video" },
        }),
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(mocks.coordinator.submit).not.toHaveBeenCalled();
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

  it("bootstraps a client-minted session id on first send", async () => {
    const clientSessionId = "11111111-2222-4333-8444-555555555555";
    const run = {
      id: "run-bootstrap-1",
      userId: "user-1",
      sessionId: clientSessionId,
      status: "completed",
    };
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.getSession.mockResolvedValue(null);
    mocks.createSession.mockResolvedValue({
      id: clientSessionId,
      userId: "user-1",
      title: "新对话",
      model: "gpt-4o-mini",
    });
    mocks.registerTurn.mockReturnValue({ controller: new AbortController() });
    mocks.coordinator.submit.mockResolvedValue({
      run,
      queueJobId: "job-bootstrap-1",
      created: true,
      policy: { allowed: true },
    });
    mocks.coordinator.replay.mockResolvedValue([
      {
        sequence: 1,
        type: "run.status_changed",
        payload: { from: "running", to: "completed" },
      },
    ]);
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
          sessionId: clientSessionId,
          message: "Hello",
          bootstrap: { title: "第一条消息" },
        }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: clientSessionId, title: "第一条消息" }),
    );
    const stream = await response.text();
    expect(stream).toContain(
      `"type":"data-session","id":"session","data":{"sessionId":"${clientSessionId}"}`,
    );
  });

  it("rejects a bootstrap sessionId that isn't a UUID", async () => {
    mocks.getCurrentUserId.mockResolvedValue("user-1");

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "not-a-uuid",
          message: "Hello",
          bootstrap: { title: "x" },
        }),
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("rejects bootstrap when the session id already exists", async () => {
    const clientSessionId = "11111111-2222-4333-8444-555555555555";
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.getSession.mockResolvedValue({
      id: clientSessionId,
      userId: "user-1",
      model: "gpt-4o-mini",
    });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: clientSessionId,
          message: "Hello",
          bootstrap: { title: "x" },
        }),
      }) as never,
    );

    expect(response.status).toBe(409);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

});
