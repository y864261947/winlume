import { describe, expect, it } from "vitest";
import {
  parseProductionPack,
  validatePackSkills,
} from "./contracts";

const validStage = {
  id: "intake",
  title: "需求澄清",
  objective: "将任务转成可执行 brief。",
  handoffSummary: "提供后续阶段可直接使用的目标、约束和待确认事项。",
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
  intake: [
    {
      id: "topic",
      label: "主题",
      type: "text",
      required: true,
      description: "需要完成的内容主题。",
    },
    {
      id: "channel",
      label: "发布渠道",
      type: "select",
      required: true,
      description: "内容最终面向的渠道。",
      options: [
        { value: "wechat", label: "公众号" },
        { value: "rednote", label: "小红书" },
      ],
    },
  ],
  expectedArtifacts: [
    { id: "draft", kinds: ["markdown"], required: true },
    { id: "review-record", kinds: ["markdown"], required: true },
  ],
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
  it("keeps schema v1 Packs valid when optional workflow presentation fields are absent", () => {
    const legacyPack = structuredClone(validContentOfficePack);
    Reflect.deleteProperty(legacyPack, "intake");
    Reflect.deleteProperty(legacyPack, "expectedArtifacts");
    legacyPack.stages.forEach((stage) => {
      Reflect.deleteProperty(stage, "handoffSummary");
    });

    const pack = parseProductionPack(JSON.stringify(legacyPack));

    expect(pack.intake).toEqual([]);
    expect(pack.expectedArtifacts).toEqual([]);
    expect(pack.stages[0].handoffSummary).toBeUndefined();
  });

  it("parses Pack intake, expected Artifacts, and Stage handoff metadata", () => {
    const pack = parseProductionPack(JSON.stringify(validContentOfficePack));

    expect(pack.intake.map((field) => field.id)).toEqual(["topic", "channel"]);
    expect(pack.expectedArtifacts.map((artifact) => artifact.id)).toEqual([
      "draft",
      "review-record",
    ]);
    expect(pack.stages[0].handoffSummary).toContain("后续阶段");
  });

  it("accepts a Stage output id at the shared 96-character limit", () => {
    const outputId = "p".repeat(96);
    const pack = parseProductionPack(
      JSON.stringify({
        ...validContentOfficePack,
        expectedArtifacts: [{ id: outputId, kinds: ["markdown"], required: true }],
        stages: [
          {
            ...validStage,
            outputs: [{ id: outputId, kinds: ["markdown"], required: true }],
          },
        ],
      }),
    );

    expect(pack.stages[0].outputs[0]?.id).toBe(outputId);
  });

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

  it("rejects malformed intake fields and duplicate expected Artifacts", () => {
    expect(() =>
      parseProductionPack(
        JSON.stringify({
          ...validContentOfficePack,
          intake: [validContentOfficePack.intake[0], validContentOfficePack.intake[0]],
        }),
      ),
    ).toThrow();
    expect(() =>
      parseProductionPack(
        JSON.stringify({
          ...validContentOfficePack,
          intake: [
            {
              ...validContentOfficePack.intake[1],
              options: [
                { value: "wechat", label: "公众号" },
                { value: "wechat", label: "重复值" },
              ],
            },
          ],
        }),
      ),
    ).toThrow();
    expect(() =>
      parseProductionPack(
        JSON.stringify({
          ...validContentOfficePack,
          intake: [
            {
              ...validContentOfficePack.intake[0],
              type: "select",
            },
          ],
        }),
      ),
    ).toThrow();
    expect(() =>
      parseProductionPack(
        JSON.stringify({
          ...validContentOfficePack,
          intake: [
            {
              ...validContentOfficePack.intake[0],
              type: "unsupported",
            },
          ],
        }),
      ),
    ).toThrow();
    expect(() =>
      parseProductionPack(
        JSON.stringify({
          ...validContentOfficePack,
          expectedArtifacts: [
            validContentOfficePack.expectedArtifacts[0],
            validContentOfficePack.expectedArtifacts[0],
          ],
        }),
      ),
    ).toThrow();
  });

  it("rejects duplicate Stage outputs and inputs that do not come from earlier stages", () => {
    expect(() =>
      parseProductionPack(
        JSON.stringify({
          ...validContentOfficePack,
          stages: [
            validStage,
            {
              ...validStage,
              id: "duplicate-output",
            },
          ],
        }),
      ),
    ).toThrow();

    expect(() =>
      parseProductionPack(
        JSON.stringify({
          ...validContentOfficePack,
          stages: [
            {
              ...validStage,
              requiredInputs: [
                { id: "research-notes", kinds: ["markdown"], required: true },
              ],
            },
            validContentOfficePack.stages[1],
          ],
        }),
      ),
    ).toThrow();
  });

  it("accepts Artifact intake as a first-stage input source", () => {
    const sourceInput = {
      id: "source-artifact",
      label: "参考材料",
      type: "artifact" as const,
      required: false,
      description: "已有材料。",
      kinds: ["markdown"],
    };
    const requiredInput = {
      id: "source-artifact",
      kinds: ["markdown"],
      required: false,
    };
    const pack = {
      ...validContentOfficePack,
      intake: [...validContentOfficePack.intake, sourceInput],
      stages: [
        { ...validContentOfficePack.stages[0], requiredInputs: [requiredInput] },
        ...validContentOfficePack.stages.slice(1),
      ],
    };

    expect(parseProductionPack(JSON.stringify(pack)).stages[0].requiredInputs).toEqual(
      [requiredInput],
    );
  });

  it("requires every expected Artifact to be declared by a Stage output", () => {
    expect(() =>
      parseProductionPack(
        JSON.stringify({
          ...validContentOfficePack,
          expectedArtifacts: [
            ...validContentOfficePack.expectedArtifacts,
            { id: "undeclared", kinds: ["markdown"], required: true },
          ],
        }),
      ),
    ).toThrow();
  });

  it("requires Artifact kinds to be compatible across graph edges", () => {
    expect(() =>
      parseProductionPack(
        JSON.stringify({
          ...validContentOfficePack,
          stages: validContentOfficePack.stages.map((stage) =>
            stage.id === "research"
              ? {
                  ...stage,
                  requiredInputs: [
                    { id: "brief", kinds: ["image"], required: true },
                  ],
                }
              : stage,
          ),
        }),
      ),
    ).toThrow();

    expect(() =>
      parseProductionPack(
        JSON.stringify({
          ...validContentOfficePack,
          expectedArtifacts: validContentOfficePack.expectedArtifacts.map(
            (artifact) =>
              artifact.id === "draft"
                ? { ...artifact, kinds: ["image"] }
                : artifact,
          ),
        }),
      ),
    ).toThrow();
  });
});

export { validContentOfficePack };
