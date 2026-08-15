import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebFileStore } from "@/lib/host/web/file-store";
import type { GatewayChatStream } from "./provider/gateway";
import { runAgentTurn } from "./runtime";

vi.mock("@/lib/agent/provider/studio-token", () => ({
  resolveStudioToken: vi.fn(async () => "sk-test-studio"),
}));

const providerMocks = vi.hoisted(() => ({
  invokeToolCapability: vi.fn(),
}));

vi.mock("@/lib/agent/tools/providers/registry", () => ({
  invokeToolCapability: providerMocks.invokeToolCapability,
}));

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

  it("exposes and executes background removal from the Composer tool loop", async () => {
    const root = mkdtempSync(join(tmpdir(), "reizo-runtime-background-removal-"));
    directories.push(root);
    const store = createWebFileStore(root);
    await store.sessions.createSession({
      id: "session-1",
      userId: "user-1",
      title: "Background removal",
      model: "gpt-4o-mini",
    });
    const source = await store.artifacts.write(
      {
        id: "source-image",
        userId: "user-1",
        sessionId: "previous-session",
        name: "shoe.jpg",
        kind: "image",
        mimeType: "image/jpeg",
        storageKey: "",
        status: "ready",
        createdAt: new Date().toISOString(),
      },
      Buffer.from("source-jpeg"),
    );
    providerMocks.invokeToolCapability.mockResolvedValueOnce({
      status: "completed",
      outputs: [{ bytes: Buffer.from("transparent-png"), mimeType: "image/png" }],
    });

    let round = 0;
    const streamChat: GatewayChatStream = async function* (params) {
      if (round++ === 0) {
        expect(params.tools).toEqual(expect.arrayContaining([
          expect.objectContaining({
            function: expect.objectContaining({ name: "remove_background" }),
          }),
        ]));
        yield {
          kind: "tool_calls",
          calls: [{
            id: "call-remove-background",
            name: "remove_background",
            arguments: JSON.stringify({ sourceArtifactId: source.id }),
          }],
        };
        return;
      }
      yield { kind: "text", text: "已完成抠图。" };
    };

    const events = [];
    for await (const event of runAgentTurn({
      userId: "user-1",
      sessionId: "session-1",
      userText: "把这张鞋子的背景去掉",
      runId: "run-1",
      sessions: store.sessions,
      artifacts: store.artifacts,
      referencedArtifactIds: [source.id],
      streamChat,
    })) {
      events.push(event);
    }

    expect(providerMocks.invokeToolCapability).toHaveBeenCalledWith(
      "image.background_removal",
      { images: [{ bytes: Buffer.from("source-jpeg"), mimeType: "image/jpeg" }] },
    );
    const output = (await store.artifacts.listBySession("user-1", "session-1"))[0];
    expect(output).toMatchObject({
      name: "shoe（已抠图）.png",
      kind: "image",
      mimeType: "image/png",
      status: "ready",
    });
    expect(await store.artifacts.readContent("user-1", output!.id)).toEqual(
      Buffer.from("transparent-png"),
    );
    expect(events).toContainEqual(expect.objectContaining({
      type: "artifact",
      artifactId: output!.id,
    }));
  });
});
