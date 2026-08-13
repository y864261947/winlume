import { describe, expect, it } from "vitest";
import { mapUsageLog } from "./usage-logs";

describe("mapUsageLog", () => {
  it("keeps user-facing fields and drops routing / multiplier internals", () => {
    const mapped = mapUsageLog(
      {
        created_at: 1_800_000_000,
        type: 2,
        content: "should stay hidden for consume",
        token_name: "prod",
        model_name: "gpt-4o",
        quota: 500_000,
        prompt_tokens: 12,
        completion_tokens: 34,
        use_time: 2,
        is_stream: true,
        request_id: "req-1",
        group: "gpt-pro",
        channel: 9,
        profit: 99,
      } as never,
      0,
    );

    expect(mapped).toEqual({
      id: "req-1",
      createdAt: new Date(1_800_000_000 * 1000).toISOString(),
      type: "consume",
      model: "gpt-4o",
      tokenName: "prod",
      promptTokens: 12,
      completionTokens: 34,
      durationSeconds: 2,
      streamed: true,
      credits: 1,
      requestId: "req-1",
      content: null,
    });
    expect(JSON.stringify(mapped)).not.toMatch(/gpt-pro|profit|channel/i);
  });

  it("surfaces error content and maps error type", () => {
    expect(mapUsageLog({ type: 5, content: "model not found", created_at: 1 }, 3)).toMatchObject({
      type: "error",
      content: "model not found",
    });
  });
});
