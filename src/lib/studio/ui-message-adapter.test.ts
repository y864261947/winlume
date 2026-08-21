import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { uiMessageToChatMessage } from "./ui-message-adapter";

describe("uiMessageToChatMessage", () => {
  it("surfaces a prepare() placeholder's metadata.preparing as activityLabel/streamPhase", () => {
    const message = {
      id: "assistant-preparing-1",
      role: "assistant",
      parts: [],
      metadata: { preparing: { label: "正在上传图片引用…", startedAt: 1000 } },
    } as unknown as UIMessage;

    const result = uiMessageToChatMessage(message, { streaming: true });
    expect(result).toMatchObject({
      content: "",
      streaming: true,
      streamPhase: "preparing",
      streamStartedAt: 1000,
      activityLabel: "正在上传图片引用…",
    });
    expect(result.activityTone).toBeUndefined();
  });

  it("marks a failed prepare() placeholder with activityTone error and streaming false", () => {
    const message = {
      id: "assistant-preparing-1",
      role: "assistant",
      parts: [],
      metadata: { preparing: { label: "上传失败，请重试", startedAt: 1000, failed: true } },
    } as unknown as UIMessage;

    const result = uiMessageToChatMessage(message, { streaming: true });
    expect(result).toMatchObject({
      streaming: false,
      streamPhase: "preparing",
      activityLabel: "上传失败，请重试",
      activityTone: "error",
    });
  });

  it("concatenates text and reasoning parts separately", () => {
    const message = {
      id: "m1",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "分析中" },
        { type: "text", text: "答案" },
        { type: "text", text: "是42" },
      ],
    } as unknown as UIMessage;

    const result = uiMessageToChatMessage(message, { streaming: false });
    expect(result.content).toBe("答案是42");
    expect(result.thinking).toBe("分析中");
  });

  it("maps a completed tool-* part into a done UiToolCall", () => {
    const message = {
      id: "m1",
      role: "assistant",
      parts: [
        {
          type: "tool-read_artifact",
          toolCallId: "call-1",
          state: "output-available",
          input: { id: "a1" },
          output: { summary: "读取成功", ok: true },
        },
      ],
    } as unknown as UIMessage;

    const result = uiMessageToChatMessage(message, { streaming: false });
    expect(result.toolCalls).toEqual([
      {
        id: "call-1",
        name: "read_artifact",
        input: { id: "a1" },
        resultSummary: "读取成功",
        ok: true,
        status: "done",
      },
    ]);
  });

  it("maps a still-running tool-* part to status running with no result", () => {
    const message = {
      id: "m1",
      role: "assistant",
      parts: [
        {
          type: "tool-generate_image",
          toolCallId: "call-2",
          state: "input-available",
          input: { prompt: "猫" },
        },
      ],
    } as unknown as UIMessage;

    const result = uiMessageToChatMessage(message, { streaming: true });
    expect(result.toolCalls).toEqual([
      {
        id: "call-2",
        name: "generate_image",
        input: { prompt: "猫" },
        resultSummary: undefined,
        ok: undefined,
        status: "running",
      },
    ]);
  });

  it("marks a failed tool-* part done with ok:false and the error as the summary", () => {
    const message = {
      id: "m1",
      role: "assistant",
      parts: [
        {
          type: "tool-write_artifact",
          toolCallId: "call-3",
          state: "output-error",
          errorText: "写入失败",
        },
      ],
    } as unknown as UIMessage;

    const result = uiMessageToChatMessage(message, { streaming: false });
    expect(result.toolCalls?.[0]).toMatchObject({
      ok: false,
      status: "done",
      resultSummary: "写入失败",
    });
  });

  it("builds executionSteps from a data-plan part and finishes it when not streaming", () => {
    const message = {
      id: "m1",
      role: "assistant",
      parts: [
        {
          type: "data-plan",
          id: "plan",
          data: {
            todos: [{ id: "t1", content: "第一步", status: "completed" }],
          },
        },
      ],
    } as unknown as UIMessage;

    const result = uiMessageToChatMessage(message, { streaming: false });
    expect(result.executionSteps).toBeDefined();
    expect(result.executionSteps?.some((s) => s.id === "todo:t1")).toBe(true);
  });

  it("omits executionSteps entirely when there is no plan data", () => {
    const message = {
      id: "m1",
      role: "assistant",
      parts: [{ type: "text", text: "hi" }],
    } as unknown as UIMessage;

    const result = uiMessageToChatMessage(message, { streaming: false });
    expect(result.executionSteps).toBeUndefined();
  });
});
