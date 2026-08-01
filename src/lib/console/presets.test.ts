import { describe, expect, it } from "vitest";
import { parsePresetCreateInput, parsePresetUpdateInput } from "./presets";

describe("console preset input", () => {
  it("accepts a personal personality preset and a workspace tool preset", () => {
    expect(parsePresetCreateInput({
      kind: "personality",
      scope: "personal",
      name: "研究助手",
      instructions: "先列出证据，再给结论。",
    })).toMatchObject({ kind: "personality", scope: "personal", isDefault: false });

    expect(parsePresetCreateInput({
      kind: "tool",
      scope: "organization",
      organizationId: "a1d2c3",
      name: "受限工具集",
      toolConfiguration: { enabledTools: ["search"] },
      isDefault: true,
    })).toMatchObject({ kind: "tool", scope: "organization", isDefault: true });
  });

  it("requires a matching scope and valid JSON object configuration", () => {
    expect(() => parsePresetCreateInput({
      kind: "personality",
      scope: "organization",
      name: "缺少工作区",
      instructions: "test",
    })).toThrow("需要指定工作区");
    expect(() => parsePresetCreateInput({
      kind: "tool",
      name: "错误配置",
      toolConfiguration: ["search"],
    })).toThrow("JSON 对象");
  });

  it("rejects a no-op preset update", () => {
    expect(() => parsePresetUpdateInput("personality", {})).toThrow("没有需要更新的内容");
  });
});
