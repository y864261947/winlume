import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const navSource = readFileSync(join(__dirname, "PortalNav.tsx"), "utf8");

const SHELLS = [
  "ModelMarket.tsx",
  "ProductsExplorer.tsx",
  "docs/DocsShell.tsx",
  "account/AccountShell.tsx",
  "PortalPricingShell.tsx",
] as const;

describe("portal top navigation", () => {
  it("keeps the same five destinations and right-side slots", () => {
    for (const label of ["首页", "应用工具", "API模型", "文档", "计费标准"]) {
      expect(navSource).toContain(`label: "${label}"`);
    }
    expect(navSource).toContain("升级会员");
    expect(navSource).toContain("Agent");
    expect(navSource).toContain("通知");
    expect(navSource).toContain('href="/studio"');
    expect(navSource).toContain("portal-membership-entry");
    expect(navSource).toContain("portal-user-links");
  });

  it("is the only portal chrome used by marketing shells", () => {
    for (const file of SHELLS) {
      const source = readFileSync(join(__dirname, file), "utf8");
      expect(source).toContain("<PortalNav");
      expect(source).not.toContain('className="portal-nav"');
      expect(source).not.toContain("portal-main-links");
    }
  });
});
