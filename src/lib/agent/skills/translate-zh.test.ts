import { describe, expect, it } from "vitest";
import { looksEnglishHeavy } from "./translate-zh";

describe("looksEnglishHeavy", () => {
  it("detects English catalog copy", () => {
    expect(looksEnglishHeavy("Cloud architect for AWS and Terraform")).toBe(true);
    expect(looksEnglishHeavy("SEO 专家：搜索引擎优化与内容策略")).toBe(false);
  });
});
