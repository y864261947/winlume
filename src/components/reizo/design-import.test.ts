import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("REIZO design import", () => {
  const directory = join(__dirname, "generated");
  it("ships presentation code without the prototype authentication or payment state", () => {
    const files = readdirSync(directory).filter(name => /\.(js|json)$/.test(name));
    for (const name of files) {
      const content = readFileSync(join(directory, name), "utf8");
      expect(content, name).not.toMatch(/Reizo2026!|demo-session\.js|account-demo\.js|site-login\.js|localStorage\.setItem/);
      expect(content.replaceAll('/reizo/showcase/index.html', ''), name).not.toMatch(/(?:index|studio|account|api|pricing|business)\.html/);
      if (name.endsWith(".json")) {
        const markup = JSON.parse(content);
        expect(markup.html ?? markup.__html, name).not.toMatch(/<header class="site-header|id="site-login-dialog"/);
      }
    }
  });
  it("scopes styles without corrupting class names containing body", () => {
    const css = readFileSync(join(directory, "design.css"), "utf8");
    expect(css).toContain(".reizo-site .showcase-body");
    expect(css).not.toContain("showcase-.reizo-site");
    expect(css).toContain(".reizo-site.reizo-page-account");
    expect(css).toContain(".reizo-site.reizo-page-business.business-page");
    expect(css).not.toContain(".reizo-site.reizo-page-business .business-page");
    expect(css).toContain("/* business-colors.css */");
  });
});
