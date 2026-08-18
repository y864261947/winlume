import { describe, expect, it } from "vitest";
import { listStudioTools } from "./tool-catalog";
import {
  catalogsFromDepartmentCounts,
  getStudioToolCategory,
  isStudioToolCategoryId,
  listStudioToolCategories,
  skillDepartmentToToolCategory,
  studioSkillsHref,
  studioToolCategoryHref,
} from "./tool-categories";

describe("Studio tool categories", () => {
  it("exposes the eight first-level categories in grid order", () => {
    expect(listStudioToolCategories().map((category) => category.name)).toEqual([
      "内容与营销",
      "视觉与媒体",
      "电商与销售",
      "法务与财务",
      "产品与研发",
      "办公与管理",
      "数据与科研",
      "开发与代码",
    ]);
  });

  it("resolves known ids and rejects unknown slugs", () => {
    expect(isStudioToolCategoryId("visual-media")).toBe(true);
    expect(isStudioToolCategoryId("图片处理")).toBe(false);
    expect(getStudioToolCategory("ecommerce-sales")?.name).toBe("电商与销售");
    expect(getStudioToolCategory("not-a-category")).toBeNull();
    expect(studioToolCategoryHref("legal-finance")).toBe("/studio/tools/c/legal-finance");
    expect(studioSkillsHref()).toBe("/studio/skills");
    expect(studioSkillsHref("content-marketing")).toBe(
      "/studio/skills?catalog=content-marketing",
    );
  });

  it("rolls department counts into the eight workbench catalogs", () => {
    const catalogs = catalogsFromDepartmentCounts([
      { id: "marketing", count: 10 },
      { id: "paid-media", count: 4 },
      { id: "design", count: 3 },
      { id: "unknown-dept", count: 2 },
    ]);
    expect(catalogs.find((item) => item.id === "content-marketing")?.count).toBe(14);
    expect(catalogs.find((item) => item.id === "visual-media")?.count).toBe(3);
    expect(catalogs.find((item) => item.id === "product-rd")?.count).toBe(2);
    expect(catalogs.find((item) => item.id === "development")?.count).toBe(0);
  });

  it("assigns every standalone tool to one of the eight categories", () => {
    const assigned = Object.fromEntries(
      listStudioTools().map((tool) => [tool.id, tool.category]),
    );
    expect(assigned).toEqual({
      "background-removal": "visual-media",
      "image-clarity": "visual-media",
      "watermark-subtitle-removal": "visual-media",
      "image-fusion": "visual-media",
      "ecommerce-image-set": "ecommerce-sales",
    });
  });

  it("maps Skill departments onto the same eight categories", () => {
    expect(skillDepartmentToToolCategory("marketing")).toBe("content-marketing");
    expect(skillDepartmentToToolCategory("paid-media")).toBe("content-marketing");
    expect(skillDepartmentToToolCategory("design")).toBe("visual-media");
    expect(skillDepartmentToToolCategory("sales")).toBe("ecommerce-sales");
    expect(skillDepartmentToToolCategory("legal")).toBe("legal-finance");
    expect(skillDepartmentToToolCategory("finance")).toBe("legal-finance");
    expect(skillDepartmentToToolCategory("product")).toBe("product-rd");
    expect(skillDepartmentToToolCategory("hr")).toBe("office-admin");
    expect(skillDepartmentToToolCategory("academic")).toBe("data-research");
    expect(skillDepartmentToToolCategory("engineering")).toBe("development");
    expect(skillDepartmentToToolCategory("unknown-dept")).toBe("product-rd");
  });
});
