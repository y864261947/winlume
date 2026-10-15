import { describe, expect, it } from "vitest";
import {
  classifyHttpFailure,
  costFromLogRow,
  extractUsage,
  judgeCase,
  judgeDurationMultiplier,
} from "./judge";
import { casesForTier, inferModelKind, matchesDurationAdaptorRule } from "./cases";
import { buildTextRequest, buildVideoRequest } from "./requests";

describe("model kind inference", () => {
  it("routes models to the right probe matrix", () => {
    expect(inferModelKind("gpt-4o")).toBe("text");
    expect(inferModelKind("claude-sonnet-4")).toBe("text");
    expect(inferModelKind("gpt-image-2")).toBe("image");
    expect(inferModelKind("flux-1.1-pro")).toBe("image");
    expect(inferModelKind("veo-3")).toBe("video");
    expect(inferModelKind("wan3.0-t2v")).toBe("video");
    expect(inferModelKind("grok-imagine-video-1.5")).toBe("video");
  });
});

describe("duration adaptor rule", () => {
  // Mirrors relay/channel/task/codexvideo/adaptor.go:132.
  it("matches only the names new-api recognises for duration billing", () => {
    expect(matchesDurationAdaptorRule("MiniMaxH3-720p-sec")).toBe(true);
    expect(matchesDurationAdaptorRule("wan3.0-t2v")).toBe(true);
    expect(matchesDurationAdaptorRule("veo-3")).toBe(false);
    expect(matchesDurationAdaptorRule("sora-2")).toBe(false);
  });
});

describe("tier selection", () => {
  it("keeps smoke to a single cheapest call", () => {
    expect(casesForTier("text", "smoke")).toEqual(["basic_text"]);
    expect(casesForTier("image", "smoke")).toEqual(["image_generate"]);
  });
  it("widens coverage at higher tiers", () => {
    expect(casesForTier("text", "full").length).toBeGreaterThan(casesForTier("text", "standard").length);
    expect(casesForTier("text", "full")).toContain("long_context");
  });
});

describe("transport vs capability failures", () => {
  // The single most important distinction in the probe: a rate-limited run
  // must never be recorded as a pile of unsupported capabilities.
  it("treats auth, rate limit and 5xx as error, not fail", () => {
    expect(classifyHttpFailure(401, null).outcome).toBe("error");
    expect(classifyHttpFailure(403, null).outcome).toBe("error");
    expect(classifyHttpFailure(429, null).outcome).toBe("error");
    expect(classifyHttpFailure(500, null).outcome).toBe("error");
    expect(classifyHttpFailure(503, null).outcome).toBe("error");
  });
  it("treats request rejection as a genuine capability signal", () => {
    expect(classifyHttpFailure(400, { error: { message: "unsupported" } }).outcome).toBe("fail");
    expect(classifyHttpFailure(404, null).outcome).toBe("fail");
  });
  it("reports a transport error rather than guessing", () => {
    const result = judgeCase("basic_text", { status: null, body: null, transportError: "timeout" });
    expect(result.outcome).toBe("error");
    expect(result.detail).toContain("timeout");
  });
});

describe("case judging", () => {
  const ok = (content: string) => ({ choices: [{ message: { content } }] });

  it("requires non-empty content for basic text", () => {
    expect(judgeCase("basic_text", { status: 200, body: ok("OK") }).outcome).toBe("pass");
    expect(judgeCase("basic_text", { status: 200, body: ok("   ") }).outcome).toBe("fail");
  });

  it("rejects a single-event stream as not genuinely streaming", () => {
    expect(
      judgeCase("streaming", { status: 200, body: null, streamEvents: 5, streamedText: "12345" }).outcome,
    ).toBe("pass");
    const single = judgeCase("streaming", { status: 200, body: null, streamEvents: 1, streamedText: "all" });
    expect(single.outcome).toBe("fail");
    expect(single.detail).toContain("1 个事件");
  });

  it("validates tool call shape, not just presence", () => {
    const valid = {
      choices: [{ message: { tool_calls: [{ function: { name: "get_weather", arguments: '{"city":"Tokyo"}' } }] } }],
    };
    expect(judgeCase("tool_call", { status: 200, body: valid }).outcome).toBe("pass");

    const badJson = {
      choices: [{ message: { tool_calls: [{ function: { name: "get_weather", arguments: "{city:Tokyo" } }] } }],
    };
    expect(judgeCase("tool_call", { status: 200, body: badJson }).outcome).toBe("fail");

    expect(judgeCase("tool_call", { status: 200, body: ok("I cannot") }).outcome).toBe("fail");
  });

  it("checks json mode actually returns parseable JSON", () => {
    expect(judgeCase("json_mode", { status: 200, body: ok('{"status":"ok"}') }).outcome).toBe("pass");
    expect(judgeCase("json_mode", { status: 200, body: ok("Sure! Here you go:") }).outcome).toBe("fail");
  });

  it("separates billed-but-hidden reasoning from absent reasoning", () => {
    const exposed = { choices: [{ message: { reasoning_content: "step 1..." } }] };
    expect(judgeCase("reasoning", { status: 200, body: exposed }).outcome).toBe("pass");

    const hidden = {
      choices: [{ message: { content: "5 minutes" } }],
      usage: { completion_tokens_details: { reasoning_tokens: 120 } },
    };
    const result = judgeCase("reasoning", { status: 200, body: hidden });
    expect(result.outcome).toBe("fail");
    expect(result.detail).toContain("120");
  });

  it("accepts either b64_json or url for images", () => {
    expect(judgeCase("image_generate", { status: 200, body: { data: [{ b64_json: "abc" }] } }).outcome).toBe("pass");
    expect(judgeCase("image_generate", { status: 200, body: { data: [{ url: "https://x/y.png" }] } }).outcome).toBe("pass");
    expect(judgeCase("image_generate", { status: 200, body: { data: [{}] } }).outcome).toBe("fail");
    expect(judgeCase("image_generate", { status: 200, body: { data: [] } }).outcome).toBe("fail");
  });

  it("treats a 200 carrying an error envelope as a rejection", () => {
    const result = judgeCase("basic_text", { status: 200, body: { error: { message: "model not found" } } });
    expect(result.outcome).toBe("fail");
    expect(result.detail).toContain("model not found");
  });
});

describe("usage extraction", () => {
  it("reads both openai and images-style field names", () => {
    expect(extractUsage({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
    expect(extractUsage({ usage: { input_tokens: 3, output_tokens: 4 } })).toEqual({
      promptTokens: 3,
      completionTokens: 4,
      totalTokens: null,
    });
    expect(extractUsage({})).toBeNull();
  });
});

describe("cost attribution", () => {
  it("converts quota to credits when the log row is found", () => {
    const cost = costFromLogRow("req-1", { quota: 500_000 });
    expect(cost.credits).toBe(1);
    expect(cost.unavailableReason).toBeNull();
  });
  // Missing cost must be explained, never reported as free.
  it("explains missing cost instead of reporting zero", () => {
    expect(costFromLogRow(null, null).credits).toBeNull();
    expect(costFromLogRow(null, null).unavailableReason).toContain("new-api");
    expect(costFromLogRow("req-2", null).credits).toBeNull();
    expect(costFromLogRow("req-2", null).unavailableReason).toContain("扣费记录");
  });
});

describe("per-second duration billing verdict", () => {
  const base = { shortSeconds: 5, longSeconds: 10 };

  it("passes when cost scales with duration", () => {
    const result = judgeDurationMultiplier({ ...base, modelName: "wan3.0-t2v", shortCost: 1000, longCost: 2000 });
    expect(result.outcome).toBe("pass");
    expect(result.ratio).toBe(2);
  });

  it("flags a flat cost as the silent-loss case and names the cause", () => {
    const result = judgeDurationMultiplier({ ...base, modelName: "veo-3", shortCost: 1000, longCost: 1000 });
    expect(result.outcome).toBe("fail");
    expect(result.nameMatchesAdaptorRule).toBe(false);
    expect(result.detail).toContain("-sec");
    expect(result.detail).toContain("禁止上架");
  });

  it("points at the adaptor when the name matches but billing is still flat", () => {
    const result = judgeDurationMultiplier({ ...base, modelName: "h3-720p-sec", shortCost: 800, longCost: 800 });
    expect(result.outcome).toBe("fail");
    expect(result.nameMatchesAdaptorRule).toBe(true);
    expect(result.detail).toContain("适配器实现");
  });

  it("tolerates rounding noise without masking the 1-vs-2 distinction", () => {
    expect(judgeDurationMultiplier({ ...base, modelName: "wan3.0-t2v", shortCost: 1000, longCost: 1900 }).outcome).toBe("pass");
    expect(judgeDurationMultiplier({ ...base, modelName: "wan3.0-t2v", shortCost: 1000, longCost: 1050 }).outcome).toBe("fail");
  });

  it("refuses to judge without cost data rather than guessing", () => {
    expect(judgeDurationMultiplier({ ...base, modelName: "veo-3", shortCost: null, longCost: 2000 }).outcome).toBe("error");
    expect(judgeDurationMultiplier({ ...base, modelName: "veo-3", shortCost: 0, longCost: 2000 }).outcome).toBe("error");
  });

  it("flags an unexplained ratio for manual review", () => {
    const result = judgeDurationMultiplier({ ...base, modelName: "veo-3", shortCost: 1000, longCost: 7000 });
    expect(result.outcome).toBe("fail");
    expect(result.detail).toContain("人工核对");
  });
});

describe("request building", () => {
  it("routes the video body through the family-specific builder", () => {
    // Wan uses `duration` + `ratio`. The previous shape sent `seconds` +
    // `aspect_ratio` to every family, which Wan rejects outright.
    const request = buildVideoRequest("wan3.0-t2v", 10);
    expect(request.path).toBe("/v1/videos");
    expect(request.body.duration).toBe(10);
    expect(request.body.ratio).toBe("16:9");
  });
  it("marks only the streaming case as a stream", () => {
    expect(buildTextRequest("streaming", "gpt-4o").stream).toBe(true);
    expect(buildTextRequest("basic_text", "gpt-4o").stream).toBe(false);
  });
  it("builds a long-context probe large enough to be meaningful", () => {
    const request = buildTextRequest("long_context", "gpt-4o");
    const content = (request.body.messages as Array<{ content: string }>)[0].content;
    expect(content.length).toBeGreaterThan(100_000);
  });
});
