import { describe, expect, it } from "vitest";
import { parseProductionPack } from "./contracts";
import {
  createWorkflowSessionBinding,
  parseWorkflowSessionBinding,
} from "./session-binding";

const packFixture = {
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
    {
      id: "source-artifact",
      label: "参考材料",
      type: "artifact",
      required: false,
      description: "已有的参考材料。",
      kinds: ["markdown"],
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

describe("Workflow Session binding", () => {
  it("normalizes validated intake and extracts canonical input Artifact ids", () => {
    const pack = parseProductionPack(JSON.stringify(packFixture));

    const binding = createWorkflowSessionBinding(
      pack,
      {
        topic: "  夏季新品  ",
        channel: "wechat",
        "source-artifact": " artifact-1 ",
      },
      {
        workflowId: "workflow-1",
        now: new Date("2026-08-04T06:00:00.000Z"),
      },
    );

    expect(binding).toEqual({
      schemaVersion: 1,
      workflowId: "workflow-1",
      packId: "content-office",
      packVersion: "1.0.0",
      packSnapshot: pack,
      intakeValues: {
        topic: "夏季新品",
        channel: "wechat",
        "source-artifact": "artifact-1",
      },
      inputArtifactIds: ["artifact-1"],
      boundAt: "2026-08-04T06:00:00.000Z",
    });
  });

  it("rejects missing, undeclared, and display-label intake values", () => {
    const pack = parseProductionPack(JSON.stringify(packFixture));

    expect(() =>
      createWorkflowSessionBinding(pack, { channel: "wechat" }, {
        workflowId: "workflow-1",
      }),
    ).toThrow("topic");
    expect(() =>
      createWorkflowSessionBinding(
        pack,
        { topic: "夏季新品", channel: "公众号" },
        { workflowId: "workflow-1" },
      ),
    ).toThrow("declared options");
    expect(() =>
      createWorkflowSessionBinding(
        pack,
        {
          topic: "夏季新品",
          channel: "wechat",
          skillIds: ["caller-controlled"],
        },
        { workflowId: "workflow-1" },
      ),
    ).toThrow("Unknown intake field");
  });

  it("strictly validates workflow bindings loaded from Session storage", () => {
    const pack = parseProductionPack(JSON.stringify(packFixture));
    const binding = createWorkflowSessionBinding(
      pack,
      {
        topic: "夏季新品",
        channel: "wechat",
        "source-artifact": "artifact-1",
      },
      { workflowId: "workflow-1" },
    );

    expect(parseWorkflowSessionBinding(binding)).toEqual(binding);
    expect(() =>
      parseWorkflowSessionBinding({ ...binding, callerControlled: true }),
    ).toThrow("stored workflow binding");
    expect(() =>
      parseWorkflowSessionBinding({
        ...binding,
        inputArtifactIds: ["artifact-1", "artifact-1"],
      }),
    ).toThrow("stored workflow binding");
  });
});
