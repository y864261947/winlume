import type { ModelKind, ProbeTier } from "./types";

/**
 * Model-kind inference for probe routing.
 *
 * Deliberately independent from `inferVendorFromModel` in @/lib/catalog/vendors:
 * that one answers "whose brand is this", this one answers "which endpoint and
 * which case matrix". Conflating them would make a vendor rename silently
 * change probe behaviour.
 */
export function inferModelKind(modelName: string): ModelKind {
  const name = modelName.trim().toLowerCase();
  if (/(^|[-_/])(video|veo|sora|kling|wan|runway|hailuo)/.test(name) || name.includes("-video")) {
    return "video";
  }
  if (/(image|dall-e|dalle|flux|imagen|cogview|stable-diffusion|sdxl|banana|seedream)/.test(name)) {
    return "image";
  }
  return "text";
}

/**
 * new-api injects the `seconds` billing multiplier only for models matching
 * this rule (relay/channel/task/codexvideo/adaptor.go:132). Any other
 * per-second model is billed as a single second regardless of clip length.
 *
 * Mirrored here so the probe can explain a 1.0 cost ratio instead of merely
 * reporting it.
 */
export function matchesDurationAdaptorRule(modelName: string): boolean {
  const name = modelName.trim().toLowerCase();
  return name.includes("-sec") || name.startsWith("wan3.0-");
}

/** Upper bound enforced by new-api (relay/common/relay_utils.go:160). */
export const MAX_TASK_DURATION_SECONDS = 3600;

export type ProbeCaseId =
  | "basic_text"
  | "streaming"
  | "tool_call"
  | "vision"
  | "reasoning"
  | "long_context"
  | "json_mode"
  | "image_generate"
  | "image_edit"
  | "video_generate";

/**
 * Which cases run at which tier.
 *
 * `smoke` is intentionally a single cheapest call: it exists to screen a large
 * candidate list before spending real money on the full matrix.
 */
const TIER_CASES: Record<ModelKind, Record<ProbeTier, ProbeCaseId[]>> = {
  text: {
    smoke: ["basic_text"],
    standard: ["basic_text", "streaming", "tool_call", "json_mode"],
    full: ["basic_text", "streaming", "tool_call", "json_mode", "vision", "reasoning", "long_context"],
  },
  image: {
    smoke: ["image_generate"],
    standard: ["image_generate"],
    full: ["image_generate", "image_edit"],
  },
  video: {
    smoke: ["video_generate"],
    standard: ["video_generate"],
    full: ["video_generate"],
  },
};

export function casesForTier(kind: ModelKind, tier: ProbeTier): ProbeCaseId[] {
  return TIER_CASES[kind][tier];
}

/**
 * Approximate cost weight of each case, used only to warn before a large run.
 * Not a billing figure — the real number comes from observation.
 */
const CASE_WEIGHT: Record<ProbeCaseId, number> = {
  basic_text: 1,
  streaming: 1,
  json_mode: 1,
  tool_call: 2,
  vision: 3,
  reasoning: 4,
  long_context: 32,
  image_generate: 20,
  image_edit: 25,
  video_generate: 200,
};

export function estimateRunWeight(
  targets: { kind: ModelKind }[],
  tier: ProbeTier,
): number {
  return targets.reduce(
    (total, target) =>
      total + casesForTier(target.kind, tier).reduce((sum, id) => sum + CASE_WEIGHT[id], 0),
    0,
  );
}
