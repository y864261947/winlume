import { describe, expect, it } from "vitest";
import type { IntakeField } from "@/lib/agent/production-packs/contracts";
import {
  initialWorkflowIntake,
  reconcileWorkflowIntake,
  validateWorkflowIntake,
  workflowDraftKey,
} from "./workflow-intake";

const fields = [
  {
    id: "brief",
    type: "text",
    label: "项目简介",
    description: "说明要完成的工作。",
    required: true,
  },
  {
    id: "sourceUrl",
    type: "url",
    label: "参考链接",
    description: "可选的参考网页。",
    required: false,
  },
  {
    id: "budget",
    type: "number",
    label: "预算",
    description: "可选预算。",
    required: false,
  },
  {
    id: "market",
    type: "select",
    label: "目标市场",
    description: "选择一个目标市场。",
    required: false,
    options: [
      { value: "jp", label: "日本" },
      { value: "us", label: "美国" },
    ],
  },
  {
    id: "channels",
    type: "multi_select",
    label: "投放渠道",
    description: "选择一个或多个渠道。",
    required: false,
    options: [
      { value: "web", label: "网页" },
      { value: "retail", label: "零售" },
    ],
  },
  {
    id: "referenceArtifact",
    type: "artifact",
    label: "参考素材",
    description: "可选的参考作品。",
    required: false,
    kinds: ["markdown"],
  },
] satisfies IntakeField[];

describe("workflow intake", () => {
  it("normalizes supplied fields, removes unknown values, and reports an invalid URL", () => {
    expect(
      validateWorkflowIntake(fields, {
        brief: "  Launch in Japan  ",
        sourceUrl: "ftp://example.com",
        channels: ["web", "web", "retail"],
        ignored: "must not be submitted",
      }),
    ).toEqual({
      ok: false,
      values: { brief: "Launch in Japan", channels: ["web", "retail"] },
      errors: { sourceUrl: "请输入 http 或 https 地址" },
    });
  });

  it("normalizes finite numbers, declared options, and Artifact ids", () => {
    expect(
      validateWorkflowIntake(fields, {
        brief: "新品上市",
        sourceUrl: "https://example.com/reference",
        budget: " 2500.5 ",
        market: " jp ",
        channels: ["retail", "web"],
        referenceArtifact: " artifact-1 ",
      }),
    ).toEqual({
      ok: true,
      values: {
        brief: "新品上市",
        sourceUrl: "https://example.com/reference",
        budget: 2500.5,
        market: "jp",
        channels: ["retail", "web"],
        referenceArtifact: "artifact-1",
      },
      errors: {},
    });
  });

  it("rejects invalid values instead of silently submitting a partial selection", () => {
    expect(
      validateWorkflowIntake(
        fields.map((field) => ({ ...field, required: true })),
        {
          brief: "   ",
          sourceUrl: "mailto:team@example.com",
          budget: Infinity,
          market: "kr",
          channels: ["web", "unknown-channel"],
          referenceArtifact: " ",
        },
      ),
    ).toEqual({
      ok: false,
      values: {},
      errors: {
        brief: "请输入内容",
        sourceUrl: "请输入 http 或 https 地址",
        budget: "请输入有限数字",
        market: "请选择提供的选项",
        channels: "请选择提供的选项",
        referenceArtifact: "请选择作品",
      },
    });
  });

  it("creates a versioned draft key and control-compatible initial values", () => {
    expect(workflowDraftKey("content-office", "1.2.3")).toBe(
      "winlume:workflow-intake:content-office:1.2.3",
    );
    expect(initialWorkflowIntake(fields)).toEqual({
      brief: "",
      sourceUrl: "",
      budget: "",
      market: "",
      channels: [],
      referenceArtifact: "",
    });
  });

  it("reconciles only compatible draft values after a Pack version changes", () => {
    const nextFields = [
      { ...fields[0], description: "更新后的项目简介。" },
      {
        id: "sourceUrl",
        type: "text" as const,
        label: "参考说明",
        description: "该字段不再接受链接。",
        required: false,
      },
      { ...fields[2] },
      {
        id: "market",
        type: "select" as const,
        label: "目标市场",
        description: "选择一个目标市场。",
        required: false,
        options: [
          { value: "jp", label: "日本" },
          { value: "de", label: "德国" },
        ],
      },
      {
        id: "channels",
        type: "multi_select" as const,
        label: "投放渠道",
        description: "选择一个或多个渠道。",
        required: false,
        options: [
          { value: "web", label: "网页" },
          { value: "social", label: "社交媒体" },
        ],
      },
      { ...fields[5] },
      {
        id: "owner",
        type: "text" as const,
        label: "负责人",
        description: "可选的负责人。",
        required: false,
      },
    ] satisfies IntakeField[];

    expect(
      reconcileWorkflowIntake(fields, nextFields, {
        brief: "已保存的项目简介",
        sourceUrl: "https://example.com/reference",
        budget: "1500",
        market: "us",
        channels: ["retail", "web", "web"],
        referenceArtifact: "artifact-1",
        removedField: "ignored",
      }),
    ).toEqual({
      brief: "已保存的项目简介",
      sourceUrl: "",
      budget: "1500",
      market: "",
      channels: ["web"],
      referenceArtifact: "artifact-1",
      owner: "",
    });
  });
});
