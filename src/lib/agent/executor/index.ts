import { runAgentTurn, type RunAgentTurnOpts } from "@/lib/agent/runtime";
import { streamAiSdkGatewayChat } from "@/lib/agent/provider/ai-sdk";
import { CodexExecutor } from "./codex";
import type { AgentExecutionInput, AgentExecutionMode, AgentExecutor } from "./types";

export type { AgentExecutionInput, AgentExecutionMode, AgentExecutor } from "./types";

function studioOptions(input: AgentExecutionInput): RunAgentTurnOpts {
  return {
    ...input,
    streamChat: undefined,
  };
}

function aiSdkOptions(input: AgentExecutionInput): RunAgentTurnOpts {
  return {
    ...input,
    streamChat: streamAiSdkGatewayChat,
  };
}

export function createAgentExecutor(mode: AgentExecutionMode): AgentExecutor {
  if (mode === "codex") return new CodexExecutor();

  return {
    mode,
    retrySafety: "at-most-once" as const,
    async *execute(input) {
      const options = mode === "ai-sdk" ? aiSdkOptions(input) : studioOptions(input);
      yield* runAgentTurn(options);
    },
  };
}

export function normalizeExecutionMode(value: unknown): AgentExecutionMode {
  if (value === "ai-sdk" || value === "codex") return value;
  return "studio";
}
