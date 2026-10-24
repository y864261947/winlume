import type { ProbeCaseId } from "./cases";
import { matchesDurationAdaptorRule } from "./cases";
import { extractTaskId } from "./video";

import type {
  DurationMultiplierResult,
  ObservedCost,
  ObservedUsage,
  ProbeOutcome,
} from "./types";

/**
 * Judging rules for probe responses.
 *
 * Central design rule: an HTTP/transport problem is `error`, never `fail`.
 * `fail` is a statement about the MODEL; `error` is a statement about the
 * CALL. Collapsing them would make a rate-limited run look like a pile of
 * unsupported capabilities and permanently mislead onboarding decisions.
 */

export type JudgeInput = {
  /** null when the request never produced an HTTP response. */
  status: number | null;
  /** Parsed JSON body, when the response was JSON. */
  body: unknown;
  /** Concatenated streamed text, for streaming cases. */
  streamedText?: string;
  /** Number of distinct SSE delta events observed. */
  streamEvents?: number;
  transportError?: string;
};

export type Judgement = { outcome: ProbeOutcome; detail: string };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstChoiceMessage(body: unknown): Record<string, unknown> | null {
  const root = record(body);
  const choices = root?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const choice = record(choices[0]);
  return record(choice?.message);
}

function upstreamErrorMessage(body: unknown): string | null {
  const root = record(body);
  if (!root) return null;
  if (typeof root.error === "string") return root.error;
  const error = record(root.error);
  if (error && typeof error.message === "string") return error.message;
  if (typeof root.message === "string") return root.message;
  return null;
}

/**
 * Distinguish "this model cannot do it" from "this call could not be made".
 *
 * 401/403/429 and 5xx are transport-level: they say nothing about capability.
 * 400/404/422 normally mean the upstream rejected the *shape* of the request,
 * which for a capability probe is a genuine negative signal.
 */
export function classifyHttpFailure(status: number, body: unknown): Judgement {
  const message = upstreamErrorMessage(body) ?? `HTTP ${status}`;
  if (status === 401 || status === 403) {
    return { outcome: "error", detail: `认证失败（${status}）：${message}` };
  }
  if (status === 429) {
    return { outcome: "error", detail: `被限流（429）：${message}。结果不可用于能力判定。` };
  }
  if (status >= 500) {
    return { outcome: "error", detail: `上游服务错误（${status}）：${message}` };
  }
  return { outcome: "fail", detail: `上游拒绝请求（${status}）：${message}` };
}

export function judgeCase(caseId: ProbeCaseId, input: JudgeInput): Judgement {
  if (input.transportError) {
    return { outcome: "error", detail: `网络/传输失败：${input.transportError}` };
  }
  if (input.status === null) {
    return { outcome: "error", detail: "没有收到任何响应。" };
  }
  if (input.status < 200 || input.status >= 300) {
    return classifyHttpFailure(input.status, input.body);
  }

  // A 200 carrying an error envelope is still an upstream rejection.
  const embedded = upstreamErrorMessage(input.body);
  if (embedded && !firstChoiceMessage(input.body)) {
    return { outcome: "fail", detail: `响应体返回错误：${embedded}` };
  }

  switch (caseId) {
    case "basic_text":
    case "long_context": {
      const content = firstChoiceMessage(input.body)?.content;
      if (typeof content === "string" && content.trim().length > 0) {
        return { outcome: "pass", detail: `返回 ${content.trim().length} 字符` };
      }
      return { outcome: "fail", detail: "响应中没有非空 content。" };
    }

    case "streaming": {
      const events = input.streamEvents ?? 0;
      const text = input.streamedText ?? "";
      // One event is not streaming — a non-streaming upstream can emit a single
      // terminal chunk and look superficially identical.
      if (events >= 2 && text.trim().length > 0) {
        return { outcome: "pass", detail: `收到 ${events} 个增量事件` };
      }
      if (events === 1) {
        return { outcome: "fail", detail: "只收到 1 个事件，疑似非真实流式。" };
      }
      return { outcome: "fail", detail: "没有收到增量事件。" };
    }

    case "tool_call": {
      const message = firstChoiceMessage(input.body);
      const calls = message?.tool_calls;
      if (!Array.isArray(calls) || calls.length === 0) {
        return { outcome: "fail", detail: "没有返回 tool_calls。" };
      }
      const call = record(calls[0]);
      const fn = record(call?.function);
      const name = fn?.name;
      const args = fn?.arguments;
      if (typeof name !== "string" || !name) {
        return { outcome: "fail", detail: "tool_calls 缺少 function.name。" };
      }
      if (typeof args !== "string") {
        return { outcome: "fail", detail: "tool_calls.function.arguments 不是字符串。" };
      }
      try {
        JSON.parse(args);
      } catch {
        return { outcome: "fail", detail: `tool_calls 参数不是合法 JSON：${args.slice(0, 80)}` };
      }
      return { outcome: "pass", detail: `调用了 ${name}` };
    }

    case "json_mode": {
      const content = firstChoiceMessage(input.body)?.content;
      if (typeof content !== "string" || !content.trim()) {
        return { outcome: "fail", detail: "没有返回内容。" };
      }
      try {
        JSON.parse(content);
        return { outcome: "pass", detail: "返回可解析 JSON" };
      } catch {
        return { outcome: "fail", detail: `声明 json_object 但返回非 JSON：${content.slice(0, 80)}` };
      }
    }

    case "vision": {
      const content = firstChoiceMessage(input.body)?.content;
      if (typeof content === "string" && content.trim().length > 0) {
        return { outcome: "pass", detail: "接受图像输入并返回描述" };
      }
      return { outcome: "fail", detail: "图像输入未产生有效回复。" };
    }

    case "reasoning": {
      const message = firstChoiceMessage(input.body);
      const reasoning = message?.reasoning_content ?? message?.reasoning;
      if (typeof reasoning === "string" && reasoning.trim().length > 0) {
        return { outcome: "pass", detail: `返回 ${reasoning.trim().length} 字符推理内容` };
      }
      // Reasoning tokens counted but not exposed is a real, distinct state.
      const usage = record(record(input.body)?.usage);
      const details = record(usage?.completion_tokens_details);
      const reasoningTokens = details?.reasoning_tokens;
      if (typeof reasoningTokens === "number" && reasoningTokens > 0) {
        return {
          outcome: "fail",
          detail: `计费了 ${reasoningTokens} 推理 token，但未返回推理文本。`,
        };
      }
      return { outcome: "fail", detail: "没有推理内容，也没有推理 token 计数。" };
    }

    case "image_generate":
    case "image_edit": {
      const data = record(input.body)?.data;
      if (!Array.isArray(data) || data.length === 0) {
        return { outcome: "fail", detail: "images 接口没有返回数据项。" };
      }
      const item = record(data[0]);
      if (typeof item?.b64_json === "string" && item.b64_json.length > 0) {
        return { outcome: "pass", detail: `返回 ${data.length} 张 base64 图像` };
      }
      if (typeof item?.url === "string" && item.url.length > 0) {
        return { outcome: "pass", detail: `返回 ${data.length} 个图像 URL` };
      }
      return { outcome: "fail", detail: "返回项既无 b64_json 也无 url。" };
    }

    case "video_generate": {
      // Video generation is ASYNC on all three upstreams: a successful POST
      // means the task was ACCEPTED, never that a video exists. The verdict is
      // worded accordingly and the probe does not poll — 云飞 and 小安 both
      // refund failed tasks, so treating acceptance as success would record a
      // later failure as a zero-cost win.
      const taskId = extractTaskId(input.body);
      if (taskId) {
        return { outcome: "pass", detail: `已受理异步任务 ${taskId}（未轮询，不代表生成成功）` };
      }
      return { outcome: "fail", detail: "没有返回 task_id / id，无法确认任务已受理。" };
    }

  }
}

export function extractUsage(body: unknown): ObservedUsage | null {
  const usage = record(record(body)?.usage);
  if (!usage) return null;
  const num = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  return {
    promptTokens: num(usage.prompt_tokens) ?? num(usage.input_tokens),
    completionTokens: num(usage.completion_tokens) ?? num(usage.output_tokens),
    totalTokens: num(usage.total_tokens),
  };
}

/** new-api default: 500_000 quota units = 1 credit. */
export const QUOTA_PER_CREDIT = 500_000;

export function costFromLogRow(
  requestId: string | null,
  row: { quota?: number } | null,
): ObservedCost {
  if (!requestId) {
    return {
      requestId: null,
      quota: null,
      credits: null,
      unavailableReason: "上游未返回 X-Oneapi-Request-Id（非 new-api 渠道）。",
    };
  }
  if (!row || typeof row.quota !== "number" || !Number.isFinite(row.quota)) {
    return {
      requestId,
      quota: null,
      credits: null,
      unavailableReason: "日志中尚未出现该 request_id 的扣费记录。",
    };
  }
  return {
    requestId,
    quota: row.quota,
    credits: row.quota / QUOTA_PER_CREDIT,
    unavailableReason: null,
  };
}

/**
 * Verdict on whether the per-second billing multiplier actually applied.
 *
 * This is the single highest-value check in the probe: a model that bills a
 * 10-second clip as 1 second loses money on every call, reports no error, and
 * looks perfectly healthy in the usage log.
 */
export function judgeDurationMultiplier(input: {
  modelName: string;
  shortSeconds: number;
  longSeconds: number;
  shortCost: number | null;
  longCost: number | null;
}): DurationMultiplierResult {
  const nameMatchesAdaptorRule = matchesDurationAdaptorRule(input.modelName);
  const base = {
    shortSeconds: input.shortSeconds,
    longSeconds: input.longSeconds,
    shortCost: input.shortCost,
    longCost: input.longCost,
    nameMatchesAdaptorRule,
  };

  if (input.shortCost === null || input.longCost === null) {
    return {
      ...base,
      ratio: null,
      outcome: "error",
      detail: "缺少扣费数据，无法判定时长乘数是否生效。",
    };
  }
  if (input.shortCost <= 0) {
    return {
      ...base,
      ratio: null,
      outcome: "error",
      detail: "短时长调用扣费为 0，无法计算比值。",
    };
  }

  const ratio = input.longCost / input.shortCost;
  const expected = input.longSeconds / input.shortSeconds;
  // 15% tolerance absorbs rounding and group-ratio noise without masking the
  // 1.0-vs-2.0 distinction this check exists to catch.
  const tolerance = 0.15;

  if (Math.abs(ratio - expected) <= expected * tolerance) {
    return {
      ...base,
      ratio,
      outcome: "pass",
      detail: `扣费比值 ${ratio.toFixed(2)} ≈ 时长比 ${expected.toFixed(2)}，时长乘数已生效。`,
    };
  }

  if (Math.abs(ratio - 1) <= tolerance) {
    const reason = nameMatchesAdaptorRule
      ? "模型名符合适配器规则，但乘数仍未生效，需检查该渠道的适配器实现。"
      : "模型名不含 \"-sec\" 且不以 \"wan3.0-\" 开头，不匹配 new-api 视频适配器的时长识别规则。";
    return {
      ...base,
      ratio,
      outcome: "fail",
      detail: `扣费比值 ${ratio.toFixed(2)} ≈ 1，时长乘数未生效：${reason}按 ${input.longSeconds} 秒生成只会收取 1 秒费用，禁止上架。`,
    };
  }

  return {
    ...base,
    ratio,
    outcome: "fail",
    detail: `扣费比值 ${ratio.toFixed(2)} 既不接近时长比 ${expected.toFixed(2)} 也不接近 1，计价规则异常，需人工核对。`,
  };
}
