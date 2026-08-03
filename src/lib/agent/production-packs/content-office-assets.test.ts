import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSkillMarkdown } from "@/lib/agent/skills/parse";
import { parseSkillContract } from "@/lib/agent/skills/contracts";
import { parseProductionPack } from "./contracts";

const skillRoot = join(process.cwd(), "content", "skills");
const packPath = join(
  process.cwd(),
  "content",
  "production-packs",
  "content-office",
  "pack.json",
);

const stages = [
  { id: "production-content-intake", output: "brief" },
  { id: "production-content-research", output: "research-notes" },
  { id: "production-content-draft", output: "draft" },
  { id: "production-content-review", output: "review-record" },
] as const;

describe("content-office first-party assets", () => {
  it("keeps each stage instruction focused, inspectable, and capability-honest", async () => {
    for (const stage of stages) {
      const dir = join(skillRoot, stage.id);
      const [markdown, rawContract] = await Promise.all([
        readFile(join(dir, "SKILL.md"), "utf8"),
        readFile(join(dir, "skill.json"), "utf8"),
      ]);
      const skill = parseSkillMarkdown(markdown, { fallbackId: stage.id });
      const contract = parseSkillContract(rawContract, stage.id);

      expect(markdown.trim().length).toBeGreaterThan(0);
      expect(markdown.split(/\r?\n/).length).toBeLessThan(250);
      expect(skill.systemPrompt).toContain("## 阶段目标");
      expect(skill.systemPrompt).toContain("## 开始前");
      expect(skill.systemPrompt).toContain("## 交付");
      expect(skill.systemPrompt).toContain("## 自检");
      expect(skill.systemPrompt).toContain("## 能力边界");
      expect(skill.systemPrompt).toMatch(/不得声称已生成图像或视频/);
      expect(contract.outputs).toContainEqual(
        expect.objectContaining({ id: stage.output, kinds: ["markdown"] }),
      );
    }
  });

  it("declares the canonical content-office stages in order", async () => {
    const pack = parseProductionPack(await readFile(packPath, "utf8"));

    expect(pack.id).toBe("content-office");
    expect(pack.stages.map((stage) => stage.id)).toEqual([
      "intake",
      "research",
      "draft",
      "review",
    ]);
  });
});
