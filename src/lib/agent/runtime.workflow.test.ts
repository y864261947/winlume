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

describe("Workflow runtime", () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories) {
      rmSync(directory, { recursive: true, force: true });
    }
    directories.length = 0;
  });

  it("passes the server-owned output contract through to Artifact tools", async () => {
    const root = mkdtempSync(join(tmpdir(), "reizo-workflow-runtime-"));
    directories.push(root);
    const store = createWebFileStore(root);
    await store.sessions.createSession({
      id: "session-1",
      userId: "user-1",
      title: "Workflow",
      model: "gpt-4o-mini",
    });

    let round = 0;
    let systemPrompt = "";
    const streamChat: GatewayChatStream = async function* (request) {
      round += 1;
      systemPrompt = request.messages.find((message) => message.role === "system")
        ?.content ?? "";
      if (round === 1) {
        yield {
          kind: "tool_calls",
          calls: [
            {
              id: "call-1",
              name: "write_artifact",
              arguments: JSON.stringify({
                name: "工作简报",
                kind: "markdown",
                content: "# 工作简报",
                outputId: "brief",
              }),
            },
          ],
        };
        return;
      }
      yield { kind: "text", text: "已完成。" };
    };

    const events = [];
    for await (const event of runAgentTurn({
      userId: "user-1",
      sessionId: "session-1",
      userText: "生成工作简报",
      runId: "run-1",
      workflow: {
        workflowId: "workflow-1",
        runId: "run-1",
        stageId: "intake",
        presentation: {
          kind: "workflow_run",
          workflowId: "workflow-1",
          runId: "run-1",
          stageId: "intake",
          stageTitle: "需求澄清",
          iteration: 0,
          intent: "stage_start",
        },
        outputs: [
          { id: "brief", kinds: ["markdown"], required: true },
          { id: "summary", kinds: ["markdown"], required: false },
        ],
      },
      sessions: store.sessions,
      artifacts: store.artifacts,
      streamChat,
    })) {
      events.push(event);
    }

    expect(events.at(-1)).toEqual({ type: "done", reason: "completed" });
    expect(systemPrompt).toContain("brief");
    expect(systemPrompt).toContain("summary");
    expect(systemPrompt).toContain("outputId");
    const artifacts = await store.artifacts.listBySession("user-1", "session-1");
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].provenance?.workflow).toEqual({
      workflowId: "workflow-1",
      runId: "run-1",
      stageId: "intake",
      outputId: "brief",
    });
    const messages = await store.sessions.listMessages("user-1", "session-1");
    expect(messages[0]).toMatchObject({
      role: "user",
      content: "生成工作简报",
      presentation: {
        kind: "workflow_run",
        workflowId: "workflow-1",
        runId: "run-1",
        stageId: "intake",
        stageTitle: "需求澄清",
        iteration: 0,
        intent: "stage_start",
      },
    });
  });
});
