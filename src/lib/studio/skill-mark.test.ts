import { describe, expect, it } from "vitest";
import { catalogAccentStyle, skillMonogram } from "./skill-mark";

describe("skillMonogram", () => {
  it("prefers the first Han character even when a Latin prefix is present", () => {
    expect(skillMonogram("equaldata: A股股票金融数据服务")).toBe("股");
    expect(skillMonogram("专利初稿助手")).toBe("专");
  });

  it("skips leading Han numerals so the mark is not a dash-like 一", () => {
    expect(skillMonogram("一键去AI味工具")).toBe("键");
    expect(skillMonogram("一人公司全能运营助手 (OPC)")).toBe("人");
  });

  it("falls back to a Latin initial", () => {
    expect(skillMonogram("SEO Brief")).toBe("S");
    expect(skillMonogram("  12-week plan")).toBe("1");
  });

  it("uses a stable placeholder for empty names", () => {
    expect(skillMonogram("")).toBe("技");
    expect(skillMonogram("   ")).toBe("技");
  });
});

describe("catalogAccentStyle", () => {
  it("exposes the accent as a CSS custom property", () => {
    expect(catalogAccentStyle("#e11d48")).toMatchObject({
      "--studio-cat-accent": "#e11d48",
    });
  });
});
