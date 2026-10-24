/**
 * Video model families and their request shapes.
 *
 * The three upstreams in use (小安 22codex, 云飞, 卡藏) all expose
 * `POST /v1/videos`, but the request bodies are NOT interchangeable. 小安's own
 * docs warn explicitly: "请求字段不要跨家族照搬". Sending the wrong shape yields
 * an upstream rejection that looks exactly like "model unsupported", which
 * would poison onboarding decisions.
 *
 * Field differences that actually matter:
 *   H3    → images[] + audios[],        aspect_ratio, duration 1-15
 *   Wan   → media[] with per-item type, **ratio** (not aspect_ratio), 3-30
 *   Grok  → image: {url} single object, aspect_ratio, duration 1-15
 *   veo   → image_urls[],               aspect_ratio, duration ∈ {4,6,8}
 */

export type VideoFamily = "h3" | "wan" | "grok" | "veo" | "unknown";

export function inferVideoFamily(modelName: string): VideoFamily {
  const name = modelName.trim().toLowerCase();
  if (name.startsWith("minimaxh3") || name.startsWith("minimax-h3") || name.startsWith("minimax_h3")) {
    return "h3";
  }
  if (name.startsWith("wan3.0-") || name.startsWith("wan3-")) return "wan";
  if (name.startsWith("grok-imagine-video")) return "grok";
  if (name.startsWith("veo-")) return "veo";
  return "unknown";
}

/** Legal duration values per family, from each provider's documentation. */
export type DurationRule =
  | { kind: "range"; min: number; max: number }
  | { kind: "enum"; values: number[] };

const DURATION_RULES: Record<VideoFamily, DurationRule> = {
  h3: { kind: "range", min: 1, max: 15 },
  wan: { kind: "range", min: 3, max: 30 },
  grok: { kind: "range", min: 1, max: 15 },
  // 云飞 veo accepts only these three; anything else fails upstream.
  veo: { kind: "enum", values: [4, 6, 8] },
  unknown: { kind: "range", min: 1, max: 15 },
};

export function durationRuleFor(family: VideoFamily): DurationRule {
  return DURATION_RULES[family];
}

export function isLegalDuration(family: VideoFamily, seconds: number): boolean {
  const rule = DURATION_RULES[family];
  if (!Number.isInteger(seconds)) return false;
  return rule.kind === "enum"
    ? rule.values.includes(seconds)
    : seconds >= rule.min && seconds <= rule.max;
}

/**
 * Pick two legal durations for the per-second billing check.
 *
 * Returns the smallest legal value and, preferably, its exact double so the
 * expected cost ratio is a clean 2.0. Falls back to the widest legal spread
 * when no exact double exists. Returns null when the family cannot express
 * two distinct durations at all.
 */
export function durationCheckPair(
  family: VideoFamily,
): { short: number; long: number } | null {
  const rule = DURATION_RULES[family];
  if (rule.kind === "enum") {
    const values = [...rule.values].sort((a, b) => a - b);
    if (values.length < 2) return null;
    const short = values[0];
    const exactDouble = values.find((value) => value === short * 2);
    return { short, long: exactDouble ?? values[values.length - 1] };
  }
  const short = rule.min;
  const long = short * 2;
  if (long <= rule.max) return { short, long };
  return short < rule.max ? { short, long: rule.max } : null;
}

/**
 * Build a family-correct video request body.
 *
 * `imageUrl` is optional; when absent every family degrades to text-to-video,
 * which is the cheapest and most broadly supported probe.
 */
export function buildVideoBody(input: {
  model: string;
  prompt: string;
  seconds: number;
  family?: VideoFamily;
  aspectRatio?: string;
  resolution?: string;
  imageUrl?: string;
}): Record<string, unknown> {
  const family = input.family ?? inferVideoFamily(input.model);
  const aspectRatio = input.aspectRatio ?? "16:9";

  switch (family) {
    case "h3":
      return {
        model: input.model,
        prompt: input.prompt,
        duration: input.seconds,
        aspect_ratio: aspectRatio,
        ...(input.imageUrl ? { images: [input.imageUrl] } : {}),
      };

    case "wan":
      return {
        model: input.model,
        prompt: input.prompt,
        duration: input.seconds,
        // Wan uses `ratio`, not `aspect_ratio`.
        ratio: aspectRatio,
        resolution: input.resolution ?? "720P",
        ...(input.imageUrl
          ? { media: [{ type: "first_frame", url: input.imageUrl }] }
          : {}),
      };

    case "grok":
      return {
        model: input.model,
        prompt: input.prompt,
        duration: input.seconds,
        aspect_ratio: aspectRatio,
        resolution: (input.resolution ?? "720p").toLowerCase(),
        ...(input.imageUrl ? { image: { url: input.imageUrl } } : {}),
      };

    case "veo":
      return {
        model: input.model,
        prompt: input.prompt,
        duration: input.seconds,
        aspect_ratio: aspectRatio,
        ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
      };

    default:
      // Unknown family: send the most widely accepted shape and mark it in the
      // report rather than guessing a vendor-specific field name.
      return {
        model: input.model,
        prompt: input.prompt,
        duration: input.seconds,
        seconds: String(input.seconds),
        aspect_ratio: aspectRatio,
      };
  }
}

/** Task id from an async submission; providers disagree on the field name. */
export function extractTaskId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const candidates = [root.task_id, root.id, root.request_id];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number") return String(candidate);
  }
  const data = root.data;
  if (data && typeof data === "object") return extractTaskId(data);
  return null;
}

/**
 * Normalize provider task status into the four public states.
 * 卡藏 adds `submitted`; Grok upstream uses `pending`/`processing`/`done`.
 */
export function normalizeTaskStatus(raw: unknown): "queued" | "in_progress" | "completed" | "failed" | "unknown" {
  if (typeof raw !== "string") return "unknown";
  const value = raw.trim().toLowerCase();
  if (["queued", "submitted", "pending"].includes(value)) return "queued";
  if (["in_progress", "processing", "running"].includes(value)) return "in_progress";
  if (["completed", "done", "success", "succeeded"].includes(value)) return "completed";
  if (["failed", "error", "cancelled", "canceled", "expired"].includes(value)) return "failed";
  return "unknown";
}
