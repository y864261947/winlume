/**
 * Model capability probe — shared types.
 *
 * The probe answers two questions per model:
 *   1. Which capabilities actually work on this channel (not what the docs claim).
 *   2. What the call really consumed (tokens / quota), so cost can be derived
 *      from observation instead of a guessed multiplier.
 *
 * Everything here is transport-agnostic and pure so it can be unit-tested
 * without a network.
 */

/** A probe result is never a bare boolean: "unsupported" and "broken" differ. */
export type ProbeOutcome =
  /** The capability demonstrably worked. */
  | "pass"
  /** The endpoint answered, but the capability is absent or wrong. */
  | "fail"
  /** Not applicable to this model kind (e.g. vision on an embedding model). */
  | "skip"
  /** Transport/auth/rate-limit problem — says nothing about the model. */
  | "error";

export type ProbeTier = "smoke" | "standard" | "full";

export type ModelKind = "text" | "image" | "video";

/** Upstream channel under test. `kind` decides how cost is attributed. */
export type ProbeChannel = {
  name: string;
  baseUrl: string;
  apiKey: string;
  /**
   * "new-api" additionally exposes X-Oneapi-Request-Id + /api/log/self, which
   * gives exact per-call quota. "openai" only yields the `usage` block.
   */
  kind: "openai" | "new-api";
  /** Optional explicit model allowlist; otherwise discovered via /v1/models. */
  models?: string[];
  /** PAT for /api/log/self cost lookup. Only meaningful when kind=new-api. */
  logToken?: string;
};

export type ProbeConfig = {
  channels: ProbeChannel[];
};

/** Raw token accounting as reported by the upstream response. */
export type ObservedUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

/**
 * Cost actually charged for one call.
 * `quota`/`credits` are only available on new-api channels; a direct vendor
 * channel leaves them null rather than pretending to know the price.
 */
export type ObservedCost = {
  requestId: string | null;
  quota: number | null;
  credits: number | null;
  /** Why cost is missing, when it is. Never silently blank. */
  unavailableReason: string | null;
};

export type ProbeCaseResult = {
  id: string;
  outcome: ProbeOutcome;
  /** Human-readable justification — required for every non-pass outcome. */
  detail: string;
  latencyMs: number;
  usage: ObservedUsage | null;
  cost: ObservedCost | null;
};

export type ModelProbeReport = {
  channel: string;
  model: string;
  kind: ModelKind;
  probedAt: string;
  tier: ProbeTier;
  cases: ProbeCaseResult[];
  /** Per-second billing verification; only for video models. */
  durationMultiplier: DurationMultiplierResult | null;
};

/**
 * Result of the 5s-vs-10s duration billing check.
 *
 * new-api only injects the `seconds` quota multiplier for models whose name
 * matches the codexvideo adaptor rule (contains "-sec" or starts with
 * "wan3.0-"). A non-matching per-second model bills as 1 second while the
 * upstream charges for the full clip — silent loss with no error anywhere.
 */
export type DurationMultiplierResult = {
  outcome: ProbeOutcome;
  shortSeconds: number;
  longSeconds: number;
  shortCost: number | null;
  longCost: number | null;
  /** longCost / shortCost. ~2 means the multiplier applied; ~1 means it did not. */
  ratio: number | null;
  /** True when the model name matches new-api's duration-recognition rule. */
  nameMatchesAdaptorRule: boolean;
  detail: string;
};
