import { describe, expect, it } from "vitest";
import type { SkillMeta } from "@/lib/agent/types";
import {
  applicationCatalogSkillHref,
  portalCategoryFromSkill,
  portalCategoryToCatalog,
  portalSkillCountsFromCatalogs,
  portalSkillsHref,
  skillsForPortalCategory,
} from "./application-directory-skills";

function skill(
  partial: Pick<SkillMeta, "id" | "name" | "category"> & Partial<SkillMeta>,
): SkillMeta {
  return {
    description: "",
    source: "imported",
    enabled: true,
    ...partial,
  };
}

const catalog = [
  skill({
    id: "skillhub-gzh-copywriter",
    name: "公众号文案创作",
    category: "marketing",
    iconUrl: "https://cdn.example/marketing.png",
    examplePrompt: "写一篇关于春季护肤的公众号文章",
  }),
  skill({
    id: "skillhub-wechat-cover",
    name: "公众号爆款封面工坊",
    category: "design",
    iconUrl: "https://cdn.example/design.png",
  }),
  skill({
    id: "skillhub-sales-script",
    name: "销售话术设计",
    category: "sales",
    iconUrl: "https://cdn.example/sales.png",
  }),
  skill({
    id: "skillhub-contract-review",
    name: "合同风险识别",
    category: "legal",
    iconUrl: "https://cdn.example/legal.png",
  }),
];

describe("application directory skills", () => {
  it("maps portal category labels onto the studio catalog", () => {
    expect(portalCategoryToCatalog("内容与营销")).toBe("content-marketing");
    expect(portalCategoryToCatalog("财务与法务")).toBe("legal-finance");
    expect(portalCategoryFromSkill({ category: "marketing" })).toBe("内容与营销");
  });

  it("lists real catalog skills for a portal category instead of placeholder names", () => {
    const skills = skillsForPortalCategory(catalog, "内容与营销");
    expect(skills.map((item) => item.name)).toEqual(["公众号文案创作"]);
    expect(skills[0]?.iconUrl).toMatch(/^https:\/\//);
    expect(skills.some((item) => item.name === "SEO 内容优化")).toBe(false);
  });

  it("links a skill into the workbench with its id so the composer can load the logo", () => {
    const href = applicationCatalogSkillHref(catalog[0]!);
    const url = new URL(href, "http://localhost:9633");
    expect(url.pathname).toBe("/studio");
    expect(url.searchParams.get("entry")).toBe("application-catalog");
    expect(url.searchParams.get("skill")).toBe("skillhub-gzh-copywriter");
    expect(url.searchParams.get("skillName")).toBe("公众号文案创作");
    expect(url.searchParams.get("prompt")).toBe("写一篇关于春季护肤的公众号文章");
  });

  it("spreads 全部应用 across catalogs and points 查看全部 at the matching studio list", () => {
    const mixed = skillsForPortalCategory(catalog, "全部应用");
    expect(mixed.map((item) => item.category)).toEqual([
      "marketing",
      "design",
      "sales",
      "legal",
    ]);
    expect(portalSkillsHref("内容与营销")).toBe("/studio/skills?catalog=content-marketing");
    expect(portalSkillsHref("全部应用")).toBe("/studio/skills");
  });

  it("rolls studio catalog counts onto portal category labels", () => {
    expect(
      portalSkillCountsFromCatalogs([
        { id: "content-marketing", count: 15 },
        { id: "legal-finance", count: 8 },
      ]),
    ).toMatchObject({
      "内容与营销": 15,
      "财务与法务": 8,
      "视觉与媒体": 0,
    });
  });
});
