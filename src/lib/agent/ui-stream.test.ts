import { describe, expect, it } from "vitest";
import { createAgentEventTranslator } from "./ui-stream";

describe("createAgentEventTranslator", () => {
  it("brackets a text-only round with start/text-start/text-end/finish", () => {
    const translate = createAgentEventTranslator();
    expect(translate({ type: "message_start", messageId: "m1" })).toEqual([
      { type: "start", messageId: "m1" },
    ]);
    expect(translate({ type: "text_delta", text: "你好" })).toEqual([
      { type: "text-start", id: "text-0" },
      { type: "text-delta", id: "text-0", delta: "你好" },
    ]);
    expect(translate({ type: "text_delta", text: "，世界" })).toEqual([
      { type: "text-delta", id: "text-0", delta: "，世界" },
    ]);
    expect(translate({ type: "done", reason: "completed" })).toEqual([
      { type: "text-end", id: "text-0" },
      { type: "finish", finishReason: "stop" },
    ]);
  });

  it("marks the run status data part transient so it never enters message history", () => {
    const translate = createAgentEventTranslator();
    expect(translate({ type: "run", runId: "run-1", status: "running" })).toEqual([
      {
        type: "data-run",
        id: "run",
        data: { runId: "run-1", status: "running" },
        transient: true,
      },
    ]);
  });

  it("closes an open reasoning part before opening text, and vice versa", () => {
    const translate = createAgentEventTranslator();
    translate({ type: "message_start", messageId: "m1" });
    expect(translate({ type: "thinking", text: "分析中" })).toEqual([
      { type: "reasoning-start", id: "reasoning-0" },
      { type: "reasoning-delta", id: "reasoning-0", delta: "分析中" },
    ]);
    expect(translate({ type: "text_delta", text: "答案是" })).toEqual([
      { type: "reasoning-end", id: "reasoning-0" },
      { type: "text-start", id: "text-0" },
      { type: "text-delta", id: "text-0", delta: "答案是" },
    ]);
    // done only needs to close the still-open text part; reasoning already closed.
    expect(translate({ type: "done", reason: "completed" })).toEqual([
      { type: "text-end", id: "text-0" },
      { type: "finish", finishReason: "stop" },
    ]);
  });

  it("maps tool_call/tool_result to tool-input-available/tool-output-available", () => {
    const translate = createAgentEventTranslator();
    expect(
      translate({ type: "tool_call", id: "call-1", name: "read_artifact", input: { id: "a1" } }),
    ).toEqual([
      {
        type: "tool-input-available",
        toolCallId: "call-1",
        toolName: "read_artifact",
        input: { id: "a1" },
      },
    ]);
    expect(
      translate({ type: "tool_result", id: "call-1", ok: true, summary: "done" }),
    ).toEqual([
      {
        type: "tool-output-available",
        toolCallId: "call-1",
        output: { summary: "done", ok: true },
      },
    ]);
  });

  it("maps a failed tool_result to tool-output-error", () => {
    const translate = createAgentEventTranslator();
    expect(
      translate({ type: "tool_result", id: "call-2", ok: false, summary: "boom" }),
    ).toEqual([{ type: "tool-output-error", toolCallId: "call-2", errorText: "boom" }]);
  });

  it("maps plan events to a reconciled data-plan part keyed by a fixed id", () => {
    const translate = createAgentEventTranslator();
    const todos = [{ id: "t1", content: "step one", status: "in_progress" as const }];
    expect(translate({ type: "plan", todos })).toEqual([
      { type: "data-plan", id: "plan", data: { todos } },
    ]);
  });

  it("drops the deprecated artifact_draft event", () => {
    const translate = createAgentEventTranslator();
    expect(translate({ type: "artifact_draft", text: "partial" })).toEqual([]);
  });

  it("maps artifact events to a persistent data-artifact part", () => {
    const translate = createAgentEventTranslator();
    expect(
      translate({ type: "artifact", artifactId: "art-1", name: "海报", kind: "image" }),
    ).toEqual([
      {
        type: "data-artifact",
        id: "art-1",
        data: { artifactId: "art-1", name: "海报", kind: "image" },
      },
    ]);
  });

  it("maps a cancelled done to abort instead of finish", () => {
    const translate = createAgentEventTranslator();
    expect(translate({ type: "done", reason: "cancelled" })).toEqual([{ type: "abort" }]);
  });

  it("maps an errored done to finish with finishReason error", () => {
    const translate = createAgentEventTranslator();
    expect(translate({ type: "done", reason: "error" })).toEqual([
      { type: "finish", finishReason: "error" },
    ]);
  });

  it("carries error code as a transient sibling data part", () => {
    const translate = createAgentEventTranslator();
    expect(
      translate({ type: "error", message: "boom", code: "runtime_error" }),
    ).toEqual([
      { type: "error", errorText: "boom" },
      {
        type: "data-error",
        id: "error",
        data: { code: "runtime_error" },
        transient: true,
      },
    ]);
  });
});
