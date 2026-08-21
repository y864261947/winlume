import { afterEach, describe, expect, it, vi } from "vitest";
import { parseProductionPack } from "@/lib/agent/production-packs/contracts";

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
    getProductionPack: vi.fn(),
    getSkill: vi.fn(),
    loadCapabilityCatalog: vi.fn(),
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

vi.mock("@/lib/agent/production-packs/registry", () => ({
  getProductionPack: mocks.getProductionPack,
}));

vi.mock("@/lib/agent/skills/registry", () => ({
  getSkill: mocks.getSkill,
}));

vi.mock("@/lib/studio/capabilities.server", () => ({
  loadCapabilityCatalog: mocks.loadCapabilityCatalog,
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

const workflowPack = parseProductionPack(
  JSON.stringify({
    schemaVersion: 1,
    id: "content-office",
    version: "1.1.0",
    sceneIds: ["content-office"],
    title: "内容与办公工作流",
    summary: "从需求澄清到经过审阅的工作文档。",
    requiredCapabilities: ["chat"],
    intake: [
      {
        id: "topic",
        label: "主题",
        type: "text",
        required: true,
        description: "需要完成的内容主题。",
      },
      {
        id: "source-artifact",
        label: "参考材料",
        type: "artifact",
        required: false,
        description: "已有材料。",
        kinds: ["markdown"],
      },
    ],
    expectedArtifacts: [{ id: "brief", kinds: ["markdown"], required: true }],
    stages: [
      {
        id: "intake",
        title: "需求澄清",
        objective: "将任务转成可执行 brief。",
        handoffSummary: "向下一阶段提供工作简报。",
        skillIds: ["production-content-intake"],
        requiredInputs: [],
        outputs: [{ id: "brief", kinds: ["markdown"], required: true }],
        allowedTools: ["write_artifact"],
        qualityChecks: ["brief includes audience and outcome"],
        approvalPolicy: "none",
        maxAutomaticRevisions: 0,
      },
    ],
  }),
);

const workflowSession = {
  id: "session-1",
  userId: "user-1",
  title: "内容与办公工作流",
  model: "gpt-test",
  workflow: {
    schemaVersion: 1 as const,
    workflowId: "workflow-1",
    packId: "content-office",
    packVersion: "1.1.0",
    intakeValues: {
      topic: "夏季新品",
      "source-artifact": "artifact-1",
    },
    inputArtifactIds: ["artifact-1"],
    boundAt: "2026-08-04T06:00:00.000Z",
  },
};

const availableCapabilities = {
  models: ["server-model"],
  capabilities: [
    {
      id: "chat" as const,
      availability: "available" as const,
      supportedTools: ["write_artifact" as const],
      effectiveModel: "server-model",
    },
  ],
};

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

  it("starts the first Workflow Stage from server-owned Session state", async () => {
    const run = {
      id: "run-workflow-1",
      userId: "user-1",
      sessionId: "session-1",
      status: "completed",
    };
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.getSession.mockResolvedValue({
      ...workflowSession,
      workflow: {
        ...workflowSession.workflow,
        packSnapshot: workflowPack,
      },
    });
    mocks.getProductionPack.mockResolvedValue(null);
    mocks.getSkill.mockResolvedValue({
      id: "production-content-intake",
      contract: { allowedTools: ["write_artifact"] },
    });
    mocks.loadCapabilityCatalog.mockResolvedValue(availableCapabilities);
    mocks.registerTurn.mockReturnValue({ controller: new AbortController() });
    mocks.coordinator.submit.mockResolvedValue({
      run,
      queueJobId: "job-workflow-1",
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
          sessionId: "session-1",
          message: "",
          workflowAction: "start",
        }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(mocks.coordinator.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyScope: "user:user-1:workflow:workflow-1",
        idempotencyKey: "stage:intake:iteration:0",
        metadata: {
          production: expect.objectContaining({
            workflowId: "workflow-1",
            phase: "executing",
            execution: expect.objectContaining({ stageId: "intake", iteration: 0 }),
          }),
        },
        input: expect.objectContaining({
          message: expect.stringContaining("需求澄清"),
          model: "server-model",
          skillIds: ["production-content-intake"],
          skillSelectionMode: "replace",
          allowedToolNames: ["write_artifact"],
          referencedArtifactIds: ["artifact-1"],
        }),
      }),
    );
    await response.text();
  });

  it("rejects caller-owned execution mode when starting a Workflow Stage", async () => {
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.getSession.mockResolvedValue(workflowSession);

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "session-1",
          workflowAction: "start",
          executionMode: "codex",
        }),
      }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Workflow execution settings are server-owned",
    });
    expect(mocks.coordinator.submit).not.toHaveBeenCalled();
  });

  it("rechecks Pack capabilities before starting a Workflow Stage", async () => {
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.getSession.mockResolvedValue(workflowSession);
    mocks.getProductionPack.mockResolvedValue(workflowPack);
    mocks.loadCapabilityCatalog.mockResolvedValue({
      models: [],
      capabilities: [
        {
          id: "chat",
          availability: "needs_setup",
          supportedTools: [],
          reason: "尚未配置对话模型",
        },
      ],
    });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "session-1",
          workflowAction: "start",
        }),
      }) as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: "Pack requirements are unavailable",
        code: "pack_unavailable",
      }),
    );
    expect(mocks.coordinator.submit).not.toHaveBeenCalled();
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
      `"type":"session","sessionId":"${clientSessionId}"`,
    );
  });

  it("speaks the AI SDK UIMessageChunk protocol when ?protocol=ui is set", async () => {
    const clientSessionId = "11111111-2222-4333-8444-555555555556";
    const run = {
      id: "run-ui-protocol-1",
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
      queueJobId: "job-ui-protocol-1",
      created: true,
      policy: { allowed: true },
    });
    mocks.coordinator.replay.mockResolvedValue([
      {
        sequence: 1,
        type: "agent.event",
        payload: { event: { type: "message_start", messageId: "msg-1" } },
      },
      {
        sequence: 2,
        type: "agent.event",
        payload: { event: { type: "text_delta", text: "你好" } },
      },
      {
        sequence: 3,
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
      new Request("http://localhost/api/chat?protocol=ui", {
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
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    const stream = await response.text();
    expect(stream).toContain(`"type":"start","messageId":"msg-1"`);
    expect(stream).toContain(`"type":"text-start","id":"text-0"`);
    expect(stream).toContain(`"type":"text-delta","id":"text-0","delta":"你好"`);
    // Legacy shape must not leak through on this protocol.
    expect(stream).not.toContain(`"type":"text_delta"`);
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

  it("does not reconnect a Workflow start to an active Run from another scope", async () => {
    const activeRun = {
      id: "run-unrelated",
      userId: "user-1",
      sessionId: "session-1",
      idempotencyKey: "stage:intake:iteration:0",
      idempotencyScope: "user:user-1:session:session-1",
      status: "running",
    };
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.getSession.mockResolvedValue(workflowSession);
    mocks.getProductionPack.mockResolvedValue(workflowPack);
    mocks.getSkill.mockResolvedValue({
      id: "production-content-intake",
      contract: { allowedTools: ["write_artifact"] },
    });
    mocks.loadCapabilityCatalog.mockResolvedValue(availableCapabilities);
    mocks.getAgentRunService.mockReturnValue({
      coordinator: mocks.coordinator,
      findActiveSessionRun: vi.fn().mockResolvedValue(activeRun),
      start: mocks.start,
    });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "session-1",
          workflowAction: "start",
        }),
      }) as never,
    );

    expect(response.status).toBe(409);
    expect(mocks.coordinator.submit).not.toHaveBeenCalled();
  });
});
