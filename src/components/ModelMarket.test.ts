import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Homepage API categories are static brand rows (302-style).
 * We assert the source defines the expected category labels without exporting internals.
 */
describe("homepage API categories", () => {
  const source = readFileSync(join(__dirname, "ModelMarket.tsx"), "utf8");

  it("lists marketplace-style categories and no popular-models block", () => {
    for (const label of [
      "语言推理",
      "图像处理",
      "音频处理",
      "视频处理",
      "RAG知识库",
      "信息检索",
    ]) {
      expect(source).toContain(`label: "${label}"`);
    }
    expect(source).not.toContain("常用模型");
    expect(source).not.toContain("popularModels");
  });

  it("renders brand chips without 通用接口 and caps at 5", () => {
    expect(source).toContain("portal-api-brands");
    expect(source).toContain("portal-api-brand");
    expect(source).toContain('label: "OpenAI"');
    expect(source).toContain('label: "Anthropic"');
    expect(source).toContain('label: "Recraft"');
    expect(source).not.toMatch(/label:\s*"通用接口"/);
    expect(source).toContain("API_BRAND_LIMIT = 5");
  });

  it("opens content destinations in a new tab while keeping primary navigation in place", () => {
    expect(source).toContain('target = "_blank"');
    expect(source).toContain('rel={target === "_blank" ? "noopener noreferrer" : undefined}');
    expect(source).toContain('<PortalNav current="home"');
    expect(source).not.toContain('className="portal-nav"');
  });

  it("includes the first-visit three-step product guide", () => {
    expect(source).toContain("PORTAL_ONBOARDING_STORAGE_KEY");
    expect(source).toContain("Agent 智能工作台");
    expect(source).toContain("API 模型中心");
    expect(source).toContain("AI应用工具与Skills技能");
    expect(source).toContain("portal-onboarding-card");
    expect(source).toContain("data-onboarding-target=\"agent\"");
    expect(source).toContain("data-onboarding-target=\"api\"");
    expect(source).toContain("data-onboarding-target=\"tools\"");
  });
});

