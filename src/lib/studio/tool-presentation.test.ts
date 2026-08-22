import { describe, expect, it } from "vitest";
import { getToolPresentation, isResultTool } from "./tool-presentation";

describe("tool presentation", () => {
  it("uses concise user-facing copy for artifact tools", () => {
    expect(getToolPresentation("write_artifact")).toMatchObject({
      label: "保存作品",
      running: "正在保存作品",
      completed: "已保存作品",
      result: true,
    });
  });

  it("keeps read tools in the detailed tool presentation", () => {
    expect(isResultTool("read_artifact")).toBe(false);
    expect(getToolPresentation("unknown_tool").label).toBe("执行操作");
  });
});
