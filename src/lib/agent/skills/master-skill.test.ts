import { describe, expect, it } from "vitest";
import { categoryForMasterSlug, skillFromMasterPackage } from "./master-skill";

describe("master-skill import mapping", () => {
  it("maps industry slugs onto existing departments", () => {
    expect(categoryForMasterSlug("seo-master")).toBe("marketing");
    expect(categoryForMasterSlug("china-law-master")).toBe("legal");
    expect(categoryForMasterSlug("devops-sre-master")).toBe("engineering");
    expect(categoryForMasterSlug("personal-investing-master")).toBe("finance");
    expect(categoryForMasterSlug("clinical-diagnostic-reasoning-master")).toBe("specialized");
  });

  it("builds an imported Skill from SKILL.md plus meta.json", () => {
    const skill = skillFromMasterPackage({
      slug: "seo-master",
      originPath: "prototypes/seo-master/output/SKILL.md",
      meta: {
        industry_cn: "SEO 专家",
        industry: "SEO",
        triggers: ["SEO", "搜索引擎优化"],
      },
      markdown: `---
name: seo-master
description: SEO 行业操作系统
triggers:
  - SEO
---

# body
`,
    });
    expect(skill).toMatchObject({
      id: "seo-master",
      name: "SEO 专家",
      source: "imported",
      category: "marketing",
      enabled: true,
    });
    expect(skill.triggers).toContain("SEO");
    expect(skill.systemPrompt).toContain("body");
    expect(skill.examplePrompt).toBeUndefined();
  });
});
