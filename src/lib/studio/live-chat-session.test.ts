import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLiveChatSnapshot,
  sendLiveChat,
  seedLiveChatFromServer,
  setLiveChatMessages,
  stopLiveChat,
} from "./live-chat-session";
import type { Message } from "@/lib/agent/types";

function serverMsg(
  partial: Pick<Message, "id" | "role" | "content">,
): Message {
  return {
    sessionId: "s1",
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe("live-chat-session seed reconcile", () => {
  const sid = `test-session-${Math.random().toString(36).slice(2)}`;

  beforeEach(() => {
    // Isolate by unique session id per test via reassignment is hard;
    // use stop + seed empty for the fixed sid in each case with unique ids.
  });

  it("does not clobber streaming live messages with shorter server history", () => {
    const sessionId = `${sid}-stream`;
    setLiveChatMessages(sessionId, [
      { id: "user-1", role: "user", content: "写三篇笔记" },
      {
        id: "assistant-1",
        role: "assistant",
        content: "正在写…",
        streaming: true,
        streamPhase: "producing",
      },
    ]);
    // Mark as streaming via direct mutation through stop would clear it —
    // seed checks snapshot.streaming OR controller. Simulate streaming flag:
    // force streaming through setMessages already has streaming:true on msg;
    // seedLiveChatFromServer also checks m.streaming on messages via shouldPrefer
    seedLiveChatFromServer(sessionId, [
      serverMsg({ id: "srv-u", role: "user", content: "写三篇笔记" }),
    ]);
    const after = getLiveChatSnapshot(sessionId);
    expect(after.messages.some((m) => m.id === "assistant-1")).toBe(true);
    expect(after.messages.find((m) => m.role === "assistant")?.content).toBe(
      "正在写…",
    );
    stopLiveChat(sessionId);
  });

  it("prefers server history when live is idle and server is complete", () => {
    const sessionId = `${sid}-done`;
    setLiveChatMessages(sessionId, [
      { id: "user-1", role: "user", content: "hi" },
      {
        id: "assistant-1",
        role: "assistant",
        content: "hello",
        streaming: false,
        streamPhase: "done",
      },
    ]);
    seedLiveChatFromServer(sessionId, [
      serverMsg({ id: "srv-u", role: "user", content: "hi" }),
      serverMsg({ id: "srv-a", role: "assistant", content: "hello" }),
    ]);
    const after = getLiveChatSnapshot(sessionId);
    expect(after.messages.map((m) => m.id)).toEqual(["srv-u", "srv-a"]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves Workflow presentation metadata when seeding server history", () => {
    const sessionId = `${sid}-workflow-presentation`;
    seedLiveChatFromServer(sessionId, [
      {
        ...serverMsg({
          id: "workflow-run-1",
          role: "user",
          content: "canonical Workflow prompt",
        }),
        presentation: {
          kind: "workflow_run",
          workflowId: "workflow-1",
          runId: "run-1",
          stageId: "intake",
          stageTitle: "需求澄清",
          iteration: 0,
          intent: "stage_start",
        },
      },
    ]);

    expect(getLiveChatSnapshot(sessionId).messages[0]).toMatchObject({
      content: "canonical Workflow prompt",
      presentation: {
        kind: "workflow_run",
        stageTitle: "需求澄清",
        intent: "stage_start",
      },
    });
  });

  it("keeps richer live assistant when server lags", () => {
    const sessionId = `${sid}-lag`;
    setLiveChatMessages(sessionId, [
      { id: "user-1", role: "user", content: "长文" },
      {
        id: "assistant-1",
        role: "assistant",
        content: "很长的正文".repeat(20),
        streaming: false,
        streamPhase: "done",
      },
    ]);
    seedLiveChatFromServer(sessionId, [
      serverMsg({ id: "srv-u", role: "user", content: "长文" }),
    ]);
    const after = getLiveChatSnapshot(sessionId);
    expect(after.messages.find((m) => m.role === "assistant")?.content).toContain(
      "很长的正文",
    );
  });

  it("folds direct chat SSE through the shared live event behavior", async () => {
    const sessionId = `${sid}-shared-reducer`;
    const events = [
      { type: "thinking", text: "分析" },
      {
        type: "tool_call",
        id: "call-1",
        name: "read_artifact",
        input: { artifactId: "artifact-1" },
      },
      {
        type: "tool_result",
        id: "call-1",
        ok: true,
        summary: "已读取",
      },
      { type: "text_delta", text: "完成" },
      { type: "done", reason: "completed" },
    ];
    const body = `${events
      .map((event) => `data: ${JSON.stringify(event)}`)
      .join("\n\n")}\n\n`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    );

    await expect(sendLiveChat(sessionId, "开始")).resolves.toBe("sent");

    const assistant = getLiveChatSnapshot(sessionId).messages.find(
      (message) => message.role === "assistant",
    );
    expect(assistant).toMatchObject({
      content: "完成",
      thinking: "分析",
      streaming: false,
      streamPhase: "done",
      toolCalls: [
        {
          id: "call-1",
          name: "read_artifact",
          resultSummary: "已读取",
          ok: true,
          status: "done",
        },
      ],
    });
  });
});
