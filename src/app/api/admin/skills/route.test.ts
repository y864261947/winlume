import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  getPlatformRepositories: vi.fn(),
}));

vi.mock("@/lib/platform/admin", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
  PlatformAdminError: class PlatformAdminError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
}));

vi.mock("@/lib/platform/repositories", () => ({
  getPlatformRepositories: mocks.getPlatformRepositories,
}));

import { GET } from "./route";
import { PlatformAdminError } from "@/lib/platform/admin";

describe("GET /api/admin/skills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-admin callers", async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(new PlatformAdminError("仅平台管理员可以管理 Skill。", 403));
    const response = await GET(new Request("https://reizo.example/api/admin/skills") as never);
    expect(response.status).toBe(403);
  });

  it("returns catalog rows for an admin", async () => {
    mocks.requirePlatformAdmin.mockResolvedValue({ platformRole: "admin" });
    mocks.getPlatformRepositories.mockReturnValue({
      skills: {
        listPage: vi.fn(async () => ({
          total: 1,
          promptChars: [4],
          rows: [
            {
              id: "seo-master",
              name: "SEO 专家",
              description: "SEO",
              category: "marketing",
              triggers: ["SEO"],
              examplePrompt: null,
              preview: null,
              source: "imported",
              enabled: true,
              featured: false,
              defaultArtifact: null,
              systemPrompt: "",
              origin: "master-skill",
              originPath: "prototypes/seo-master/output/SKILL.md",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        })),
      },
    });
    const response = await GET(new Request("https://reizo.example/api/admin/skills") as never);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.hasMore).toBe(false);
    expect(body.skills[0]).toMatchObject({ id: "seo-master", source: "imported", promptChars: 4 });
    expect(body.skills[0].systemPrompt).toBeUndefined();
  });
});
