import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachWorkflowRun,
  getLiveChatSnapshot,
  sendLiveChat,
  seedLiveChatFromServer,
  startWorkflowLiveChat,
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

  it("starts a Workflow Stage directly without using the ordinary message queue", async () => {
    const sessionId = `${sid}-workflow-start`;
    const requests: Array<{ url: string; body: unknown }> = [];
    const events = [
      { type: "run", runId: "run-start-1", status: "running" },
      { type: "text_delta", text: "已形成工作简报" },
      { type: "done", reason: "completed" },
    ];
    const body = `${events
      .map((event) => `data: ${JSON.stringify(event)}`)
      .join("\n\n")}\n\n`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({
          url: String(input),
          body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
        });
        return new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    await expect(
      startWorkflowLiveChat(sessionId, {
        workflowId: "workflow-1",
        id: "intake",
        title: "需求澄清",
        iteration: 0,
        intent: "stage_start",
      }),
    ).resolves.toBe("sent");

    expect(requests).toEqual([
      {
        url: "/api/chat",
        body: { sessionId, workflowAction: "start" },
      },
    ]);
    const snapshot = getLiveChatSnapshot(sessionId);
    expect(snapshot.queue).toEqual([]);
    expect(snapshot.messages).toHaveLength(2);
    expect(snapshot.messages[0]).toMatchObject({
      role: "user",
      presentation: {
        kind: "workflow_run",
        workflowId: "workflow-1",
        runId: "run-start-1",
        stageId: "intake",
        stageTitle: "需求澄清",
        iteration: 0,
        intent: "stage_start",
      },
    });
    expect(snapshot.messages[1]).toMatchObject({
      role: "assistant",
      content: "已形成工作简报",
      streaming: false,
      streamPhase: "done",
    });
  });

  it("replays a durable Workflow Run by cursor and deduplicates event sequences", async () => {
    const sessionId = `${sid}-workflow-attach`;
    const requestedUrls: string[] = [];
    const eventBase = {
      version: 1,
      eventId: "event-2",
      runId: "run-attach-1",
      sequence: 2,
      type: "agent.event",
      occurredAt: "2026-08-04T12:00:00.000Z",
      producer: "executor:studio",
    };
    const responses = [
      {
        run: {
          id: "run-attach-1",
          sessionId,
          status: "running",
          createdAt: "2026-08-04T12:00:00.000Z",
          updatedAt: "2026-08-04T12:00:01.000Z",
        },
        events: [
          { ...eventBase, payload: { event: { type: "text_delta", text: "已恢复" } } },
          { ...eventBase, payload: { event: { type: "text_delta", text: "已恢复" } } },
        ],
        nextSequence: 2,
      },
      {
        run: {
          id: "run-attach-1",
          sessionId,
          status: "completed",
          createdAt: "2026-08-04T12:00:00.000Z",
          updatedAt: "2026-08-04T12:00:02.000Z",
        },
        events: [
          {
            ...eventBase,
            eventId: "event-3",
            sequence: 3,
            payload: { event: { type: "done", reason: "completed" } },
          },
        ],
        nextSequence: 3,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        requestedUrls.push(String(input));
        const response = responses.shift();
        if (!response) throw new Error("unexpected replay request");
        return Response.json(response);
      }),
    );

    const stage = {
      workflowId: "workflow-1",
      id: "research",
      title: "材料核验",
      iteration: 0,
      intent: "stage_start" as const,
    };
    const attachment = attachWorkflowRun(sessionId, "run-attach-1", stage);
    expect(attachWorkflowRun(sessionId, "run-attach-1", stage)).toBe(attachment);

    await expect(attachment.terminal).resolves.toBe("settled");
    expect(requestedUrls).toEqual([
      "/api/runs/run-attach-1/events?after=0",
      "/api/runs/run-attach-1/events?after=2",
    ]);
    const snapshot = getLiveChatSnapshot(sessionId);
    expect(snapshot.messages).toHaveLength(2);
    expect(snapshot.messages[0].presentation?.runId).toBe("run-attach-1");
    expect(snapshot.messages[1]).toMatchObject({
      role: "assistant",
      content: "已恢复",
      streaming: false,
      streamPhase: "done",
    });
    expect(snapshot.streaming).toBe(false);
  });

  it("detaches a Workflow replay without cancelling the server Run", async () => {
    const sessionId = `${sid}-workflow-detach`;
    const requestedUrls: string[] = [];
    let markRequested!: () => void;
    const requested = new Promise<void>((resolve) => {
      markRequested = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        requestedUrls.push(String(input));
        markRequested();
        if (requestedUrls.length > 1) {
          return Response.json({
            run: {
              id: "run-detach-1",
              sessionId,
              status: "completed",
              createdAt: "2026-08-04T12:00:00.000Z",
              updatedAt: "2026-08-04T12:00:02.000Z",
            },
            events: [
              {
                version: 1,
                eventId: "event-detach-1",
                runId: "run-detach-1",
                sequence: 1,
                type: "agent.event",
                occurredAt: "2026-08-04T12:00:02.000Z",
                producer: "executor:studio",
                payload: { event: { type: "text_delta", text: "继续完成" } },
              },
              {
                version: 1,
                eventId: "event-detach-2",
                runId: "run-detach-1",
                sequence: 2,
                type: "agent.event",
                occurredAt: "2026-08-04T12:00:02.000Z",
                producer: "executor:studio",
                payload: { event: { type: "done", reason: "completed" } },
              },
            ],
            nextSequence: 2,
          });
        }
        return Response.json({
          run: {
            id: "run-detach-1",
            sessionId,
            status: "running",
            createdAt: "2026-08-04T12:00:00.000Z",
            updatedAt: "2026-08-04T12:00:01.000Z",
          },
          events: [],
          nextSequence: 0,
        });
      }),
    );

    const attachment = attachWorkflowRun(sessionId, "run-detach-1", {
      workflowId: "workflow-1",
      id: "draft",
      title: "内容成稿",
      iteration: 0,
      intent: "stage_start",
    });
    await requested;
    attachment.detach();

    await expect(attachment.terminal).resolves.toBe("detached");
    const resumed = attachWorkflowRun(sessionId, "run-detach-1", {
      workflowId: "workflow-1",
      id: "draft",
      title: "内容成稿",
      iteration: 0,
      intent: "stage_start",
    });
    await expect(resumed.terminal).resolves.toBe("settled");
    expect(requestedUrls).toEqual([
      "/api/runs/run-detach-1/events?after=0",
      "/api/runs/run-detach-1/events?after=0",
    ]);
    expect(requestedUrls.some((url) => url.includes("/api/chat/stop"))).toBe(false);
    const snapshot = getLiveChatSnapshot(sessionId);
    expect(snapshot.messages).toHaveLength(2);
    expect(snapshot.messages[1].content).toBe("继续完成");
  });

  it("reuses the first-start messages when durable replay recovers an SSE disconnect", async () => {
    const sessionId = `${sid}-workflow-sse-recovery`;
    const stage = {
      workflowId: "workflow-1",
      id: "intake",
      title: "需求澄清",
      iteration: 0,
      intent: "stage_start" as const,
    };
    const encoder = new TextEncoder();
    let emitted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "/api/chat") {
          return new Response(
            new ReadableStream<Uint8Array>({
              pull(controller) {
                if (!emitted) {
                  emitted = true;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "run",
                        runId: "run-recovery-1",
                        status: "running",
                      })}\n\ndata: ${JSON.stringify({
                        type: "text_delta",
                        text: "部分",
                      })}\n\n`,
                    ),
                  );
                  return;
                }
                controller.error(new Error("connection lost"));
              },
            }),
            { status: 200, headers: { "Content-Type": "text/event-stream" } },
          );
        }
        return Response.json({
          run: {
            id: "run-recovery-1",
            sessionId,
            status: "completed",
            createdAt: "2026-08-04T12:00:00.000Z",
            updatedAt: "2026-08-04T12:00:03.000Z",
          },
          events: [
            {
              version: 1,
              eventId: "event-recovery-1",
              runId: "run-recovery-1",
              sequence: 1,
              type: "agent.event",
              occurredAt: "2026-08-04T12:00:01.000Z",
              producer: "executor:studio",
              payload: { event: { type: "text_delta", text: "部分" } },
            },
            {
              version: 1,
              eventId: "event-recovery-2",
              runId: "run-recovery-1",
              sequence: 2,
              type: "agent.event",
              occurredAt: "2026-08-04T12:00:02.000Z",
              producer: "executor:studio",
              payload: { event: { type: "text_delta", text: "完成" } },
            },
            {
              version: 1,
              eventId: "event-recovery-3",
              runId: "run-recovery-1",
              sequence: 3,
              type: "agent.event",
              occurredAt: "2026-08-04T12:00:03.000Z",
              producer: "executor:studio",
              payload: { event: { type: "done", reason: "completed" } },
            },
          ],
          nextSequence: 3,
        });
      }),
    );

    await expect(startWorkflowLiveChat(sessionId, stage)).resolves.toBe("sent");
    expect(getLiveChatSnapshot(sessionId).messages).toHaveLength(2);

    const attachment = attachWorkflowRun(sessionId, "run-recovery-1", stage);
    await expect(attachment.terminal).resolves.toBe("settled");

    const snapshot = getLiveChatSnapshot(sessionId);
    expect(snapshot.messages).toHaveLength(2);
    expect(snapshot.messages[0].presentation?.runId).toBe("run-recovery-1");
    expect(snapshot.messages[1]).toMatchObject({
      content: "部分完成",
      streaming: false,
      streamPhase: "done",
    });
    expect(snapshot.error).toBeNull();
  });

  it("reuses server-seeded Workflow messages when an active Run reconnects", async () => {
    const sessionId = `${sid}-workflow-server-recovery`;
    const createdAt = "2026-08-04T12:00:00.000Z";
    seedLiveChatFromServer(sessionId, [
      {
        id: "persisted-workflow-notice",
        sessionId,
        role: "user",
        content: "canonical server prompt",
        createdAt,
        presentation: {
          kind: "workflow_run",
          workflowId: "workflow-1",
          runId: "run-server-recovery-1",
          stageId: "review",
          stageTitle: "编辑审查",
          iteration: 0,
          intent: "stage_start",
        },
      },
      {
        id: "persisted-workflow-assistant",
        sessionId,
        role: "assistant",
        content: "旧的部分内容",
        createdAt,
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          run: {
            id: "run-server-recovery-1",
            sessionId,
            status: "completed",
            createdAt,
            updatedAt: "2026-08-04T12:00:02.000Z",
          },
          events: [
            {
              version: 1,
              eventId: "event-server-recovery-1",
              runId: "run-server-recovery-1",
              sequence: 1,
              type: "agent.event",
              occurredAt: "2026-08-04T12:00:01.000Z",
              producer: "executor:studio",
              payload: { event: { type: "text_delta", text: "完整恢复内容" } },
            },
            {
              version: 1,
              eventId: "event-server-recovery-2",
              runId: "run-server-recovery-1",
              sequence: 2,
              type: "agent.event",
              occurredAt: "2026-08-04T12:00:02.000Z",
              producer: "executor:studio",
              payload: { event: { type: "done", reason: "completed" } },
            },
          ],
          nextSequence: 2,
        }),
      ),
    );

    const attachment = attachWorkflowRun(sessionId, "run-server-recovery-1", {
      workflowId: "workflow-1",
      id: "review",
      title: "编辑审查",
      iteration: 0,
      intent: "stage_start",
    });
    await expect(attachment.terminal).resolves.toBe("settled");

    const snapshot = getLiveChatSnapshot(sessionId);
    expect(snapshot.messages.map((message) => message.id)).toEqual([
      "persisted-workflow-notice",
      "persisted-workflow-assistant",
    ]);
    expect(snapshot.messages[1].content).toBe("完整恢复内容");
  });
});
