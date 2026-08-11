import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWebFileStore } from "@/lib/host/web/file-store";
import type { GatewayChatStream } from "./provider/gateway";
import { runAgentTurn } from "./runtime";

describe("runAgentTurn chunk mapping", () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories) {
      rmSync(directory, { recursive: true, force: true });
    }
    directories.length = 0;
  });

  it("surfaces reasoning/thinking chunks as thinking events, kept out of the final answer text", async () => {
    const root = mkdtempSync(join(tmpdir(), "reizo-runtime-thinking-"));
    directories.push(root);
    const store = createWebFileStore(root);
    await store.sessions.createSession({
      id: "session-1",
      userId: "user-1",
      title: "Thinking",
      model: "gpt-4o-mini",
    });

    const streamChat: GatewayChatStream = async function* () {
      yield { kind: "thinking", text: "分析一下用户的问题：" };
      yield { kind: "thinking", text: "需要先确认范围。" };
      yield { kind: "text", text: "这是最终答案。" };
    };

    const events = [];
    for await (const event of runAgentTurn({
      userId: "user-1",
      sessionId: "session-1",
      userText: "帮我分析一下",
      runId: "run-1",
      sessions: store.sessions,
      artifacts: store.artifacts,
      streamChat,
    })) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: "thinking",
      text: "分析一下用户的问题：",
    });
    expect(events).toContainEqual({ type: "thinking", text: "需要先确认范围。" });
    expect(events).toContainEqual({ type: "text_delta", text: "这是最终答案。" });

    const messages = await store.sessions.listMessages("user-1", "session-1");
    const assistant = messages.find((m) => m.role === "assistant");
    expect(assistant?.content).toBe("这是最终答案。");
    expect(assistant?.content).not.toContain("分析一下");
  });
});
