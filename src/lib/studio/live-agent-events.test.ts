import { describe, expect, it } from "vitest";
import { createExecutionMap } from "@/lib/studio/execution-map";
import {
  finalizeLiveAgentState,
  reduceLiveAgentEvent,
  type LiveAgentStreamState,
} from "./live-agent-events";

function streamingState(): LiveAgentStreamState {
  return {
    assistant: {
      id: "assistant-1",
      role: "assistant",
      content: "",
      streaming: true,
      toolCalls: [],
      streamPhase: "thinking",
      streamStartedAt: 1_000,
      executionSteps: createExecutionMap(),
    },
    preTextMs: null,
  };
}

describe("live Agent event reduction", () => {
  it("folds the first text delta into the streaming assistant", () => {
    const reduced = reduceLiveAgentEvent(
      streamingState(),
      { type: "text_delta", text: "第一段" },
      2_500,
    );

    expect(reduced.state).toMatchObject({
      preTextMs: 1_500,
      assistant: {
        content: "第一段",
        streaming: true,
        streamPhase: "producing",
      },
    });
    expect(reduced.effects).toEqual({});
  });

  it("appends thinking without moving a producing assistant backwards", () => {
    const initial = streamingState();
    initial.assistant.streamPhase = "producing";
    initial.assistant.thinking = "分析";

    const reduced = reduceLiveAgentEvent(
      initial,
      { type: "thinking", text: "约束" },
      2_500,
    );

    expect(reduced.state.assistant).toMatchObject({
      thinking: "分析约束",
      streaming: true,
      streamPhase: "producing",
    });
  });

  it("folds a tool call and its result onto one assistant message", () => {
    const called = reduceLiveAgentEvent(
      streamingState(),
      {
        type: "tool_call",
        id: "call-1",
        name: "write_artifact",
        input: { name: "市场分析" },
      },
      2_500,
    );
    const completed = reduceLiveAgentEvent(
      called.state,
      {
        type: "tool_result",
        id: "call-1",
        ok: true,
        summary: "已写入",
      },
      2_800,
    );

    expect(completed.state.assistant).toMatchObject({
      streamPhase: "producing",
      toolCalls: [
        {
          id: "call-1",
          name: "write_artifact",
          input: { name: "市场分析" },
          resultSummary: "已写入",
          ok: true,
          status: "done",
        },
      ],
    });
  });

  it("replaces fallback execution steps with the model plan", () => {
    const reduced = reduceLiveAgentEvent(
      streamingState(),
      {
        type: "plan",
        todos: [
          { id: "research", content: "整理资料", status: "completed" },
          { id: "draft", content: "生成初稿", status: "in_progress" },
        ],
      },
      2_500,
    );

    expect(reduced.state.assistant.executionSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "todo:research", status: "done" }),
        expect.objectContaining({ id: "todo:draft", status: "active" }),
      ]),
    );
    expect(reduced.state.assistant.streamPhase).toBe("tool");
  });

  it("reports an Artifact effect while preserving its live draft", () => {
    const initial = streamingState();
    initial.assistant.artifactDraft = { name: "旧名称", text: "草稿正文" };

    const reduced = reduceLiveAgentEvent(
      initial,
      {
        type: "artifact",
        artifactId: "artifact-1",
        name: "最终成稿",
        kind: "markdown",
      },
      2_500,
    );

    expect(reduced.state.assistant.artifactDraft).toEqual({
      name: "最终成稿",
      text: "草稿正文",
    });
    expect(reduced.effects.artifact).toEqual({
      artifactId: "artifact-1",
      name: "最终成稿",
      kind: "markdown",
    });
  });

  it("reports a public stream error without mutating the assistant", () => {
    const initial = streamingState();
    const reduced = reduceLiveAgentEvent(
      initial,
      { type: "error", message: "模型不可用", code: "model_unavailable" },
      2_500,
    );

    expect(reduced.state).toBe(initial);
    expect(reduced.effects.error).toEqual({
      message: "模型不可用",
      code: "model_unavailable",
    });
  });

  it("finalizes the assistant and reports the terminal reason", () => {
    const initial = streamingState();
    initial.preTextMs = 1_500;
    initial.assistant.artifactDraft = { text: "未完成草稿" };

    const reduced = reduceLiveAgentEvent(
      initial,
      { type: "done", reason: "completed" },
      4_000,
    );

    expect(reduced.state.assistant).toMatchObject({
      streaming: false,
      streamPhase: "done",
      thinkingDurationSec: 2,
      artifactDraft: undefined,
    });
    expect(reduced.effects.terminal).toBe("completed");
    expect(finalizeLiveAgentState(reduced.state, 5_000)).toBe(reduced.state);
  });

  it("replaces streamed Artifact drafts with the latest snapshot", () => {
    const legacyDraft = reduceLiveAgentEvent(
      streamingState(),
      { type: "artifact_draft", name: "成稿", text: "第一版" },
      2_500,
    );
    const progressDraft = reduceLiveAgentEvent(
      legacyDraft.state,
      {
        type: "tool_progress",
        id: "call-1",
        kind: "draft",
        name: "成稿",
        text: "第二版",
      },
      2_800,
    );

    expect(progressDraft.state.assistant).toMatchObject({
      streamPhase: "tool",
      artifactDraft: { name: "成稿", text: "第二版" },
    });
  });

  it("surfaces Session and Run identity without changing message state", () => {
    const initial = streamingState();
    const session = reduceLiveAgentEvent(
      initial,
      { type: "session", sessionId: "session-1" },
      2_500,
    );
    const run = reduceLiveAgentEvent(
      initial,
      { type: "run", runId: "run-1", status: "running" },
      2_500,
    );

    expect(session).toEqual({
      state: initial,
      effects: { sessionId: "session-1" },
    });
    expect(run).toEqual({
      state: initial,
      effects: {
        run: { type: "run", runId: "run-1", status: "running" },
      },
    });
  });
});
