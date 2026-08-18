import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  categoryFromSlug,
  readAgencyAgentsZh,
  readAwesomeClaudeSkills,
} from "./open-catalogs";

describe("open catalog readers", () => {
  it("maps slugs onto departments", () => {
    expect(categoryFromSlug("lead-research-assistant")).toBe("sales");
    expect(categoryFromSlug("invoice-organizer")).toBe("finance");
    expect(categoryFromSlug("frontend-security-coder")).toBe("security");
    expect(categoryFromSlug("cloud-architect")).toBe("engineering");
  });

  it("reads agency department markdown and skips docs", async () => {
    const root = await mkdtemp(join(tmpdir(), "agency-zh-"));
    await mkdir(join(root, "marketing"));
    await writeFile(
      join(root, "marketing", "marketing-new-voice.md"),
      `---
name: 新声量专家
description: 测试导入
---

# body
`,
      "utf8",
    );
    await writeFile(join(root, "marketing", "README.md"), "# skip", "utf8");
    const skills = await readAgencyAgentsZh(root);
    expect(skills.map((item) => item.skill.id)).toEqual(["marketing-new-voice"]);
    expect(skills[0]?.skill.category).toBe("marketing");
    expect(skills[0]?.skill.source).toBe("imported");
  });

  it("reads first-party Claude skills and skips templates", async () => {
    const root = await mkdtemp(join(tmpdir(), "claude-skills-"));
    await mkdir(join(root, "invoice-organizer"));
    await mkdir(join(root, "template-skill"));
    await writeFile(
      join(root, "invoice-organizer", "SKILL.md"),
      `---
name: invoice-organizer
description: Organize invoices
---

# invoices
`,
      "utf8",
    );
    await writeFile(
      join(root, "template-skill", "SKILL.md"),
      `---
name: template-skill
description: skip me
---

# template
`,
      "utf8",
    );
    const skills = await readAwesomeClaudeSkills(root);
    expect(skills.map((item) => item.skill.id)).toEqual(["claude-invoice-organizer"]);
    expect(skills[0]?.skill.category).toBe("finance");
  });
});
