import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseProductionPack } from "@/lib/agent/production-packs/contracts";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  getProductionPack: vi.fn(),
  loadCapabilityCatalog: vi.fn(),
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
    stages: [
      {
        id: "intake",
        title: "需求澄清",
        objective: "内部执行目标。",
        skillIds: ["production-content-intake"],
        requiredInputs: [],
        outputs: [{ id: "brief", kinds: ["markdown"], required: true }],
        allowedTools: ["write_artifact"],
        qualityChecks: ["内部质量规则"],
        approvalPolicy: "none",
        maxAutomaticRevisions: 0,
      },
    ],
  }),
);

const context = { params: Promise.resolve({ id: "content-office" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUserId.mockResolvedValue("user-1");
  mocks.getProductionPack.mockResolvedValue(pack);
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

describe("GET /api/packs/[id]", () => {
  it("requires authentication before reading the registry", async () => {
    mocks.getCurrentUserId.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/packs/content-office"),
      context,
    );

    expect(response.status).toBe(401);
    expect(mocks.getProductionPack).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown Pack and public detail for a known Pack", async () => {
    mocks.getProductionPack.mockResolvedValueOnce(null).mockResolvedValueOnce(pack);

    const missing = await GET(
      new NextRequest("http://localhost/api/packs/missing"),
      { params: Promise.resolve({ id: "missing" }) },
    );
    const found = await GET(
      new NextRequest("http://localhost/api/packs/content-office"),
      context,
    );
    const payload = await found.json();

    expect(missing.status).toBe(404);
    expect(found.status).toBe(200);
    expect(payload.pack).toMatchObject({
      id: "content-office",
      availability: { available: true },
    });
    expect(JSON.stringify(payload)).not.toContain("production-content-intake");
  });
});
