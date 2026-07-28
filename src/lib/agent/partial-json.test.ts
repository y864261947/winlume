import { describe, expect, it } from "vitest";
import { extractPartialJsonStringField } from "./partial-json";

describe("extractPartialJsonStringField", () => {
  it("reads a complete content field", () => {
    const raw = JSON.stringify({
      name: "笔记",
      kind: "markdown",
      content: "# Hello\n\nWorld",
    });
    expect(extractPartialJsonStringField(raw, "content")).toBe(
      "# Hello\n\nWorld",
    );
    expect(extractPartialJsonStringField(raw, "name")).toBe("笔记");
  });

  it("reads partial content mid-stream", () => {
    const partial =
      '{"name":"种草","kind":"markdown","content":"# 标题\\n\\n第一段';
    expect(extractPartialJsonStringField(partial, "content")).toBe(
      "# 标题\n\n第一段",
    );
  });

  it("returns null before content starts", () => {
    expect(
      extractPartialJsonStringField('{"name":"x","kind":"markdown"', "content"),
    ).toBeNull();
  });
});
