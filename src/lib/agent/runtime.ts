/**
 * Agent turn runtime with multi-round tool loop (max 8).
 * Loads session history, streams the gateway with tools, persists messages, yields AgentSseEvent.
 */

import { randomUUID } from "node:crypto";
import type { AgentSseEvent, Message, ToolCallRecord } from "@/lib/agent/types";
import type { ArtifactStore, SessionStore } from "@/lib/host/ports";
import {
  streamGatewayChat,
  type GatewayChatMessage,
  type GatewayToolCall,
} from "@/lib/agent/provider/gateway";
import {
  buildSystemPrompt,
  mergeSkillIds,
  resolveSkills,
} from "@/lib/agent/skills/inject";
import { STUDIO_TOOLS } from "@/lib/agent/tools/definitions";
import {
  executeStudioTool,
  mimeTypeForKind,
} from "@/lib/agent/tools/execute";
import {
  artifactNameFromTurn,
  inferArtifactKind,
  shouldAutoPersistArtifact,
} from "@/lib/agent/auto-artifact";

/** Max gateway rounds that may request tools in a single user turn. */
export const MAX_TOOL_ROUNDS = 8;

/** Fixed studio system policy (zh/en short). Skills injected per turn via skillIds. */
export const BASE_POLICY = [
  "You are the WinLume Studio agent — a free-form assistant for writing, coding, analysis, and structured deliverables.",
  "Prefer clear, structured, helpful answers. Match the user's language (Chinese-first when the user writes in Chinese).",
  "WinLume is a workbench: durable deliverables must be saved as artifacts so the user can preview/export them in the right-hand panel.",
  "ALWAYS call write_artifact when the user asks for notes, copy, articles, reports, outlines, scripts, multi-piece content (e.g. 几篇小红书笔记), code files, or any document longer than a short chat reply. Put the full body in the tool; keep the chat message to a short summary + what was saved.",
  "Do not dump long multi-section documents only in chat. Chat is for conversation; artifacts are for finished work.",
  "You can use read_artifact and list_artifacts to inspect previously saved work in this session.",
  "Do not claim tools or capabilities that are not available in this turn.",
  "Respect any skill instructions attached to the current user message.",
].join(" ");

function nowIso(): string {
  return new Date().toISOString();
}

function titleFromUserText(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (!oneLine) return "新对话";
  return oneLine.length > 40 ? `${oneLine.slice(0, 40)}…` : oneLine;
}

/**
 * Map persisted Message history to OpenAI-compatible gateway messages.
 * Includes assistant tool_calls and tool role results for multi-round continuity.
 */
export function toGatewayMessages(
  system: string,
  history: Message[],
): GatewayChatMessage[] {
  const out: GatewayChatMessage[] = [{ role: "system", content: system }];
  for (const m of history) {
    if (m.role === "system") continue;

    if (m.role === "tool") {
      if (!m.toolCallId) continue;
      out.push({
        role: "tool",
        tool_call_id: m.toolCallId,
        content: m.content,
      });
      continue;
    }

    if (m.role === "assistant" && m.toolCalls?.length) {
      const tool_calls: GatewayToolCall[] = m.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      }));
      out.push({
        role: "assistant",
        content: m.content || null,
        tool_calls,
      });
      continue;
    }

    out.push({
      role: m.role,
      content: m.content,
    });
  }
  return out;
}

export interface RunAgentTurnOpts {
  userId: string;
  sessionId: string;
  userText: string;
  skillIds?: string[];
  model?: string;
  sessions: SessionStore;
  artifacts: ArtifactStore;
  signal?: AbortSignal;
  /** Forwarded to gateway as New-Api-User when set */
  gatewayUserId?: string;
}

/**
 * Run one user→assistant turn with up to MAX_TOOL_ROUNDS tool rounds.
 * Yields SSE events for the chat route.
 */
export async function* runAgentTurn(
  opts: RunAgentTurnOpts,
): AsyncGenerator<AgentSseEvent, void, undefined> {
  const { userId, sessionId, sessions, artifacts, signal } = opts;
  const userText = opts.userText.trim();
  if (!userText) {
    yield { type: "error", message: "消息不能为空", code: "empty_message" };
    yield { type: "done", reason: "error" };
    return;
  }

  if (signal?.aborted) {
    yield { type: "done", reason: "cancelled" };
    return;
  }

  let session = await sessions.getSession(userId, sessionId);
  if (!session) {
    yield {
      type: "error",
      message: "会话不存在",
      code: "session_not_found",
    };
    yield { type: "done", reason: "error" };
    return;
  }

  const model =
    (typeof opts.model === "string" && opts.model.trim()) || session.model;
  if (model !== session.model) {
    session = await sessions.updateSession(userId, sessionId, { model });
  }

  const prior = await sessions.listMessages(userId, sessionId);
  const isFirstTurn = prior.length === 0;

  // Persist turn-selected ids only on Message for audit; inject uses merged set below.
  const userMessage: Message = {
    id: randomUUID(),
    sessionId,
    role: "user",
    content: userText,
    ...(opts.skillIds?.length ? { skillIds: opts.skillIds } : {}),
    createdAt: nowIso(),
  };

  await sessions.appendMessages(userId, sessionId, [userMessage]);

  if (isFirstTurn) {
    const title = titleFromUserText(userText);
    if (title !== session.title) {
      session = await sessions.updateSession(userId, sessionId, { title });
    }
  }

  yield { type: "session", sessionId };

  const effectiveSkillIds = mergeSkillIds(
    session.pinnedSkillIds,
    opts.skillIds,
  );
  const skills = await resolveSkills(effectiveSkillIds);
  const system = buildSystemPrompt(BASE_POLICY, skills);

  let history = await sessions.listMessages(userId, sessionId);
  let gatewayMessages = toGatewayMessages(system, history);

  let sawError = false;
  let cancelled = false;
  /** True when write_artifact succeeded at least once this user turn. */
  let wroteArtifact = false;
  /** Last non-empty assistant text streamed this turn (for auto-artifact fallback). */
  let lastAssistantText = "";
  let lastAssistantMessageId: string | undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (signal?.aborted) {
      cancelled = true;
      break;
    }

    let assistantText = "";
    let completedToolCalls: { id: string; name: string; arguments: string }[] =
      [];
    let streamError = false;

    try {
      for await (const chunk of streamGatewayChat({
        model,
        messages: gatewayMessages,
        tools: [...STUDIO_TOOLS],
        userId: opts.gatewayUserId ?? userId,
        signal,
      })) {
        if (signal?.aborted) {
          cancelled = true;
          break;
        }

        if (chunk.kind === "text") {
          assistantText += chunk.text;
          yield { type: "text_delta", text: chunk.text };
          continue;
        }

        if (chunk.kind === "tool_calls") {
          completedToolCalls = chunk.calls;
          continue;
        }

        if (chunk.kind === "tool_call_delta") {
          // Accumulated by gateway; final tool_calls chunk is authoritative.
          continue;
        }

        if (chunk.kind === "error") {
          streamError = true;
          sawError = true;
          yield {
            type: "error",
            message: chunk.message,
            code: "gateway_error",
          };
          break;
        }
      }
    } catch (err) {
      if (
        signal?.aborted ||
        (err instanceof Error && err.name === "AbortError")
      ) {
        cancelled = true;
      } else {
        sawError = true;
        const message =
          err instanceof Error ? err.message : "Agent turn failed unexpectedly";
        yield { type: "error", message, code: "runtime_error" };
      }
      break;
    }

    if (cancelled || streamError) break;
    if (signal?.aborted) {
      cancelled = true;
      break;
    }

    // Final text reply (no tools this round)
    if (!completedToolCalls.length) {
      if (assistantText) {
        lastAssistantText = assistantText;
        const assistantMessage: Message = {
          id: randomUUID(),
          sessionId,
          role: "assistant",
          content: assistantText,
          createdAt: nowIso(),
        };
        lastAssistantMessageId = assistantMessage.id;
        await sessions.appendMessages(userId, sessionId, [assistantMessage]);
      } else if (round === 0) {
        // Empty stream with no tools — still complete without persisting empty msg
      }
      break;
    }

    // Persist assistant message that requested tools (may include intermediate text)
    const assistantId = randomUUID();
    if (assistantText) {
      lastAssistantText = assistantText;
      lastAssistantMessageId = assistantId;
    }
    const toolCallRecords: ToolCallRecord[] = completedToolCalls.map((c) => ({
      id: c.id,
      name: c.name,
      arguments: c.arguments,
    }));

    await sessions.appendMessages(userId, sessionId, [
      {
        id: assistantId,
        sessionId,
        role: "assistant",
        content: assistantText,
        toolCalls: toolCallRecords,
        createdAt: nowIso(),
      },
    ]);

    const toolMessages: Message[] = [];

    for (const call of completedToolCalls) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }

      let parsedInput: unknown = {};
      try {
        parsedInput = call.arguments?.trim()
          ? (JSON.parse(call.arguments) as unknown)
          : {};
      } catch {
        parsedInput = { _raw: call.arguments };
      }

      yield {
        type: "tool_call",
        id: call.id,
        name: call.name,
        input: parsedInput,
      };

      const result = await executeStudioTool(call.name, call.arguments, {
        userId,
        sessionId,
        artifacts,
        messageId: assistantId,
      });

      if (call.name === "write_artifact" && result.ok) {
        wroteArtifact = true;
      }

      yield {
        type: "tool_result",
        id: call.id,
        ok: result.ok,
        summary: result.summary,
      };

      if (result.events?.length) {
        for (const ev of result.events) {
          yield ev;
        }
      }

      toolMessages.push({
        id: randomUUID(),
        sessionId,
        role: "tool",
        content: result.content,
        toolCallId: call.id,
        createdAt: nowIso(),
      });
    }

    if (toolMessages.length) {
      await sessions.appendMessages(userId, sessionId, toolMessages);
    }

    if (cancelled) break;

    // Continue next gateway round with tool results in history
    history = await sessions.listMessages(userId, sessionId);
    gatewayMessages = toGatewayMessages(system, history);
  }

  if (signal?.aborted) cancelled = true;

  // Workbench guarantee: long / structured deliverables become artifacts even if
  // the model only replied in chat (common with gpt-* when tool use is ignored).
  if (!cancelled && !sawError && !wroteArtifact && lastAssistantText) {
    if (shouldAutoPersistArtifact(userText, lastAssistantText)) {
      try {
        const name = artifactNameFromTurn(userText, lastAssistantText);
        const kind = inferArtifactKind(lastAssistantText);
        const id = randomUUID();
        const createdAt = nowIso();
        const artifact = await artifacts.write(
          {
            id,
            userId,
            sessionId,
            ...(lastAssistantMessageId
              ? { messageId: lastAssistantMessageId }
              : {}),
            name,
            kind,
            mimeType: mimeTypeForKind(kind),
            storageKey: "",
            createdAt,
          },
          lastAssistantText,
        );
        wroteArtifact = true;
        yield {
          type: "artifact",
          artifactId: artifact.id,
          name: artifact.name,
          kind: artifact.kind,
        };
        // Brief system note in the stream so UI can show "已归档为作品"
        yield {
          type: "text_delta",
          text: `\n\n——\n已自动保存为作品「${artifact.name}」，可在右侧预览与导出。`,
        };
        // Persist the note on the assistant message when possible
        if (lastAssistantMessageId) {
          const msgs = await sessions.listMessages(userId, sessionId);
          const target = msgs.find((m) => m.id === lastAssistantMessageId);
          if (target && target.role === "assistant") {
            // Session store may not support patch — append a light system line as new message
            await sessions.appendMessages(userId, sessionId, [
              {
                id: randomUUID(),
                sessionId,
                role: "system",
                content: `已自动保存为作品「${artifact.name}」（id=${artifact.id}）`,
                createdAt: nowIso(),
              },
            ]);
          }
        }
      } catch {
        // Auto-artifact must never fail the turn
      }
    }
  }

  if (cancelled) {
    yield { type: "done", reason: "cancelled" };
  } else if (sawError) {
    yield { type: "done", reason: "error" };
  } else {
    yield { type: "done", reason: "completed" };
  }
}
