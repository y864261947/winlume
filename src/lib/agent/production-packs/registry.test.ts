import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProductionPackRegistry } from "./registry";

const validContentOfficePack = {
  schemaVersion: 1,
  id: "content-office",
  version: "1.0.0",
  sceneIds: ["content-office"],
  title: "内容与办公工作流",
  summary: "从需求澄清到经过审阅的工作文档。",
  requiredCapabilities: ["chat"],
  intake: [
    {
      id: "topic",
      label: "主题",
      type: "text",
      required: true,
      description: "需要完成的内容主题。",
    },
  ],
  expectedArtifacts: [{ id: "brief", kinds: ["markdown"], required: true }],
  stages: [
    {
      id: "intake",
      title: "需求澄清",
      objective: "将任务转成可执行 brief。",
      handoffSummary: "提供后续阶段可直接使用的工作简报。",
      skillIds: ["production-content-intake"],
      requiredInputs: [],
      outputs: [{ id: "brief", kinds: ["markdown"], required: true }],
      allowedTools: ["write_artifact"],
      qualityChecks: ["brief includes audience and outcome"],
      approvalPolicy: "none",
      maxAutomaticRevisions: 0,
    },
  ],
};

let fixtureRoot = "";

afterEach(async () => {
  if (fixtureRoot) {
    await rm(fixtureRoot, { recursive: true, force: true });
    fixtureRoot = "";
  }
  vi.restoreAllMocks();
});

describe("production Pack registry", () => {
  it("lists only valid Packs whose Skill ids are installed and filters them by scene", async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), "winlume-packs-"));
    const validDir = join(fixtureRoot, "content-office");
    const invalidDir = join(fixtureRoot, "unknown-skill-pack");
    await Promise.all([mkdir(validDir), mkdir(invalidDir)]);
    await Promise.all([
      writeFile(join(validDir, "pack.json"), JSON.stringify(validContentOfficePack), "utf8"),
      writeFile(
        join(invalidDir, "pack.json"),
        JSON.stringify({
          ...validContentOfficePack,
          id: "unknown-skill-pack",
          stages: [
            {
              ...validContentOfficePack.stages[0],
              skillIds: ["missing-skill"],
            },
          ],
        }),
        "utf8",
      ),
    ]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const registry = createProductionPackRegistry({
      rootDir: fixtureRoot,
      listSkillIds: async () =>
        new Set([
          "production-content-intake",
        ]),
    });

    const packs = await registry.list();

    expect(packs.map((pack) => pack.id)).toEqual(["content-office"]);
    expect((await registry.listForScene("content-office")).map((pack) => pack.id)).toEqual([
      "content-office",
    ]);
    expect(warn).toHaveBeenCalledWith(
      "[production-packs] invalid package skipped:",
      invalidDir,
    );
  });
});
