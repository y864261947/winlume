/**
 * Draft a SKU catalog from the live relay plus upstream pricing.
 *
 * Output is a PROPOSAL. Every binding lands with equivalenceConfirmed=false,
 * because only a human who has seen both models' output can assert they are
 * interchangeable. The tool's job is to do the tedious part — grouping,
 * costing, finding the crossover — not to decide product equivalence.
 */

import { writeFileSync } from "node:fs";
import { deriveCost, type PricingPayload } from "../src/lib/probe/pricing-pull";
import { classifyModel } from "../src/lib/probe/classify";
import type { Sku, SkuBinding, SkuCatalog, BindingCost, QualityTier } from "../src/lib/probe/sku-catalog";
import { billingCrossover, validateCatalog } from "../src/lib/probe/sku-catalog";

const UPSTREAMS: Record<string, string> = {
  yunfei: "https://img.yunfei.best",
  "22codex": "https://app.22codex.xyz",
  kacang: "https://newapi.prompt-hubs.com",
};

/**
 * Decompose an upstream model name into family + customer-visible options.
 *
 * Each rule is written against names observed on the relay, not invented.
 */
type Parsed = {
  family: string;
  resolution?: string;
  quality: QualityTier;
  upscale: boolean;
  perSecond: boolean;
};

function parseModelName(raw: string): Parsed {
  const name = raw.replace(/^\[[^\]]*\]/, "").trim();
  const lower = name.toLowerCase();

  // `-nf` = 不超分 (no upscale): a picture-quality axis, which is why
  // `-sec` and `-sec-nf` share a price.
  const upscale = !/-nf$/i.test(lower);
  const perSecond = /-sec(-nf)?$/i.test(lower);

  let rest = lower.replace(/-nf$/i, "").replace(/-sec$/i, "");

  let resolution: string | undefined;
  const resMatch = rest.match(/(\d+p|\d+k)(?:-|$)/);
  if (resMatch) {
    resolution = resMatch[1];
    rest = rest.replace(resMatch[1], "").replace(/--+/g, "-").replace(/-$/, "");
  }

  let quality: QualityTier = "standard";
  if (/\b(pro|prime|quality|high|premium)\b/.test(rest)) quality = "premium";
  else if (/\b(fast|lite|mini|flash|draft|low)\b/.test(rest)) quality = "draft";
  rest = rest.replace(/-?(pro|prime|quality|high|premium|fast|lite|mini|flash|draft|low)\b/g, "");

  const family = rest.replace(/-+$/, "").replace(/^-+/, "") || lower;
  return { family, resolution, quality, upscale, perSecond };
}

/** Stable, human-readable SKU id. */
function skuId(modality: string, family: string, parsed: Parsed): string {
  const parts = [modality, family.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")];
  if (parsed.resolution) parts.push(parsed.resolution);
  if (parsed.quality !== "standard") parts.push(parsed.quality);
  // Upscale is deliberately NOT part of the id. `-nf` costs the same as the
  // upscaled variant, so it is a request-time flag on one product rather
  // than a separate thing to sell — folding it in would double the catalog
  // for no commercial difference.
  return parts.join(".").toLowerCase();
}

function displayName(modality: string, family: string, parsed: Parsed): string {
  const m = modality === "video" ? "视频" : "图片";
  const q = parsed.quality === "premium" ? "高品质" : parsed.quality === "draft" ? "快速" : "标准";
  const bits = [`${m}·${family.toUpperCase()}`];
  if (parsed.resolution) bits.push(parsed.resolution);
  bits.push(q);
  return bits.join("·");
}

async function main(): Promise<void> {
  const relayPath = process.argv.includes("--relay")
    ? process.argv[process.argv.indexOf("--relay") + 1]
    : "relay-models.json";
  const outPath = process.argv.includes("--out")
    ? process.argv[process.argv.indexOf("--out") + 1]
    : "sku-catalog.draft.json";
  const markup = process.argv.includes("--markup")
    ? Number(process.argv[process.argv.indexOf("--markup") + 1])
    : 1.5;

  const { readFileSync } = await import("node:fs");
  const relay: Record<string, Array<{ name: string; priority: number }>> = JSON.parse(
    readFileSync(relayPath, "utf8"),
  );

  // Cost lookup keyed by normalized model name.
  const norm = (s: string) => s.replace(/^\[[^\]]*\]/, "").toLowerCase().replace(/[-_.]/g, "");
  const costIndex = new Map<string, Array<{ channel: string; unit: BindingCost["unit"]; amount: number; blocked: boolean; note: string }>>();

  for (const [channel, base] of Object.entries(UPSTREAMS)) {
    const res = await fetch(`${base}/api/pricing`, { signal: AbortSignal.timeout(30_000) });
    const payload = (await res.json()) as PricingPayload;
    for (const row of payload.data ?? []) {
      if (!row.model_name) continue;
      const derived = deriveCost({
        row,
        channel,
        groupRatio: payload.group_ratio ?? {},
        policy: "lowest",
      });
      if (!derived || derived.cost <= 0) continue;
      const key = norm(row.model_name);
      const list = costIndex.get(key) ?? [];
      list.push({
        channel,
        unit: derived.unit,
        amount: derived.cost,
        blocked: derived.warnings.some((w) => w.severity === "block"),
        note: derived.explanation,
      });
      costIndex.set(key, list);
    }
  }

  // Group relay models into SKUs.
  const groups = new Map<string, { parsed: Parsed; modality: string; members: string[] }>();
  for (const relayModel of Object.keys(relay)) {
    const modality = classifyModel({ model_name: relayModel.replace(/^\[[^\]]*\]/, "") }).category;
    if (modality !== "image" && modality !== "video") continue;
    const parsed = parseModelName(relayModel);
    const id = skuId(modality, parsed.family, parsed);
    const entry = groups.get(id) ?? { parsed, modality, members: [] };
    entry.members.push(relayModel);
    groups.set(id, entry);
  }

  const skus: Sku[] = [];
  for (const [id, group] of [...groups.entries()].sort()) {
    const bindingMap = new Map<string, SkuBinding>();

    for (const member of group.members) {
      const relayChannels = relay[member] ?? [];
      const costs = costIndex.get(norm(member)) ?? [];
      for (const cost of costs) {
        // One binding per (upstream channel, upstream model); a model that
        // exists per-call AND per-second contributes two costs to the same
        // binding so the router can pick.
        const bindKey = `${cost.channel}|${member}`;
        const existing = bindingMap.get(bindKey);
        const priority = relayChannels.length > 0
          ? Math.max(...relayChannels.map((c) => c.priority))
          : 0;
        if (existing) {
          if (!existing.costs.some((c) => c.unit === cost.unit && c.amount === cost.amount)) {
            existing.costs.push({ unit: cost.unit, amount: cost.amount });
          }
        } else {
          bindingMap.set(bindKey, {
            channel: cost.channel,
            upstreamModel: member,
            priority,
            costs: [{ unit: cost.unit, amount: cost.amount }],
            equivalenceConfirmed: false,
            upscale: parseModelName(member).upscale,
            note: cost.blocked ? `⚠️ 上游定价异常，已拦截：${cost.note}` : cost.note,
          });
        }
      }
    }

    // Merge per-call and per-second variants of the SAME family+resolution
    // into one binding set: billing mode is a routing decision, not a SKU.
    const bindings = [...bindingMap.values()].sort((a, b) => b.priority - a.priority);
    if (bindings.length === 0) continue;

    skus.push({
      id,
      displayName: displayName(group.modality, group.parsed.family, group.parsed),
      modality: group.modality as "image" | "video",
      family: group.parsed.family,
      options: {
        resolution: group.parsed.resolution,
        quality: group.parsed.quality,
      },
      bindings,
      markup,
    });
  }

  const catalog: SkuCatalog = { version: new Date().toISOString().slice(0, 10), skus };
  writeFileSync(outPath, JSON.stringify(catalog, null, 2), "utf8");

  // Report.
  console.log(`\n从 ${Object.keys(relay).length} 个 relay 模型中，归出 ${skus.length} 个编目：\n`);
  const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - [...s].reduce((w, c) => w + (c.charCodeAt(0) > 255 ? 2 : 1), 0)));
  console.log(pad("编目 id", 34) + pad("对外名称", 30) + pad("绑定", 6) + "成本区间");
  console.log("-".repeat(96));
  for (const sku of skus) {
    const amounts = sku.bindings.flatMap((b) => b.costs.map((c) => `${c.amount.toFixed(4)}${c.unit === "per_second" ? "/s" : "/次"}`));
    const uniq = [...new Set(amounts)];
    console.log(pad(sku.id, 34) + pad(sku.displayName, 30) + pad(String(sku.bindings.length), 6) + uniq.slice(0, 4).join("  "));
    const cross = sku.bindings.map(billingCrossover).filter((c): c is number => c !== null);
    if (cross.length > 0) {
      console.log(`${" ".repeat(34)}↳ 计费拐点：${cross.map((c) => c.toFixed(1) + "s").join(", ")}（短于此按秒便宜，长于此按次便宜）`);
    }
  }

  const issues = validateCatalog(catalog);
  const errors = issues.filter((i) => i.severity === "error");
  const warns = issues.filter((i) => i.severity === "warn");
  console.log(`\n校验：${errors.length} 个错误，${warns.length} 个提醒`);
  for (const issue of errors.slice(0, 12)) console.log(`  ❌ ${issue.skuId}: ${issue.message}`);
  for (const issue of warns.slice(0, 12)) console.log(`  ⚠️  ${issue.skuId}: ${issue.message}`);

  console.log(`\n📄 草案已写入 ${outPath}`);
  console.log(`   所有绑定的 equivalenceConfirmed 均为 false —— 你确认哪些模型真的能互相替代后改为 true，它们才会进入路由。`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
