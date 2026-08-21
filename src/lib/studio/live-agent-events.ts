import type {
  AgentSseEvent,
  ArtifactKind,
  Role,
  WorkflowMessagePresentation,
} from "@/lib/agent/types";
import {
  reduceExecutionMap,
  type ExecutionStep,
} from "@/lib/studio/execution-map";

export type UiToolCall = {
  id: string;
  name: string;
  input?: unknown;
  resultSummary?: string;
  ok?: boolean;
  status: "running" | "done";
};

export type StreamPhase = "preparing" | "thinking" | "tool" | "producing" | "done";

export type UiChatMessage = {
  id: string;
  role: Role;
  content: string;
  presentation?: WorkflowMessagePresentation;
  streaming?: boolean;
  thinking?: string;
  toolCalls?: UiToolCall[];
  streamPhase?: StreamPhase;
  streamStartedAt?: number;
  /** Human-readable client or transport activity before the model emits SSE. */
  activityLabel?: string;
  activityTone?: "neutral" | "error";
  thinkingDurationSec?: number;
  artifactDraft?: { name?: string; text: string };
  executionSteps?: ExecutionStep[];
};

export type ArtifactEventPayload = {
  artifactId: string;
  name: string;
  kind: ArtifactKind;
};

export type LiveAgentStreamState = {
  assistant: UiChatMessage;
  preTextMs: number | null;
};

export type LiveAgentEventEffects = {
  artifact?: ArtifactEventPayload;
  error?: { message: string; code?: string };
  terminal?: Extract<AgentSseEvent, { type: "done" }>["reason"];
  sessionId?: string;
  run?: Extract<AgentSseEvent, { type: "run" }>;
  /** Server-committed id for the in-flight assistant message; reassign the optimistic id to this. */
  messageId?: string;
};

export type LiveAgentEventReduction = {
  state: LiveAgentStreamState;
  effects: LiveAgentEventEffects;
};

// Some providers/skills leak an internal completion sentinel (e.g. `<CPA_DONE>`)
// into the final assistant text instead of consuming it as a stop signal.
// These are always bare, all-caps bracket tokens — nothing a real reply would
// contain — so stripping them here is safe.
const PROTOCOL_MARKER_RE = /<\/?[A-Z][A-Z0-9_]{1,40}\/?>/g;

export function stripAgentProtocolMarkers(text: string): string {
  if (!text) return text;
  const stripped = text.replace(PROTOCOL_MARKER_RE, "");
  return stripped === text ? text : stripped.replace(/\s+$/, "");
}

function reduceArtifactDraft(
  state: LiveAgentStreamState,
  name: string | undefined,
  text: string,
): LiveAgentEventReduction {
  return {
    state: {
      ...state,
      assistant: {
        ...state.assistant,
        streaming: true,
        streamPhase: "tool",
        artifactDraft: {
          name: name ?? state.assistant.artifactDraft?.name,
          text,
        },
        executionSteps: reduceExecutionMap(state.assistant.executionSteps, {
          type: "writing",
          name: name ?? state.assistant.artifactDraft?.name,
        }),
      },
    },
    effects: {},
  };
}

export function finalizeLiveAgentState(
  state: LiveAgentStreamState,
  nowMs: number,
): LiveAgentStreamState {
  const assistant = state.assistant;
  if (!assistant.streaming && assistant.streamPhase === "done") return state;

  const thinkingDurationSec =
    assistant.thinkingDurationSec ??
    (state.preTextMs !== null
      ? Math.max(1, Math.round(state.preTextMs / 1_000))
      : assistant.streamStartedAt !== undefined
        ? Math.max(1, Math.round((nowMs - assistant.streamStartedAt) / 1_000))
        : undefined);

  return {
    ...state,
    assistant: {
      ...assistant,
      content: stripAgentProtocolMarkers(assistant.content),
      streaming: false,
      streamPhase: "done",
      thinkingDurationSec,
      artifactDraft: undefined,
      executionSteps: reduceExecutionMap(assistant.executionSteps, {
        type: "finish",
      }),
    },
  };
}

export function reduceLiveAgentEvent(
  state: LiveAgentStreamState,
  event: AgentSseEvent,
  nowMs: number,
): LiveAgentEventReduction {
  if (event.type === "session") {
    return { state, effects: { sessionId: event.sessionId } };
  }

  if (event.type === "run") {
    return { state, effects: { run: event } };
  }

  if (event.type === "message_start") {
    return { state, effects: { messageId: event.messageId } };
  }

  if (event.type === "done") {
    return {
      state: finalizeLiveAgentState(state, nowMs),
      effects: { terminal: event.reason },
    };
  }

  if (event.type === "artifact_draft") {
    return reduceArtifactDraft(state, event.name, event.text);
  }

  if (event.type === "tool_progress") {
    return event.kind === "draft" && event.text !== undefined
      ? reduceArtifactDraft(state, event.name, event.text)
      : { state, effects: {} };
  }

  if (event.type === "error") {
    return {
      state,
      effects: {
        error: {
          message: event.message,
          ...(event.code ? { code: event.code } : {}),
        },
      },
    };
  }

  if (event.type === "artifact") {
    return {
      state: {
        ...state,
        assistant: {
          ...state.assistant,
          artifactDraft: state.assistant.artifactDraft
            ? { name: event.name, text: state.assistant.artifactDraft.text }
            : undefined,
          executionSteps: reduceExecutionMap(
            state.assistant.executionSteps,
            { type: "reply" },
          ),
        },
      },
      effects: {
        artifact: {
          artifactId: event.artifactId,
          name: event.name,
          kind: event.kind,
        },
      },
    };
  }

  if (event.type === "plan") {
    return {
      state: {
        ...state,
        assistant: {
          ...state.assistant,
          streaming: true,
          streamPhase:
            state.assistant.streamPhase === "producing"
              ? "producing"
              : "tool",
          executionSteps: reduceExecutionMap(
            state.assistant.executionSteps,
            {
              type: "plan",
              todos: event.todos ?? [],
              ...(event.steps?.length ? { steps: event.steps } : {}),
            },
          ),
        },
      },
      effects: {},
    };
  }

  if (event.type === "tool_call") {
    const existing = state.assistant.toolCalls ?? [];
    const index = existing.findIndex((tool) => tool.id === event.id);
    const nextCall: UiToolCall = {
      id: event.id,
      name: event.name,
      input: event.input,
      status: "running",
    };
    const toolCalls =
      index >= 0
        ? existing.map((tool, toolIndex) =>
            toolIndex === index ? { ...tool, ...nextCall } : tool,
          )
        : [...existing, nextCall];
    const writeName =
      event.name === "write_artifact" &&
      event.input &&
      typeof event.input === "object" &&
      "name" in event.input &&
      typeof event.input.name === "string"
        ? event.input.name
        : undefined;
    const label = writeName
      ? `写入「${writeName.slice(0, 14)}${writeName.length > 14 ? "…" : ""}」`
      : undefined;

    return {
      state: {
        ...state,
        assistant: {
          ...state.assistant,
          toolCalls,
          streaming: true,
          streamPhase: "tool",
          executionSteps: reduceExecutionMap(
            state.assistant.executionSteps,
            {
              type: "tool_start",
              callId: event.id,
              toolName: event.name,
              label,
            },
          ),
        },
      },
      effects: {},
    };
  }

  if (event.type === "tool_result") {
    const existing = state.assistant.toolCalls ?? [];
    const matched = existing.find((tool) => tool.id === event.id);
    const toolName = matched?.name ?? "tool";
    const toolCalls = existing.map((tool) =>
      tool.id === event.id
        ? {
            ...tool,
            resultSummary: event.summary,
            ok: event.ok,
            status: "done" as const,
          }
        : tool,
    );
    if (!toolCalls.some((tool) => tool.id === event.id)) {
      toolCalls.push({
        id: event.id,
        name: "tool",
        resultSummary: event.summary,
        ok: event.ok,
        status: "done",
      });
    }
    const stillRunning = toolCalls.some((tool) => tool.status === "running");
    const wroteArtifact = toolCalls.some(
      (tool) => tool.name === "write_artifact" && tool.status === "done",
    );
    let executionSteps = reduceExecutionMap(state.assistant.executionSteps, {
      type: "tool_end",
      callId: event.id,
      toolName,
      ok: event.ok,
    });
    if (!stillRunning && (state.assistant.content || wroteArtifact)) {
      executionSteps = reduceExecutionMap(executionSteps, { type: "reply" });
    }

    return {
      state: {
        ...state,
        assistant: {
          ...state.assistant,
          toolCalls,
          streaming: true,
          streamPhase: stillRunning
            ? "tool"
            : state.assistant.content || wroteArtifact
              ? "producing"
              : "thinking",
          executionSteps,
        },
      },
      effects: {},
    };
  }

  if (event.type === "thinking") {
    return {
      state: {
        ...state,
        assistant: {
          ...state.assistant,
          thinking: (state.assistant.thinking ?? "") + event.text,
          streaming: true,
          streamPhase:
            state.assistant.streamPhase === "producing"
              ? "producing"
              : "thinking",
        },
      },
      effects: {},
    };
  }

  if (event.type === "text_delta") {
    const preTextMs =
      state.preTextMs ??
      (state.assistant.streamStartedAt === undefined
        ? 0
        : Math.max(0, nowMs - state.assistant.streamStartedAt));
    return {
      state: {
        preTextMs,
        assistant: {
          ...state.assistant,
          content: state.assistant.content + event.text,
          streaming: true,
          streamPhase: "producing",
          executionSteps: reduceExecutionMap(state.assistant.executionSteps, {
            type: "reply",
          }),
        },
      },
      effects: {},
    };
  }

  return { state, effects: {} };
}
