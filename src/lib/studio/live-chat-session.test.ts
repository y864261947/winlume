import { describe, expect, it, beforeEach } from "vitest";
import {
  getLiveChatSnapshot,
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
    const snap = getLiveChatSnapshot(sessionId);
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
});
