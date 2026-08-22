import { describe, expect, it } from "vitest";
import { createAgentExecutor, normalizeExecutionMode } from "./index";

describe("agent executor selection", () => {
  it("defaults unknown modes to the AI SDK runtime", () => {
    expect(normalizeExecutionMode(undefined)).toBe("ai-sdk");
    expect(normalizeExecutionMode("other")).toBe("ai-sdk");
  });

  it("selects the AI SDK and Codex executors explicitly", () => {
    expect(normalizeExecutionMode("ai-sdk")).toBe("ai-sdk");
    expect(normalizeExecutionMode("codex")).toBe("codex");
    expect(createAgentExecutor("ai-sdk").mode).toBe("ai-sdk");
    expect(createAgentExecutor("codex").mode).toBe("codex");
  });
});
