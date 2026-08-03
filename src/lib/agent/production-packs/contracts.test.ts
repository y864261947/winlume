import { describe, expect, it } from "vitest";
import {
  parseProductionPack,
  validatePackSkills,
} from "./contracts";

const validStage = {
  id: "intake",
  title: "需求澄清",
  objective: "将任务转成可执行 brief。",
  skillIds: ["production-content-intake"],
  requiredInputs: [],
  outputs: [{ id: "brief", kinds: ["markdown"], required: true }],
  allowedTools: ["write_artifact"],
  qualityChecks: ["brief includes audience and outcome"],
  approvalPolicy: "none",
  maxAutomaticRevisions: 0,
};

const validContentOfficePack = {
  schemaVersion: 1,
  id: "content-office",
  version: "1.0.0",
  sceneIds: ["content-office"],
  title: "内容与办公工作流",
  summary: "从需求澄清到经过审阅的工作文档。",
  requiredCapabilities: ["chat"],
  stages: [
    validStage,
    {
      ...validStage,
      id: "research",
      title: "材料核验",
      skillIds: ["production-content-research"],
      requiredInputs: [{ id: "brief", kinds: ["markdown"], required: true }],
      outputs: [{ id: "research-notes", kinds: ["markdown"], required: true }],
      allowedTools: ["read_artifact", "write_artifact"],
      maxAutomaticRevisions: 1,
    },
    {
      ...validStage,
      id: "draft",
      title: "内容成稿",
      skillIds: ["production-content-draft"],
      requiredInputs: [{ id: "research-notes", kinds: ["markdown"], required: true }],
      outputs: [{ id: "draft", kinds: ["markdown"], required: true }],
      allowedTools: ["read_artifact", "write_artifact"],
      approvalPolicy: "required",
      maxAutomaticRevisions: 2,
    },
    {
      ...validStage,
      id: "review",
      title: "编辑审查",
      skillIds: ["production-content-review"],
      requiredInputs: [{ id: "draft", kinds: ["markdown"], required: true }],
      outputs: [{ id: "review-record", kinds: ["markdown"], required: true }],
      allowedTools: ["read_artifact", "write_artifact"],
      approvalPolicy: "on-blocking-review",
    },
  ],
};

describe("production Pack contracts", () => {
  it("requires ordered unique stages and declared Skill outputs", () => {
    const pack = parseProductionPack(JSON.stringify(validContentOfficePack));

    expect(pack.stages.map((stage) => stage.id)).toEqual([
      "intake",
      "research",
      "draft",
      "review",
    ]);
    expect(pack.stages.every((stage) => stage.outputs.length > 0)).toBe(true);
  });

  it("rejects a Pack with duplicate stages, unsafe scenes, or an unknown referenced Skill", () => {
    expect(() =>
      parseProductionPack(
        JSON.stringify({
          ...validContentOfficePack,
          stages: [validStage, validStage],
        }),
      ),
    ).toThrow();
    expect(() =>
      parseProductionPack(
        JSON.stringify({ ...validContentOfficePack, sceneIds: ["../content-office"] }),
      ),
    ).toThrow();
    expect(() =>
      validatePackSkills(
        parseProductionPack(JSON.stringify(validContentOfficePack)),
        new Set(["production-content-intake"]),
      ),
    ).toThrow();
  });
});

export { validContentOfficePack };
