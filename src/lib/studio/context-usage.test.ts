import { describe, expect, it } from "vitest";
import { estimateConversationTextTokens, formatEstimatedTextTokens } from "./context-usage";
import type { StudioUIMessage } from "./ui-message-adapter";

function message(
  role: StudioUIMessage["role"],
  parts: StudioUIMessage["parts"],
): StudioUIMessage {
  return { id: "message", role, parts };
}

const text = (value: string) => ({ type: "text" as const, text: value });

describe("conversation text context estimate", () => {
  it("hides until the first user message, including system or welcome-only history", () => {
    expect(estimateConversationTextTokens([])).toBeNull();
    expect(estimateConversationTextTokens([message("system", [text("hidden")])])).toBeNull();
    expect(estimateConversationTextTokens([message("assistant", [text("Welcome!")])])).toBeNull();
  });

  it("estimates ASCII, CJK, mixed text and Unicode code points", () => {
    expect(estimateConversationTextTokens([message("user", [text("hello")])])).toBe(2);
    expect(estimateConversationTextTokens([message("user", [text("你好世界")])])).toBe(4);
    expect(estimateConversationTextTokens([message("user", [text("test你好😀")])])).toBe(4);
  });

  it("counts all user and assistant text without rounding each stream part", () => {
    expect(estimateConversationTextTokens([
      message("user", [text("a"), text("b")]),
      message("assistant", [text("c"), text("d")]),
    ])).toBe(1);
  });

  it("excludes system, reasoning, tool, file and data parts", () => {
    expect(estimateConversationTextTokens([
      message("system", [text("hidden system text")]),
      message("user", [text("test"), { type: "file", mediaType: "image/png", url: "data:image/png;base64,AAAA" }]),
      message("assistant", [
        { type: "reasoning", text: "private reasoning" },
        { type: "dynamic-tool", toolName: "read", toolCallId: "tool", state: "output-available", input: { text: "input" }, output: "long tool output" },
        { type: "data-draft", data: { text: "draft data" } },
      ]),
    ])).toBe(1);
  });

  it("shows zero text tokens for a started image-only conversation", () => {
    expect(estimateConversationTextTokens([
      message("user", [{ type: "file", mediaType: "image/png", url: "https://example.com/image.png" }]),
    ])).toBe(0);
  });

  it("recomputes from streaming, completed, and cleared message snapshots", () => {
    const user = message("user", [text("test")]);
    expect(estimateConversationTextTokens([user, message("assistant", [])])).toBe(1);
    expect(estimateConversationTextTokens([user, message("assistant", [text("response")])])).toBe(3);
    expect(estimateConversationTextTokens([user, message("assistant", [text("response done")])])).toBe(5);
    expect(estimateConversationTextTokens([])).toBeNull();
  });

  it("does not pretend different model metadata provides actual token usage", () => {
    const original = message("assistant", [text("hello world")]);
    const user = message("user", [text("test")]);
    const estimateA = estimateConversationTextTokens([user, { ...original, metadata: { model: "model-a" } }]);
    const estimateB = estimateConversationTextTokens([user, { ...original, metadata: { model: "model-b" } }]);
    expect(estimateA).toBe(4);
    expect(estimateB).toBe(estimateA);
  });

  it("keeps counts compact without inventing a context limit", () => {
    expect(formatEstimatedTextTokens(0)).toBe("0");
    expect(formatEstimatedTextTokens(1250)).toBe("1.3K");
    expect(formatEstimatedTextTokens(1500000)).toBe("1.5M");
  });
});
