import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSseEvent, Session } from "@/lib/agent/types";
import type { ArtifactStore, ProjectStore, SessionStore } from "@/lib/host/ports";
import { CodexExecutor } from "./codex";
import type { AgentExecutionInput } from "./types";

const codexSdk = vi.hoisted(() => ({
  construct: vi.fn(),
  startThread: vi.fn(),
  resumeThread: vi.fn(),
}));

vi.mock("@openai/codex-sdk", () => ({
  Codex: class {
    constructor(options: unknown) {
      codexSdk.construct(options);
    }

    startThread(options: unknown) {
      return codexSdk.startThread(options);
    }

    resumeThread(id: string, options: unknown) {
      return codexSdk.resumeThread(id, options);
    }
  },
}));

const session: Session = {
  id: "session-1",
  userId: "user-1",
  title: "Coding",
  model: "gpt-4o-mini",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function executionInput(): AgentExecutionInput {
  return {
    userId: session.userId,
    sessionId: session.id,
    userText: "fix the tests",
    sessions: {
      getSession: vi.fn().mockResolvedValue(session),
      appendMessages: vi.fn().mockResolvedValue(undefined),
      updateSession: vi.fn().mockResolvedValue(session),
    } as unknown as SessionStore,
    artifacts: {} as ArtifactStore,
  };
}

async function collect(executor: CodexExecutor): Promise<AgentSseEvent[]> {
  const events: AgentSseEvent[] = [];
  for await (const event of executor.execute(executionInput())) events.push(event);
  return events;
}

describe("CodexExecutor configuration", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("is disabled unless the worker opts in", async () => {
    vi.stubEnv("WINLUME_CODEX_ENABLED", "false");

    await expect(collect(new CodexExecutor())).resolves.toEqual([
      expect.objectContaining({ type: "error", code: "codex_disabled" }),
      { type: "done", reason: "error" },
    ]);
  });

  it("requires an explicit absolute workspace", async () => {
    vi.stubEnv("WINLUME_CODEX_ENABLED", "true");
    vi.stubEnv("WINLUME_CODEX_WORKSPACE_DIR", "relative/workspace");

    await expect(collect(new CodexExecutor())).resolves.toEqual([
      expect.objectContaining({
        type: "error",
        code: "codex_configuration_error",
      }),
      { type: "done", reason: "error" },
    ]);
  });

  it("requires an isolated Codex home", async () => {
    vi.stubEnv("WINLUME_CODEX_ENABLED", "true");
    vi.stubEnv("WINLUME_CODEX_WORKSPACE_DIR", "/tmp/winlume-codex-test");
    vi.stubEnv("WINLUME_CODEX_HOME", "relative/codex-home");

    await expect(collect(new CodexExecutor())).resolves.toEqual([
      expect.objectContaining({
        type: "error",
        code: "codex_configuration_error",
      }),
      { type: "done", reason: "error" },
    ]);
  });

  it("adapts completed-only file changes and persists thread continuity", async () => {
    vi.stubEnv("WINLUME_CODEX_ENABLED", "true");
    vi.stubEnv("WINLUME_CODEX_WORKSPACE_DIR", "/tmp/winlume-codex-test");
    vi.stubEnv("WINLUME_CODEX_HOME", "/tmp/winlume-codex-home");
    async function* events() {
      yield { type: "thread.started", thread_id: "thread-123" };
      yield {
        type: "item.completed",
        item: {
          id: "patch-1",
          type: "file_change",
          changes: [{ path: "src/app.ts", kind: "update" }],
          status: "completed",
        },
      };
      yield {
        type: "item.completed",
        item: { id: "message-1", type: "agent_message", text: "Tests pass." },
      };
      yield {
        type: "turn.completed",
        usage: {
          input_tokens: 1,
          cached_input_tokens: 0,
          cache_write_input_tokens: 0,
          output_tokens: 1,
          reasoning_output_tokens: 0,
        },
      };
    }
    codexSdk.startThread.mockReturnValue({
      runStreamed: vi.fn().mockResolvedValue({ events: events() }),
    });
    const input = executionInput();
    const actual: AgentSseEvent[] = [];

    for await (const event of new CodexExecutor().execute(input)) actual.push(event);

    expect(actual).toEqual([
      { type: "thinking", text: "Codex coding worker started.\n" },
      {
        type: "tool_call",
        id: "patch-1",
        name: "codex_file_change",
        input: { changes: [{ path: "src/app.ts", kind: "update" }] },
      },
      {
        type: "tool_result",
        id: "patch-1",
        ok: true,
        summary: "Codex file change completed",
      },
      { type: "text_delta", text: "Tests pass." },
      { type: "done", reason: "completed" },
    ]);
    expect(input.sessions.updateSession).toHaveBeenCalledWith(
      session.userId,
      session.id,
      { codexThreadId: "thread-123" },
    );
    expect(input.sessions.appendMessages).toHaveBeenCalledTimes(2);
    expect(codexSdk.construct).toHaveBeenCalledWith(
      expect.objectContaining({ config: { mcp_servers: {} } }),
    );
  });

  it("injects project instructions and shared artifact metadata", async () => {
    vi.stubEnv("WINLUME_CODEX_ENABLED", "true");
    vi.stubEnv("WINLUME_CODEX_WORKSPACE_DIR", "/tmp/winlume-codex-test");
    vi.stubEnv("WINLUME_CODEX_HOME", "/tmp/winlume-codex-home");
    const runStreamed = vi.fn().mockResolvedValue({
      events: (async function* () {
        yield { type: "thread.started", thread_id: "thread-123" };
        yield {
          type: "item.completed",
          item: { id: "message-1", type: "agent_message", text: "Done." },
        };
      })(),
    });
    codexSdk.startThread.mockReturnValue({ runStreamed });
    const input: AgentExecutionInput = {
      ...executionInput(),
      projectId: "project-1",
      projects: {
        getProject: vi.fn().mockResolvedValue({
          id: "project-1",
          name: "Launch plan",
          instructions: "Keep the deployment reversible.",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      } as unknown as ProjectStore,
      artifacts: {
        listByProject: vi.fn().mockResolvedValue([
          {
            id: "artifact-1",
            userId: session.userId,
            sessionId: session.id,
            projectId: "project-1",
            name: "Architecture notes",
            kind: "markdown",
            mimeType: "text/markdown",
            storageKey: "artifact-1",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ]),
      } as unknown as ArtifactStore,
    };

    for await (const event of new CodexExecutor().execute(input)) {
      // Drain the generator so the prompt is submitted to the mocked SDK.
      void event;
    }

    const prompt = runStreamed.mock.calls[0]?.[0] as string;
    expect(prompt).toContain("Project: Launch plan");
    expect(prompt).toContain("Keep the deployment reversible.");
    expect(prompt).toContain("Architecture notes");
  });
});
