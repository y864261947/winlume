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
      "语言大模型",
      "图片生成",
      "图片处理",
      "视频生成",
      "音视频处理",
      "信息处理",
      "RAG相关",
      "工具API",
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
});

