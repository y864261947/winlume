import { describe, expect, it } from "vitest";
import {
  RunBudgetExceededError,
  RunBudgetTracker,
  RunPolicyError,
  createStaticRunPolicy,
} from "./policy";

describe("run policy", () => {
  it("keeps Codex disabled until explicitly allowlisted", () => {
    const policy = createStaticRunPolicy();
    const decision = policy.evaluate({
      userId: "u1",
      executionMode: "codex",
      message: "inspect this repository",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("mode_not_allowed");
  });

  it("can bind the current Codex workspace to one trusted user", () => {
    const policy = createStaticRunPolicy({
      allowedExecutionModes: ["codex"],
      codexTrustedUserId: "operator-1",
    });
    expect(
      policy.evaluate({
        userId: "other-user",
        executionMode: "codex",
        message: "inspect the workspace",
      }),
    ).toMatchObject({ allowed: false, code: "user_not_allowed" });
    expect(
      policy.evaluate({
        userId: "operator-1",
        executionMode: "codex",
        message: "inspect the workspace",
      }).allowed,
    ).toBe(true);
  });

  it("enforces model/input/tool limits and exposes approval requirements", () => {
    const policy = createStaticRunPolicy({
      allowedExecutionModes: ["ai-sdk", "codex"],
      allowedModels: ["gpt-4o-mini"],
      approvalRequiredTools: ["shell"],
      deniedTools: ["network_request"],
      limits: { maxInputChars: 10 },
    });
    expect(
      policy.evaluate({
        userId: "u1",
        executionMode: "ai-sdk",
        model: "gpt-4o-mini",
        message: "short",
        requestedToolNames: ["shell"],
      }),
    ).toMatchObject({ allowed: true, approvalRequiredTools: ["shell"] });
    expect(
      policy.evaluate({
        userId: "u1",
        executionMode: "ai-sdk",
        model: "other-model",
        message: "short",
      }).code,
    ).toBe("model_not_allowed");
    expect(
      policy.evaluate({
        userId: "u1",
        executionMode: "ai-sdk",
        model: "gpt-4o-mini",
        message: "this is too long",
      }).code,
    ).toBe("input_too_large");
    expect(
      policy.evaluate({
        userId: "u1",
        executionMode: "ai-sdk",
        model: "gpt-4o-mini",
        message: "short",
        requestedToolNames: ["network_request"],
      }).code,
    ).toBe("tool_not_allowed");
  });

  it("throws a typed error for rejected requests", () => {
    const policy = createStaticRunPolicy();
    expect(() =>
      policy.assertAllowed({
        userId: "",
        executionMode: "studio",
        message: "hello",
      }),
    ).toThrowError(RunPolicyError);
  });

  it("tracks token, tool, time, cost, and retry budgets", () => {
    const tracker = new RunBudgetTracker({
      maxDurationMs: 100,
      maxInputChars: 100,
      maxToolCalls: 2,
      maxOutputTokens: 20,
      maxCostUsd: 0.5,
      maxAttempts: 2,
    });
    tracker.consume({ inputChars: 10, toolCalls: 1, outputTokens: 5, costUsd: 0.1 });
    expect(tracker.remaining()).toMatchObject({
      inputChars: 90,
      toolCalls: 1,
      outputTokens: 15,
      costUsd: 0.4,
    });
    expect(() => tracker.consume({ toolCalls: 2 })).toThrowError(
      RunBudgetExceededError,
    );
    expect(tracker.usage.toolCalls).toBe(1);
  });
});
