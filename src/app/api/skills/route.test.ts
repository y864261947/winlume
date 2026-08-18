import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSkill: vi.fn(),
  listDepartments: vi.fn(),
  listSkillsFiltered: vi.fn(),
  listProductionPacksForScene: vi.fn(),
}));

vi.mock("@/lib/agent/skills/registry", () => ({
  getSkill: mocks.getSkill,
  listDepartments: mocks.listDepartments,
  listSkillsFiltered: mocks.listSkillsFiltered,
}));

vi.mock("@/lib/agent/production-packs/registry", () => ({
  listProductionPacksForScene: mocks.listProductionPacksForScene,
  toProductionPackMeta: (pack: {
    id: string;
    version: string;
    sceneIds: string[];
    title: string;
    summary: string;
    requiredCapabilities: string[];
  }) => ({ ...pack, stages: [] }),
}));

import { GET } from "./route";

const contentDraft = {
  id: "production-content-draft",
  name: "内容成稿",
  description: "面向目标读者的可编辑内容初稿。",
  category: "marketing",
  source: "bundled" as const,
  enabled: true,
};

const contentOfficePack = {
  id: "content-office",
  version: "1.0.0",
  sceneIds: ["content-office"],
  title: "内容与办公工作流",
  summary: "从需求澄清到经过审阅的工作文档。",
  requiredCapabilities: ["chat"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSkill.mockResolvedValue(null);
  mocks.listDepartments.mockResolvedValue([]);
  mocks.listSkillsFiltered.mockResolvedValue([]);
  mocks.listProductionPacksForScene.mockResolvedValue([]);
});

describe("GET /api/skills", () => {
  it("publishes the active scene and its available Pack metadata", async () => {
    mocks.listSkillsFiltered
      .mockResolvedValueOnce([contentDraft])
      .mockResolvedValueOnce([contentDraft]);
    mocks.listProductionPacksForScene.mockResolvedValue([contentOfficePack]);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/skills?scene=content-office&category=marketing&q=%E5%86%85%E5%AE%B9",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      skills: [expect.objectContaining({ id: "production-content-draft" })],
      activeScene: { id: "content-office" },
      packs: [expect.objectContaining({ id: "content-office" })],
      total: 1,
    });
    expect(payload.scenes).toContainEqual(
      expect.objectContaining({ id: "content-office" }),
    );
    expect(mocks.listSkillsFiltered).toHaveBeenNthCalledWith(1, {
      q: "内容",
      category: "marketing",
      catalog: undefined,
      featured: undefined,
      scene: "content-office",
    });
    expect(payload.catalogs).toEqual(expect.any(Array));
    expect(mocks.listProductionPacksForScene).toHaveBeenCalledWith(
      "content-office",
    );
  });

  it("keeps legacy filters when the scene id is unknown", async () => {
    mocks.listSkillsFiltered
      .mockResolvedValueOnce([contentDraft])
      .mockResolvedValueOnce([contentDraft]);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/skills?scene=does-not-exist&category=marketing&q=%E5%86%85%E5%AE%B9",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      skills: [expect.objectContaining({ id: "production-content-draft" })],
      activeScene: null,
      packs: [],
      total: 1,
    });
    expect(mocks.listSkillsFiltered).toHaveBeenNthCalledWith(1, {
      q: "内容",
      category: "marketing",
      catalog: undefined,
      featured: undefined,
      scene: "does-not-exist",
    });
    expect(mocks.listProductionPacksForScene).not.toHaveBeenCalled();
  });
});
