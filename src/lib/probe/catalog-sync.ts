/**
 * Keep Reizo's model catalog honest against what the relay actually serves.
 *
 * ## The drift this exists to catch
 *
 * Reizo sources models from three independent places:
 *
 *   1. `GET {gateway}/v1/models` — live, self-syncing, always correct.
 *   2. `FALLBACK_MODELS` in the plaza route — hand-written in code.
 *   3. `portal_content.modelVendors` — hand-edited in the admin UI, and the
 *      allowlist that decides what the PUBLIC page shows.
 *
 * Only (1) syncs itself. (2) and (3) are snapshots of an intent someone had
 * once, and they rot silently: nothing fails, the wrong list just gets
 * served. Measured on 2026-09-19, 49 of the 53 hard-coded names did not
 * exist on the relay at all.
 *
 * Two distinct failure shapes, and they are not symmetric:
 *
 *   ghost   — listed to customers, not actually servable. Worst case: a
 *             customer picks it and the request fails.
 *   missing — servable and paid for, but never shown. Pure lost revenue,
 *             and invisible because nothing errors.
 *
 * Pure module: callers supply both lists. No I/O, no clock.
 */

import { classifyModel, type ModelCategory } from "./classify";

/** One model as the relay reports it. */
export type RelayModel = {
  name: string;
  /** Enabled channels serving it. Zero means only disabled channels have it. */
  channelCount: number;
  /** new-api groups it belongs to. */
  groups: string[];
};

/** One model as some Reizo source lists it. */
export type CatalogEntry = {
  name: string;
  /** Which Reizo source this came from. */
  source: "fallback" | "portal" | "live";
};

/**
 * Compare names the way an operator would.
 *
 * new-api prefixes display tags like `[官逆]` / `[福利]` onto the model name,
 * and the relay mixes `-` `.` `_` freely (`claude-opus-4-6` vs
 * `claude-opus-4.6`). Comparing raw strings reports drift that is not real.
 */
export function normalizeModelName(name: string): string {
  return name
    .replace(/^\[[^\]]*\]/, "")
    .trim()
    .toLowerCase()
    .replace(/[-_.\s]/g, "");
}

export type DriftKind = "ghost" | "missing" | "disabled_only" | "single_channel";

export type DriftFinding = {
  kind: DriftKind;
  model: string;
  category: ModelCategory;
  severity: "error" | "warn" | "info";
  message: string;
  /** Where a ghost entry is configured, so it can be removed. */
  source?: CatalogEntry["source"];
};

export type CatalogDiff = {
  /** Listed by Reizo but not servable by any enabled relay channel. */
  ghosts: DriftFinding[];
  /** Servable but absent from the given Reizo source. */
  missing: DriftFinding[];
  /** Servable only through disabled channels — enable one or delist. */
  disabledOnly: DriftFinding[];
  /** Servable through exactly one channel; no failover. */
  singleChannel: DriftFinding[];
  /** Present in both, correctly. */
  matched: string[];
};

export type DiffInput = {
  /** Models on ENABLED relay channels. */
  relay: RelayModel[];
  /** Models reachable only through DISABLED channels. */
  disabledOnly?: string[];
  /** The Reizo-side list being audited. */
  catalog: CatalogEntry[];
  /**
   * Restrict the audit to these modalities. Text is normally excluded
   * because it is not resold here.
   */
  categories?: ModelCategory[];
};

export function diffCatalog(input: DiffInput): CatalogDiff {
  const inScope = (name: string): { ok: boolean; category: ModelCategory } => {
    const category = classifyModel({ model_name: name.replace(/^\[[^\]]*\]/, "") }).category;
    if (!input.categories) return { ok: true, category };
    return { ok: input.categories.includes(category), category };
  };

  const relayIndex = new Map(input.relay.map((m) => [normalizeModelName(m.name), m]));
  const catalogIndex = new Map(input.catalog.map((e) => [normalizeModelName(e.name), e]));

  const ghosts: DriftFinding[] = [];
  const missing: DriftFinding[] = [];
  const disabledOnly: DriftFinding[] = [];
  const singleChannel: DriftFinding[] = [];
  const matched: string[] = [];

  const disabledIndex = new Map(
    (input.disabledOnly ?? []).map((name) => [normalizeModelName(name), name]),
  );

  for (const entry of input.catalog) {
    const key = normalizeModelName(entry.name);
    const scope = inScope(entry.name);
    if (!scope.ok) continue;

    if (relayIndex.has(key)) {
      matched.push(entry.name);
      continue;
    }

    // A model served only by a disabled channel is a different problem from
    // one that was never configured: the fix is "enable the channel", not
    // "delete the listing".
    if (disabledIndex.has(key)) {
      disabledOnly.push({
        kind: "disabled_only",
        model: entry.name,
        category: scope.category,
        severity: "warn",
        source: entry.source,
        message: `${entry.name} 只存在于已停用的渠道上。要么启用渠道，要么从目录下架。`,
      });
      continue;
    }

    ghosts.push({
      kind: "ghost",
      model: entry.name,
      category: scope.category,
      severity: "error",
      source: entry.source,
      message: `${entry.name} 在目录里，但 relay 没有任何启用渠道能提供它。客户选中即失败。`,
    });
  }

  for (const model of input.relay) {
    const key = normalizeModelName(model.name);
    const scope = inScope(model.name);
    if (!scope.ok) continue;

    if (!catalogIndex.has(key)) {
      missing.push({
        kind: "missing",
        model: model.name,
        category: scope.category,
        severity: "warn",
        message: `${model.name} 已上架 ${model.channelCount} 个渠道但目录里没有，白付渠道成本。`,
      });
    }

    if (model.channelCount === 1) {
      singleChannel.push({
        kind: "single_channel",
        model: model.name,
        category: scope.category,
        severity: "info",
        message: `${model.name} 只有 1 个渠道，该渠道故障即断供（new-api 无同名渠道可转移）。`,
      });
    }
  }

  return { ghosts, missing, disabledOnly, singleChannel, matched };
}

export type DiffSummary = {
  relayTotal: number;
  catalogTotal: number;
  matched: number;
  ghosts: number;
  missing: number;
  disabledOnly: number;
  singleChannel: number;
  /** Share of relay models the catalog actually exposes, 0..1. */
  coverage: number;
};

export function summarizeDiff(diff: CatalogDiff, input: DiffInput): DiffSummary {
  const inScope = (name: string) =>
    !input.categories ||
    input.categories.includes(
      classifyModel({ model_name: name.replace(/^\[[^\]]*\]/, "") }).category,
    );

  const relayTotal = input.relay.filter((m) => inScope(m.name)).length;
  const catalogTotal = input.catalog.filter((e) => inScope(e.name)).length;
  return {
    relayTotal,
    catalogTotal,
    matched: diff.matched.length,
    ghosts: diff.ghosts.length,
    missing: diff.missing.length,
    disabledOnly: diff.disabledOnly.length,
    singleChannel: diff.singleChannel.length,
    coverage: relayTotal > 0 ? diff.matched.length / relayTotal : 1,
  };
}

/**
 * Proposed portal entries for models the catalog is missing.
 *
 * Deliberately a proposal, not an apply: publishing a model commits you to
 * serving and pricing it, and the classifier's `guessed` confidence is not
 * a good enough basis for that. Emitting JSON the admin UI accepts removes
 * the tedium without removing the decision.
 */
export type PortalProposal = {
  name: string;
  category: ModelCategory;
  endpointTypes: string[];
  /** Why this was proposed, for the human reviewing the list. */
  reason: string;
};

const ENDPOINTS_BY_CATEGORY: Record<ModelCategory, string[]> = {
  text: ["chat", "responses"],
  image: ["images"],
  video: ["video"],
  audio: ["audio"],
  unknown: ["chat"],
};

export function proposePortalEntries(diff: CatalogDiff): PortalProposal[] {
  return diff.missing.map((finding) => ({
    name: finding.model,
    category: finding.category,
    endpointTypes: ENDPOINTS_BY_CATEGORY[finding.category],
    reason: finding.message,
  }));
}

/**
 * Shape proposals into rows `normalizePortalContent` will actually keep.
 *
 * This is not cosmetic. `content-config.ts` ends its vendor branch with
 * `return name && models.length ? [...] : []` — a vendor without a `name`
 * is dropped silently, with no error and no warning. An export grouped by
 * modality (`{category, models}`) imports as ZERO vendors and looks like
 * nothing happened.
 *
 * So rows are grouped by VENDOR, matching what you would build by hand in
 * the admin UI, and every required field is populated:
 *
 *   name     — required, or the row vanishes
 *   key      — sanitized to [a-zA-Z0-9_-]; drives the brand logo lookup
 *   category — must be a PORTAL_MODEL_CATEGORIES member, else silently "llm"
 *   models   — non-empty, each with a name
 *
 * Caps mirror the normalizer (80 vendors, 40 models each) so nothing is
 * truncated on import without being reported here first.
 */
export type PortalVendorRow = {
  id: string;
  name: string;
  key: string;
  category: "llm" | "image" | "audio" | "video" | "embed" | "other";
  enabled: boolean;
  models: Array<{ name: string; endpointTypes: string[] }>;
};

const PORTAL_CATEGORY: Record<ModelCategory, PortalVendorRow["category"]> = {
  text: "llm",
  image: "image",
  video: "video",
  audio: "audio",
  unknown: "other",
};

export type VendorResolver = (modelName: string) => { key: string; name: string };

export type PortalExport = {
  rows: PortalVendorRow[];
  /** Entries dropped because a cap was hit, rather than silently truncated. */
  overflow: string[];
};

export function toPortalVendorRows(
  proposals: PortalProposal[],
  resolveVendor: VendorResolver,
): PortalExport {
  // Group by (vendor, category): one vendor can sell both image and video,
  // and the portal category is per-vendor, not per-model.
  const groups = new Map<string, PortalVendorRow>();
  const overflow: string[] = [];

  for (const proposal of proposals) {
    const vendor = resolveVendor(proposal.name);
    const category = PORTAL_CATEGORY[proposal.category];
    const key = `${vendor.key}-${category}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    const row = groups.get(key) ?? {
      id: key,
      key,
      name: `${vendor.name} · ${category}`,
      category,
      // Never auto-publish: listing a model commits you to serving it.
      enabled: false,
      models: [],
    };
    if (row.models.length >= 40) {
      overflow.push(proposal.name);
    } else {
      row.models.push({ name: proposal.name, endpointTypes: proposal.endpointTypes });
    }
    groups.set(key, row);
  }

  const rows = [...groups.values()];
  if (rows.length > 80) {
    for (const extra of rows.slice(80)) overflow.push(...extra.models.map((m) => m.name));
  }
  return { rows: rows.slice(0, 80), overflow };
}
