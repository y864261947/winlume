import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseProductionPack } from "@/lib/agent/production-packs/contracts";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  getProductionPack: vi.fn(),
  loadCapabilityCatalog: vi.fn(),
  getProject: vi.fn(),
  getSession: vi.fn(),
  createSession: vi.fn(),
  getArtifact: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));

vi.mock("@/lib/agent/production-packs/registry", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/agent/production-packs/registry")
  >();
  return { ...actual, getProductionPack: mocks.getProductionPack };
});

vi.mock("@/lib/studio/capabilities.server", () => ({
  loadCapabilityCatalog: mocks.loadCapabilityCatalog,
}));

vi.mock("@/lib/host/web/store-singleton", () => ({
  webStore: {
    projects: { getProject: mocks.getProject },
    sessions: {
      getSession: mocks.getSession,
      createSession: mocks.createSession,
    },
    artifacts: { get: mocks.getArtifact },
  },
}));

import { POST } from "./route";

const pack = parseProductionPack(
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

const context = { params: Promise.resolve({ id: "content-office" }) };
const catalog = {
  models: ["gpt-test"],
  capabilities: [
    {
      id: "chat",
      availability: "available",
      supportedTools: ["write_artifact"],
      effectiveModel: "gpt-test",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUserId.mockResolvedValue("user-1");
  mocks.getProductionPack.mockResolvedValue(pack);
  mocks.loadCapabilityCatalog.mockResolvedValue(catalog);
  mocks.getProject.mockResolvedValue({ id: "project-1", userId: "user-1" });
  mocks.getSession.mockResolvedValue(null);
  mocks.getArtifact.mockResolvedValue({
    id: "artifact-1",
    userId: "user-1",
    sessionId: "source-session",
    name: "brief.md",
    kind: "markdown",
    mimeType: "text/markdown",
    storageKey: "artifact-1",
    createdAt: "2026-08-04T06:00:00.000Z",
  });
  mocks.createSession.mockImplementation(async (input) => ({
    ...input,
    createdAt: "2026-08-04T06:00:00.000Z",
    updatedAt: "2026-08-04T06:00:00.000Z",
  }));
});

describe("POST /api/packs/[id]/launch", () => {
  it("requires authentication and rejects caller-controlled execution fields", async () => {
    mocks.getCurrentUserId.mockResolvedValueOnce(null);
    const unauthorized = await POST(
      new NextRequest("http://localhost/api/packs/content-office/launch", {
        method: "POST",
        body: JSON.stringify({ version: "1.1.0", intake: { topic: "新品" } }),
      }),
      context,
    );

    mocks.getCurrentUserId.mockResolvedValue("user-1");
    const tampered = await POST(
      new NextRequest("http://localhost/api/packs/content-office/launch", {
        method: "POST",
        body: JSON.stringify({
          version: "1.1.0",
          intake: { topic: "新品" },
          skillIds: ["caller-controlled"],
        }),
      }),
      context,
    );

    expect(unauthorized.status).toBe(401);
    expect(tampered.status).toBe(400);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("rejects stale versions and unavailable required capabilities", async () => {
    const stale = await POST(
      new NextRequest("http://localhost/api/packs/content-office/launch", {
        method: "POST",
        body: JSON.stringify({ version: "1.0.0", intake: { topic: "新品" } }),
      }),
      context,
    );
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
    const unavailable = await POST(
      new NextRequest("http://localhost/api/packs/content-office/launch", {
        method: "POST",
        body: JSON.stringify({ version: "1.1.0", intake: { topic: "新品" } }),
      }),
      context,
    );

    expect(stale.status).toBe(409);
    expect((await stale.json()).code).toBe("pack_version_unavailable");
    expect(unavailable.status).toBe(409);
    expect((await unavailable.json()).code).toBe("pack_unavailable");
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("rejects an inaccessible or incompatible input Artifact", async () => {
    mocks.getArtifact.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "artifact-1",
      userId: "user-1",
      kind: "image",
    });
    const missing = await POST(
      new NextRequest("http://localhost/api/packs/content-office/launch", {
        method: "POST",
        body: JSON.stringify({
          version: "1.1.0",
          intake: { topic: "新品", "source-artifact": "artifact-1" },
        }),
      }),
      context,
    );
    const wrongKind = await POST(
      new NextRequest("http://localhost/api/packs/content-office/launch", {
        method: "POST",
        body: JSON.stringify({
          version: "1.1.0",
          intake: { topic: "新品", "source-artifact": "artifact-1" },
        }),
      }),
      context,
    );

    expect(missing.status).toBe(404);
    expect(wrongKind.status).toBe(400);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("creates a validated Workflow Session without creating an AgentRun", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/packs/content-office/launch", {
        method: "POST",
        body: JSON.stringify({
          version: "1.1.0",
          projectId: "project-1",
          intake: {
            topic: "  夏季新品  ",
            "source-artifact": " artifact-1 ",
          },
        }),
      }),
      context,
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        projectId: "project-1",
        model: "gpt-test",
        workflow: expect.objectContaining({
          schemaVersion: 1,
          workflowId: expect.any(String),
          packId: "content-office",
          packVersion: "1.1.0",
          intakeValues: {
            topic: "夏季新品",
            "source-artifact": "artifact-1",
          },
          inputArtifactIds: ["artifact-1"],
        }),
      }),
    );
    expect(payload).toMatchObject({
      pack: { id: "content-office" },
      session: { workflow: { packId: "content-office" } },
      initialStage: { id: "intake", index: 0, status: "ready" },
    });
    expect(payload).not.toHaveProperty("runId");
  });

  it("returns the same Workflow Session for an identical retry and rejects rebinding", async () => {
    const existingSession = {
      id: "session-1",
      userId: "user-1",
      title: "内容与办公工作流",
      model: "gpt-test",
      projectId: "project-1",
      workflow: {
        schemaVersion: 1 as const,
        workflowId: "workflow-1",
        packId: "content-office",
        packVersion: "1.1.0",
        intakeValues: { topic: "夏季新品" },
        inputArtifactIds: [],
        boundAt: "2026-08-04T06:00:00.000Z",
      },
      createdAt: "2026-08-04T06:00:00.000Z",
      updatedAt: "2026-08-04T06:00:00.000Z",
    };
    mocks.getSession.mockResolvedValue(existingSession);

    const retry = await POST(
      new NextRequest("http://localhost/api/packs/content-office/launch", {
        method: "POST",
        body: JSON.stringify({
          version: "1.1.0",
          sessionId: "session-1",
          projectId: "project-1",
          intake: { topic: "夏季新品" },
        }),
      }),
      context,
    );
    const conflict = await POST(
      new NextRequest("http://localhost/api/packs/content-office/launch", {
        method: "POST",
        body: JSON.stringify({
          version: "1.1.0",
          sessionId: "session-1",
          projectId: "project-1",
          intake: { topic: "不同主题" },
        }),
      }),
      context,
    );

    expect(retry.status).toBe(200);
    expect((await retry.json()).session).toEqual(existingSession);
    expect(conflict.status).toBe(409);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("keeps an identical Session retry idempotent when mutable availability changes", async () => {
    const existingSession = {
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
      createdAt: "2026-08-04T06:00:00.000Z",
      updatedAt: "2026-08-04T06:00:00.000Z",
    };
    mocks.getSession.mockResolvedValue(existingSession);
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
    mocks.getArtifact.mockResolvedValue(null);

    const response = await POST(
      new NextRequest("http://localhost/api/packs/content-office/launch", {
        method: "POST",
        body: JSON.stringify({
          version: "1.1.0",
          sessionId: "session-1",
          intake: {
            topic: "夏季新品",
            "source-artifact": "artifact-1",
          },
        }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect((await response.json()).session).toEqual(existingSession);
    expect(mocks.getArtifact).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});
