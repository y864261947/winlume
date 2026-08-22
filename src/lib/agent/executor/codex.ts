import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import { Codex, type ThreadEvent } from "@openai/codex-sdk";
import {
  formatSkillSections,
  mergeSkillIds,
  resolveSkills,
} from "@/lib/agent/skills/inject";
import type { AgentSseEvent, Artifact, Message, Session } from "@/lib/agent/types";
import type { AgentExecutionInput, AgentExecutor } from "./types";

function codexEnabled(): boolean {
  return process.env.REIZO_CODEX_ENABLED === "true";
}

interface CodexConfiguration {
  workspace: string;
  home: string;
}

function codexConfiguration(): CodexConfiguration {
  // Never accept a workspace path from the browser or silently use the app's
  // deployment directory. The operator must choose the writable boundary.
  const workspace = process.env.REIZO_CODEX_WORKSPACE_DIR?.trim();
  const home = process.env.REIZO_CODEX_HOME?.trim();
  if (!workspace || !isAbsolute(workspace)) {
    throw new Error("REIZO_CODEX_WORKSPACE_DIR must be an absolute path");
  }
  if (!home || !isAbsolute(home)) {
    throw new Error("REIZO_CODEX_HOME must be an absolute path");
  }
  return { workspace, home };
}

function codexEnvironment(codexHome: string): Record<string, string> {
  const allowed = [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "SSL_CERT_FILE",
    "NODE_EXTRA_CA_CERTS",
  ];
  const env: Record<string, string> = {};
  for (const name of allowed) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  // Do not inherit a developer's CODEX_HOME. It can carry MCP, plugin, or
  // credential configuration unrelated to this isolated worker.
  env.CODEX_HOME = codexHome;
  return env;
}

function artifactSummary(artifacts: Artifact[]): string {
  if (!artifacts.length) return "";
  const lines = artifacts.slice(-24).map(
    (artifact) =>
      `- ${artifact.name} (id=${artifact.id}, kind=${artifact.kind}${
        artifact.status ? `, status=${artifact.status}` : ""
      })`,
  );
  return [
    "Shared project artifacts (metadata only; do not assume their contents):",
    ...lines,
  ].join("\n");
}

async function buildCodexProjectContext(
  input: AgentExecutionInput,
  session: Session,
): Promise<{ context?: string; error?: string }> {
  let project = null;
  let artifacts: Artifact[] = [];
  if (input.projectId) {
    if (!input.projects) {
      return { error: "Project context is unavailable for this worker" };
    }
    project = await input.projects.getProject(input.userId, input.projectId);
    if (!project) return { error: "项目不存在或无权访问" };
    artifacts = await input.artifacts.listByProject(input.userId, input.projectId);
  }

  const skillIds = mergeSkillIds(
    [
      ...(project?.pinnedSkillIds ?? []),
      ...(session.pinnedSkillIds ?? []),
    ],
    input.skillIds,
  );
  const skills = await resolveSkills(skillIds);
  const skillContext = formatSkillSections(skills, 12_000);
  const projectContext = project
    ? [
        "<project-context>",
        `Project: ${project.name}`,
        project.description ? `Description: ${project.description}` : "",
        project.instructions ? `Project instructions:\n${project.instructions}` : "",
        artifactSummary(artifacts),
        "</project-context>",
      ]
        .filter(Boolean)
        .join("\n")
    : "";
  const context = [projectContext, skillContext].filter(Boolean).join("\n\n");
  return context ? { context } : {};
}

function cumulativeDelta(previous: Map<string, string>, id: string, next: string): string {
  const prior = previous.get(id) ?? "";
  previous.set(id, next);
  if (next.startsWith(prior)) return next.slice(prior.length);
  return next;
}

function toolName(event: Extract<ThreadEvent, { type: `item.${string}` }>): string | null {
  if (event.item.type === "command_execution") return "codex_command";
  if (event.item.type === "file_change") return "codex_file_change";
  if (event.item.type === "mcp_tool_call") {
    return `codex_mcp:${event.item.server}/${event.item.tool}`;
  }
  return null;
}

function toolInput(event: Extract<ThreadEvent, { type: `item.${string}` }>): unknown {
  if (event.item.type === "command_execution") {
    return { command: event.item.command };
  }
  if (event.item.type === "file_change") return { changes: event.item.changes };
  if (event.item.type === "mcp_tool_call") return event.item.arguments;
  return {};
}

/** Server-side coding specialist backed by the Codex TypeScript SDK. */
export class CodexExecutor implements AgentExecutor {
  readonly mode = "codex" as const;
  // A turn can edit files or run commands before its stream reports a failure,
  // so the coordinator must never replay it automatically.
  readonly retrySafety = "at-most-once" as const;

  async *execute(input: AgentExecutionInput): AsyncGenerator<AgentSseEvent, void, undefined> {
    if (!codexEnabled()) {
      yield {
        type: "error",
        code: "codex_disabled",
        message: "Codex execution is disabled. Set REIZO_CODEX_ENABLED=true on the worker.",
      };
      yield { type: "done", reason: "error" };
      return;
    }

    const session = await input.sessions.getSession(input.userId, input.sessionId);
    if (!session) {
      yield { type: "error", code: "session_not_found", message: "会话不存在" };
      yield { type: "done", reason: "error" };
      return;
    }

    let configuration: CodexConfiguration;
    try {
      configuration = codexConfiguration();
    } catch (error) {
      yield {
        type: "error",
        code: "codex_configuration_error",
        message: error instanceof Error ? error.message : "Invalid Codex configuration",
      };
      yield { type: "done", reason: "error" };
      return;
    }

    let projectContext: string | undefined;
    try {
      const resolved = await buildCodexProjectContext(input, session);
      if (resolved.error) {
        yield { type: "error", code: "project_not_found", message: resolved.error };
        yield { type: "done", reason: "error" };
        return;
      }
      projectContext = resolved.context;
    } catch (error) {
      yield {
        type: "error",
        code: "project_context_error",
        message:
          error instanceof Error ? error.message : "Unable to load project context",
      };
      yield { type: "done", reason: "error" };
      return;
    }

    await input.sessions.appendMessages(input.userId, input.sessionId, [
      {
        id: randomUUID(),
        sessionId: input.sessionId,
        role: "user",
        content: input.userText,
        createdAt: new Date().toISOString(),
      },
    ]);

    const codex = new Codex({
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL,
      // The CLI otherwise inherits every server environment variable, including
      // credentials unrelated to this worker.
      env: codexEnvironment(configuration.home),
      // Keep the worker free of ambient developer MCP configuration. A future
      // MCP integration must supply an explicit server-side allowlist first.
      config: { mcp_servers: {} },
    });
    const threadOptions = {
      // Studio model selection belongs to the chat transport. Codex has its own
      // allowlisted operator setting and otherwise uses the SDK default.
      model: process.env.REIZO_CODEX_MODEL?.trim() || undefined,
      workingDirectory: configuration.workspace,
      sandboxMode: "workspace-write" as const,
      // There is no approval-response channel in the current web protocol, so
      // escalation must be denied rather than waiting for an absent approver.
      approvalPolicy: "never" as const,
      networkAccessEnabled: false,
      webSearchMode: "disabled" as const,
      skipGitRepoCheck: true,
    };
    const thread = session.codexThreadId
      ? codex.resumeThread(session.codexThreadId, threadOptions)
      : codex.startThread(threadOptions);

    const prompt = [
      "You are Reizo's coding specialist.",
      "Work only inside the configured workspace. Inspect existing code before editing.",
      "Implement the user's request, run focused verification, and report changed files and test evidence.",
      "Do not expose secrets or modify files outside the workspace.",
      ...(projectContext ? ["Project context:", projectContext] : []),
      "User request:",
      input.userText,
    ].join("\n\n");
    let finalText = "";
    let failed = false;
    const announcedTools = new Set<string>();
    const streamedText = new Map<string, string>();
    const streamedOutput = new Map<string, string>();

    try {
      const streamed = await thread.runStreamed(prompt, { signal: input.signal });
      for await (const event of streamed.events) {
        if (event.type === "thread.started") {
          await input.sessions.updateSession(input.userId, input.sessionId, {
            codexThreadId: event.thread_id,
          });
          yield { type: "thinking", text: "Codex coding worker started.\n" };
          continue;
        }

        if (event.type === "item.started" || event.type === "item.updated" || event.type === "item.completed") {
          const id = event.item.id;
          const name = toolName(event);
          if (name && !announcedTools.has(id)) {
            announcedTools.add(id);
            yield {
              type: "tool_call",
              id,
              name,
              input: toolInput(event),
            };
          }

          if (event.item.type === "agent_message") {
            const delta = cumulativeDelta(streamedText, id, event.item.text);
            if (delta) yield { type: "text_delta", text: delta };
            if (event.type === "item.completed") finalText = event.item.text;
          } else if (event.item.type === "reasoning") {
            const delta = cumulativeDelta(streamedText, id, event.item.text);
            if (delta) yield { type: "thinking", text: delta };
          } else if (event.item.type === "command_execution") {
            const delta = cumulativeDelta(
              streamedOutput,
              id,
              event.item.aggregated_output,
            );
            if (delta) yield { type: "tool_progress", id, kind: "text", text: delta };
            if (event.type === "item.completed") {
              yield {
                type: "tool_result",
                id,
                ok: event.item.status === "completed",
                summary:
                  event.item.exit_code === undefined
                    ? `Codex command ${event.item.status}`
                    : `Codex command ${event.item.status} (exit ${event.item.exit_code})`,
              };
            }
          } else if (event.item.type === "file_change" && event.type === "item.completed") {
            yield {
              type: "tool_result",
              id,
              ok: event.item.status === "completed",
              summary: `Codex file change ${event.item.status}`,
            };
          } else if (event.item.type === "mcp_tool_call" && event.type === "item.completed") {
            yield {
              type: "tool_result",
              id,
              ok: event.item.status === "completed",
              summary:
                event.item.status === "failed"
                  ? event.item.error?.message ?? "Codex MCP tool failed"
                  : `Codex MCP tool ${event.item.status}`,
            };
          }
          continue;
        }

        if (event.type === "turn.failed" || event.type === "error") {
          failed = true;
          yield {
            type: "error",
            code: "codex_error",
            message:
              event.type === "turn.failed" ? event.error.message : event.message,
          };
        }
      }
    } catch (error) {
      if (input.signal?.aborted) {
        yield { type: "done", reason: "cancelled" };
        return;
      }
      yield {
        type: "error",
        code: "codex_error",
        message: error instanceof Error ? error.message : "Codex execution failed",
      };
      yield { type: "done", reason: "error" };
      return;
    }

    if (!failed && finalText) {
      const assistantMessage: Message = {
        id: randomUUID(),
        sessionId: input.sessionId,
        role: "assistant",
        content: finalText,
        createdAt: new Date().toISOString(),
      };
      await input.sessions.appendMessages(input.userId, input.sessionId, [assistantMessage]);
    }

    yield {
      type: "done",
      reason: input.signal?.aborted ? "cancelled" : failed ? "error" : "completed",
    };
  }
}
