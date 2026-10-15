import { describe, expect, it } from "vitest";
import {
  diffCatalog,
  normalizeModelName,
  proposePortalEntries,
  summarizeDiff,
  toPortalVendorRows,
  type CatalogEntry,
  type RelayModel,
} from "./catalog-sync";
import { normalizePortalContent } from "../portal/content-config";
import { inferVendorFromModel } from "../catalog/vendors";


const relay = (name: string, channelCount = 2): RelayModel => ({ name, channelCount, groups: ["视频分组"] });
const entry = (name: string, source: CatalogEntry["source"] = "fallback"): CatalogEntry => ({ name, source });

describe("name normalization matches operator intuition", () => {
  // new-api prefixes display tags onto the model name; comparing raw
  // strings would report drift that is not real.
  it("strips new-api display tags", () => {
    expect(normalizeModelName("[官逆]gemini-3.7-flash")).toBe(normalizeModelName("gemini-3.7-flash"));
    expect(normalizeModelName("[福利]gemini-3.8-flash")).toBe("gemini38flash");
  });

  it("treats separator spelling as equivalent", () => {
    expect(normalizeModelName("claude-opus-4-6")).toBe(normalizeModelName("claude.opus.4.6"));
    expect(normalizeModelName("MiniMaxH3-720p")).toBe(normalizeModelName("minimaxh3_720p"));
  });

  it("still distinguishes genuinely different models", () => {
    expect(normalizeModelName("gpt-image-2")).not.toBe(normalizeModelName("gpt-image-2.5"));
  });
});

describe("the two drift shapes are not symmetric", () => {
  // A ghost is customer-visible breakage; a missing model is silent lost
  // revenue. Conflating them would hide the urgent one.
  it("flags a catalog entry the relay cannot serve as an error", () => {
    const diff = diffCatalog({ relay: [relay("gpt-image-2")], catalog: [entry("dall-e-3")] });
    expect(diff.ghosts).toHaveLength(1);
    expect(diff.ghosts[0].severity).toBe("error");
    expect(diff.ghosts[0].source).toBe("fallback");
    expect(diff.ghosts[0].message).toContain("客户选中即失败");
  });

  it("flags a servable model absent from the catalog as a warning", () => {
    const diff = diffCatalog({ relay: [relay("gpt-image-2")], catalog: [] });
    expect(diff.missing).toHaveLength(1);
    expect(diff.missing[0].severity).toBe("warn");
    expect(diff.missing[0].message).toContain("白付渠道成本");
  });

  // "Enable the channel" and "delete the listing" are different fixes.
  it("separates disabled-only models from true ghosts", () => {
    const diff = diffCatalog({
      relay: [relay("gpt-image-2")],
      disabledOnly: ["nano-banana-pro"],
      catalog: [entry("nano-banana-pro"), entry("dall-e-3")],
    });
    expect(diff.disabledOnly.map((f) => f.model)).toEqual(["nano-banana-pro"]);
    expect(diff.ghosts.map((f) => f.model)).toEqual(["dall-e-3"]);
    expect(diff.disabledOnly[0].message).toContain("启用渠道");
  });

  it("matches equivalent names across tag and separator differences", () => {
    const diff = diffCatalog({
      relay: [relay("[福利]gemini-3.8-flash")],
      catalog: [entry("gemini-3.8-flash")],
      categories: undefined,
    });
    expect(diff.matched).toHaveLength(1);
    expect(diff.ghosts).toHaveLength(0);
  });
});

describe("single-channel supply", () => {
  // new-api can only fail over between channels serving the SAME name, so
  // one channel means no failover at all.
  it("reports a model with exactly one channel", () => {
    const diff = diffCatalog({ relay: [relay("wan3.0-video", 1)], catalog: [entry("wan3.0-video")] });
    expect(diff.singleChannel).toHaveLength(1);
    expect(diff.singleChannel[0].severity).toBe("info");
  });

  it("does not report a model with failover", () => {
    const diff = diffCatalog({ relay: [relay("gpt-image-2.5", 3)], catalog: [entry("gpt-image-2.5")] });
    expect(diff.singleChannel).toHaveLength(0);
  });
});

describe("category scoping", () => {
  // Text is not resold here; auditing it would bury the 20 models that matter.
  it("ignores models outside the requested categories", () => {
    const diff = diffCatalog({
      relay: [relay("gpt-image-2"), relay("claude-opus-4-6")],
      catalog: [entry("claude-sonnet-5")],
      categories: ["image", "video"],
    });
    expect(diff.missing.map((f) => f.model)).toEqual(["gpt-image-2"]);
    expect(diff.ghosts).toHaveLength(0);
  });
});

describe("summary", () => {
  it("computes coverage against in-scope relay models only", () => {
    const input = {
      relay: [relay("gpt-image-2"), relay("gpt-image-2.5"), relay("claude-opus-4-6")],
      catalog: [entry("gpt-image-2")],
      categories: ["image" as const],
    };
    const summary = summarizeDiff(diffCatalog(input), input);
    expect(summary.relayTotal).toBe(2);
    expect(summary.matched).toBe(1);
    expect(summary.coverage).toBeCloseTo(0.5, 10);
  });

  it("reports full coverage rather than dividing by zero", () => {
    const input = { relay: [], catalog: [] };
    expect(summarizeDiff(diffCatalog(input), input).coverage).toBe(1);
  });
});

describe("sync proposals", () => {
  it("proposes endpoint types matching each modality", () => {
    const diff = diffCatalog({
      relay: [relay("gpt-image-2"), relay("wan3.0-video")],
      catalog: [],
      categories: ["image", "video"],
    });
    const proposals = proposePortalEntries(diff);
    expect(proposals.find((p) => p.name === "gpt-image-2")?.endpointTypes).toEqual(["images"]);
    expect(proposals.find((p) => p.name === "wan3.0-video")?.endpointTypes).toEqual(["video"]);
  });

  it("proposes nothing when the catalog already covers the relay", () => {
    const diff = diffCatalog({ relay: [relay("gpt-image-2")], catalog: [entry("gpt-image-2")] });
    expect(proposePortalEntries(diff)).toHaveLength(0);
  });
});

describe("export must survive the real portal normalizer", () => {
  const resolve = (model: string) => {
    const v = inferVendorFromModel(model);
    return { key: v.key, name: v.name };
  };
  const proposalsFor = (models: string[]) =>
    proposePortalEntries(
      diffCatalog({ relay: models.map((m) => relay(m)), catalog: [], categories: ["image", "video"] }),
    );

  // The bug this locks down: an export grouped by modality has no `name`,
  // and content-config drops a nameless vendor SILENTLY — zero rows import,
  // no error raised. Round-tripping through the real normalizer is the only
  // check that catches it.
  it("round-trips through normalizePortalContent with zero loss", () => {
    const { rows } = toPortalVendorRows(
      proposalsFor(["gpt-image-2", "gpt-image-2.5", "MiniMaxH3-720p", "wan3.0-video"]),
      resolve,
    );
    const exported = rows.reduce((n, r) => n + r.models.length, 0);
    expect(exported).toBe(4);

    const normalized = normalizePortalContent({ modelVendors: rows });
    expect(normalized.modelVendors).toHaveLength(rows.length);
    expect(normalized.modelVendors.reduce((n, v) => n + v.models.length, 0)).toBe(exported);
  });

  it("populates every field the normalizer requires", () => {
    const { rows } = toPortalVendorRows(proposalsFor(["gpt-image-2"]), resolve);
    for (const row of rows) {
      expect(row.name).not.toBe("");
      expect(row.models.length).toBeGreaterThan(0);
      expect(row.key).toMatch(/^[a-zA-Z0-9_-]+$/);
    }
  });

  // An unrecognized category silently becomes "llm", which would file a
  // video model under text.
  it("emits only categories the portal recognizes", () => {
    const { rows } = toPortalVendorRows(proposalsFor(["gpt-image-2", "MiniMaxH3-720p"]), resolve);
    const normalized = normalizePortalContent({ modelVendors: rows });
    expect(normalized.modelVendors.map((v) => v.category).sort()).toEqual(["image", "video"]);
  });

  // Publishing is a commitment to serve and price; never automatic.
  it("never marks a proposed vendor as enabled", () => {
    const { rows } = toPortalVendorRows(proposalsFor(["gpt-image-2", "wan3.0-video"]), resolve);
    expect(rows.every((r) => r.enabled === false)).toBe(true);
    expect(normalizePortalContent({ modelVendors: rows }).modelVendors.every((v) => !v.enabled)).toBe(true);
  });

  it("splits one vendor across its modalities", () => {
    const { rows } = toPortalVendorRows(
      proposalsFor(["gpt-image-2", "grok-imagine-video"]),
      () => ({ key: "acme", name: "Acme" }),
    );
    expect(rows.map((r) => r.category).sort()).toEqual(["image", "video"]);
  });

  // The normalizer truncates at 40 models per vendor; report it rather than
  // let rows disappear on import.
  it("reports overflow instead of silently truncating", () => {
    const many = Array.from({ length: 45 }, (_, i) => `gpt-image-${i}`);
    const { rows, overflow } = toPortalVendorRows(proposalsFor(many), () => ({ key: "acme", name: "Acme" }));
    expect(rows[0].models).toHaveLength(40);
    expect(overflow).toHaveLength(5);
  });
});
