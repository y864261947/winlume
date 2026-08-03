import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSkillsCache, listSkills } from "./registry";

const originalSkillsDir = process.env.WINLUME_SKILLS_DIR;
let fixtureRoot = "";

const LEGACY_SKILL = `---
name: legacy-skill
title: Legacy Skill
description: Existing v1 prompt-only skill
category: general
---

Keep the existing v1 behavior.`;

const VALID_V2_CONTRACT = {
  schemaVersion: 2,
  id: "v2-skill",
  version: "1.0.0",
  stability: "stable",
  provenance: { owner: "winlume", source: "first-party" },
  requiredCapabilities: ["chat"],
  allowedTools: ["write_artifact"],
  inputs: [],
  outputs: [{ id: "brief", kinds: ["markdown"], required: true }],
  qualityChecks: ["contains an outcome"],
  approvalPolicy: "none",
};

afterEach(async () => {
  clearSkillsCache();
  if (originalSkillsDir === undefined) {
    delete process.env.WINLUME_SKILLS_DIR;
  } else {
    process.env.WINLUME_SKILLS_DIR = originalSkillsDir;
  }
  if (fixtureRoot) {
    await rm(fixtureRoot, { recursive: true, force: true });
    fixtureRoot = "";
  }
  vi.restoreAllMocks();
});

describe("Skill registry v2 compatibility", () => {
  it("loads a valid v2 contract without changing its prompt body", async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), "winlume-skills-"));
    const skillDir = join(fixtureRoot, "v2-skill");
    await mkdir(skillDir);
    await Promise.all([
      writeFile(join(skillDir, "SKILL.md"), LEGACY_SKILL, "utf8"),
      writeFile(join(skillDir, "skill.json"), JSON.stringify(VALID_V2_CONTRACT), "utf8"),
    ]);
    process.env.WINLUME_SKILLS_DIR = fixtureRoot;

    const [skill] = await listSkills();

    expect(skill?.id).toBe("v2-skill");
    expect(skill?.systemPrompt).toBe("Keep the existing v1 behavior.");
    expect(skill?.contract).toMatchObject({
      schemaVersion: 2,
      allowedTools: ["write_artifact"],
    });
  });

  it("keeps v1 Skills and excludes a package with malformed skill.json", async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), "winlume-skills-"));
    const legacyDir = join(fixtureRoot, "legacy-skill");
    const invalidDir = join(fixtureRoot, "invalid-v2-skill");
    await Promise.all([mkdir(legacyDir), mkdir(invalidDir)]);
    await Promise.all([
      writeFile(join(legacyDir, "SKILL.md"), LEGACY_SKILL, "utf8"),
      writeFile(join(invalidDir, "SKILL.md"), LEGACY_SKILL, "utf8"),
      writeFile(
        join(invalidDir, "skill.json"),
        JSON.stringify({ schemaVersion: 2, id: "different-id" }),
        "utf8",
      ),
    ]);
    process.env.WINLUME_SKILLS_DIR = fixtureRoot;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const skills = await listSkills();

    expect(skills.map((skill) => skill.id)).toEqual(["legacy-skill"]);
    expect(skills[0]?.systemPrompt).toBe("Keep the existing v1 behavior.");
    expect(warn).toHaveBeenCalledWith(
      "[skills] invalid v2 Skill package skipped:",
      invalidDir,
    );
  });
});
