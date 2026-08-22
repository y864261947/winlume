import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSkill: vi.fn(),
  listDepartments: vi.fn(),
  listSkillsFiltered: vi.fn(),
}));

vi.mock("@/lib/agent/skills/registry", () => ({
  getSkill: mocks.getSkill,
  listDepartments: mocks.listDepartments,
  listSkillsFiltered: mocks.listSkillsFiltered,
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSkill.mockResolvedValue(null);
  mocks.listDepartments.mockResolvedValue([]);
  mocks.listSkillsFiltered.mockResolvedValue([]);
});

describe("GET /api/skills", () => {
  it("publishes the active scene and matching Skills", async () => {
    mocks.listSkillsFiltered
      .mockResolvedValueOnce([contentDraft])
      .mockResolvedValueOnce([contentDraft]);

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
      total: 1,
    });
    expect(mocks.listSkillsFiltered).toHaveBeenNthCalledWith(1, {
      q: "内容",
      category: "marketing",
      catalog: undefined,
      featured: undefined,
      scene: "does-not-exist",
    });
  });
});
