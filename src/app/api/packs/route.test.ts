import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseProductionPack } from "@/lib/agent/production-packs/contracts";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  listProductionPacks: vi.fn(),
  listProductionPacksForScene: vi.fn(),
  loadCapabilityCatalog: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));

vi.mock("@/lib/agent/production-packs/registry", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/agent/production-packs/registry")
  >();
  return {
    ...actual,
    listProductionPacks: mocks.listProductionPacks,
    listProductionPacksForScene: mocks.listProductionPacksForScene,
  };
});

vi.mock("@/lib/studio/capabilities.server", () => ({
  loadCapabilityCatalog: mocks.loadCapabilityCatalog,
}));

import { GET } from "./route";

const pack = parseProductionPack(
  JSON.stringify({
    schemaVersion: 1,
    id: "content-office",
    version: "1.1.0",
    sceneIds: ["content-office"],
    title: "内容与办公工作流",
    summary: "从需求澄清到经过审阅的工作文档。",
    requiredCapabilities: ["chat"],
    intake: [],
    expectedArtifacts: [{ id: "brief", kinds: ["markdown"], required: true }],
    stages: [
      {
        id: "intake",
        title: "需求澄清",
        objective: "内部执行目标，不应公开。",
        handoffSummary: "向下一阶段提供工作简报。",
        skillIds: ["production-content-intake"],
        requiredInputs: [],
        outputs: [{ id: "brief", kinds: ["markdown"], required: true }],
        allowedTools: ["write_artifact"],
        qualityChecks: ["内部质量规则，不应公开"],
        approvalPolicy: "none",
        maxAutomaticRevisions: 0,
      },
    ],
  }),
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUserId.mockResolvedValue("user-1");
  mocks.listProductionPacks.mockResolvedValue([pack]);
  mocks.listProductionPacksForScene.mockResolvedValue([pack]);
  mocks.loadCapabilityCatalog.mockResolvedValue({
    models: ["gpt-test"],
    capabilities: [
      {
        id: "chat",
        availability: "available",
        supportedTools: ["write_artifact"],
      },
    ],
  });
});

describe("GET /api/packs", () => {
  it("requires authentication", async () => {
    mocks.getCurrentUserId.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/packs"),
    );

    expect(response.status).toBe(401);
    expect(mocks.listProductionPacks).not.toHaveBeenCalled();
  });

  it("returns public Pack metadata with server-resolved availability", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/packs?scene=content-office"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.listProductionPacksForScene).toHaveBeenCalledWith(
      "content-office",
    );
    expect(payload.packs[0]).toMatchObject({
      id: "content-office",
      intake: [],
      availability: { available: true, missingCapabilityIds: [] },
      stages: [
        {
          id: "intake",
          handoffSummary: "向下一阶段提供工作简报。",
        },
      ],
    });
    expect(JSON.stringify(payload)).not.toContain("production-content-intake");
    expect(JSON.stringify(payload)).not.toContain("内部执行目标");
    expect(JSON.stringify(payload)).not.toContain("write_artifact");
  });
});
