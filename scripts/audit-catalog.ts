/**
 * Audit Reizo's model catalog against the live relay.
 *
 * Answers three questions in one run:
 *   1. 供应商/渠道/模型 — what the relay actually serves.
 *   2. 差集 — what Reizo lists that it cannot serve, and vice versa.
 *   3. 同步 — emits portal-ready JSON for the models worth adding.
 *
 * Read-only against both new-api and Reizo. Nothing is published
 * automatically: listing a model commits you to serving and pricing it.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { Client } from "ssh2";
import {
  diffCatalog,
  proposePortalEntries,
  summarizeDiff,
  toPortalVendorRows,
  type CatalogEntry,
  type RelayModel,
} from "../src/lib/probe/catalog-sync";
import { inferVendorFromModel } from "../src/lib/catalog/vendors";
import type { ModelCategory } from "../src/lib/probe/classify";

type ChannelRow = {
  id: number;
  name: string;
  baseUrl: string;
  type: number;
  status: number;
  priority: number;
  group: string;
  models: string[];
};

function ssh(command: string): Promise<string> {
  const password = process.env.RELAY_PASS;
  if (!password) throw new Error("请设置 RELAY_PASS 环境变量。");
  return new Promise((resolve, reject) => {
    const client = new Client();
    let out = "";
    let err = "";
    client
      .on("ready", () => {
        client.exec(command, (error, stream) => {
          if (error) { client.end(); return reject(error); }
          stream
            .on("close", (code: number) => {
              client.end();
              if (code !== 0) return reject(new Error(err || `exit ${code}`));
              resolve(out);
            })
            .on("data", (d: Buffer) => (out += d))
            .stderr.on("data", (d: Buffer) => (err += d));
        });
      })
      .on("error", reject)
      .connect({
        host: process.env.RELAY_HOST ?? "15.204.82.213",
        username: process.env.RELAY_USER ?? "ubuntu",
        password,
        readyTimeout: 25_000,
      });
  });
}

const psql = (sql: string) =>
  `DSN=$(sudo -n grep -oP '(?<=SQL_DSN=).*' /etc/new-api/native.env); ` +
  `sudo -n psql "$DSN" -At -F '\u0001' -c "${sql.replace(/"/g, '\\"')}"`;

async function loadChannels(): Promise<ChannelRow[]> {
  const raw = await ssh(
    psql(
      `SELECT id, name, coalesce(base_url,''), type, status, priority, coalesce("group",''), coalesce(models,'') ` +
        `FROM channels ORDER BY status, priority DESC`,
    ),
  );
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, name, baseUrl, type, status, priority, group, models] = line.split("\u0001");
      return {
        id: Number(id),
        name,
        baseUrl,
        type: Number(type),
        status: Number(status),
        priority: Number(priority),
        group,
        models: models.split(",").map((m) => m.trim()).filter(Boolean),
      };
    });
}

/** Parse the hard-coded fallback list straight out of the route source. */
function loadFallbackCatalog(): CatalogEntry[] {
  const src = readFileSync("src/app/api/catalog/plaza/route.ts", "utf8");
  const start = src.indexOf("const FALLBACK_MODELS");
  const end = src.indexOf("function curatedModels");
  if (start < 0 || end < 0) return [];
  return [...src.slice(start, end).matchAll(/\{\s*name:\s*"([^"]+)"/g)].map((m) => ({
    name: m[1],
    source: "fallback" as const,
  }));
}

const supplierOf = (baseUrl: string): string => {
  try { return new URL(baseUrl).host; } catch { return baseUrl || "(官方端点)"; }
};

const width = (s: string) => [...s].reduce((w, c) => w + (c.charCodeAt(0) > 255 ? 2 : 1), 0);
const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - width(s)));

async function main(): Promise<void> {
  const argv = process.argv;
  const flag = (name: string) => argv.includes(name);
  const value = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);

  const categories = (value("--categories") ?? "image,video,audio")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean) as ModelCategory[];

  const channels = await loadChannels();
  const enabled = channels.filter((c) => c.status === 1);
  const disabled = channels.filter((c) => c.status !== 1);

  // Relay model inventory, with how many enabled channels serve each.
  const counts = new Map<string, { count: number; groups: Set<string> }>();
  for (const channel of enabled) {
    for (const model of channel.models) {
      const entry = counts.get(model) ?? { count: 0, groups: new Set<string>() };
      entry.count += 1;
      for (const g of channel.group.split(",").map((s) => s.trim()).filter(Boolean)) entry.groups.add(g);
      counts.set(model, entry);
    }
  }
  const relay: RelayModel[] = [...counts.entries()].map(([name, v]) => ({
    name,
    channelCount: v.count,
    groups: [...v.groups],
  }));
  const enabledNames = new Set(relay.map((m) => m.name));
  const disabledOnly = [
    ...new Set(disabled.flatMap((c) => c.models).filter((m) => !enabledNames.has(m))),
  ];

  // ---- 1. Suppliers and channels -------------------------------------
  if (!flag("--quiet")) {
    const bySupplier = new Map<string, ChannelRow[]>();
    for (const channel of enabled) {
      const key = supplierOf(channel.baseUrl);
      bySupplier.set(key, [...(bySupplier.get(key) ?? []), channel]);
    }
    console.log(`\n═══ 供应商与渠道 ═══`);
    console.log(`渠道 ${channels.length} 个：启用 ${enabled.length}，停用 ${disabled.length}；供应商 ${bySupplier.size} 家\n`);
    for (const [supplier, list] of [...bySupplier.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const models = new Set(list.flatMap((c) => c.models));
      console.log(`  ${pad(supplier, 26)} ${String(list.length).padStart(2)} 渠道  ${String(models.size).padStart(3)} 模型   ${list.map((c) => `${c.name}(p${c.priority})`).join(" ")}`);
    }
  }

  // ---- 2. Catalog diff -------------------------------------------------
  const catalog = loadFallbackCatalog();
  const diff = diffCatalog({ relay, disabledOnly, catalog, categories });
  const summary = summarizeDiff(diff, { relay, catalog, categories });

  console.log(`\n═══ 目录对账（类别：${categories.join("/")}）═══\n`);
  console.log(`  relay 可服务      ${summary.relayTotal}`);
  console.log(`  Reizo 硬编码目录  ${summary.catalogTotal}`);
  console.log(`  两边一致          ${summary.matched}   覆盖率 ${(summary.coverage * 100).toFixed(1)}%`);
  console.log(`  ❌ 幽灵条目       ${summary.ghosts}   目录里有、relay 不可服务`);
  console.log(`  ⚠️  漏挂           ${summary.missing}   relay 能卖、目录没有`);
  console.log(`  ⏸️  仅停用渠道     ${summary.disabledOnly}`);
  console.log(`  ⓘ  单渠道无备份   ${summary.singleChannel}`);

  const show = Number(value("--show") ?? 15);
  if (diff.ghosts.length > 0) {
    console.log(`\n  ❌ 幽灵条目（客户选中即失败）：`);
    for (const f of diff.ghosts.slice(0, show)) console.log(`     ${pad(f.model, 34)} [${f.category}] 来源=${f.source}`);
    if (diff.ghosts.length > show) console.log(`     …还有 ${diff.ghosts.length - show} 个`);
  }
  if (diff.missing.length > 0) {
    console.log(`\n  ⚠️  漏挂（已付渠道成本却没在卖）：`);
    for (const f of diff.missing.slice(0, show)) console.log(`     ${pad(f.model, 34)} [${f.category}]`);
    if (diff.missing.length > show) console.log(`     …还有 ${diff.missing.length - show} 个`);
  }
  if (diff.disabledOnly.length > 0) {
    console.log(`\n  ⏸️  仅停用渠道有：`);
    for (const f of diff.disabledOnly.slice(0, show)) console.log(`     ${f.model}`);
  }

  // ---- 3. Sync proposal -------------------------------------------------
  const outPath = value("--out");
  if (outPath) {
    const proposals = proposePortalEntries(diff);
    // Shaped so normalizePortalContent keeps every row: grouped by vendor
    // with a populated `name`, because a nameless vendor is dropped in
    // silence (content-config.ts: `name && models.length ? [...] : []`).
    const { rows, overflow } = toPortalVendorRows(proposals, (model) => {
      const vendor = inferVendorFromModel(model);
      return { key: vendor.key, name: vendor.name };
    });
    const payload = {
      generatedAt: new Date().toISOString(),
      note:
        "自动生成的候选清单。上架即承诺可服务且已定价，请人工确认后再导入后台。" +
        "结构已对齐 portal_content.modelVendors，可直接导入；所有 enabled 为 false。",
      modelVendors: rows,
      ghostsToRemove: diff.ghosts.map((g) => ({ name: g.model, source: g.source })),
    };
    writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
    const modelCount = rows.reduce((n, r) => n + r.models.length, 0);
    console.log(`\n📄 同步候选已写入 ${outPath}`);
    console.log(`   ${rows.length} 个 vendor / ${modelCount} 个待上架，${diff.ghosts.length} 个待下架`);
    console.log(`   所有 vendor 的 enabled 均为 false —— 人工确认后再打开。`);
    if (overflow.length > 0) {
      console.log(`   ⚠️ ${overflow.length} 个超出后台容量上限被剔除：${overflow.slice(0, 5).join(", ")}`);
    }
  } else {
    console.log(`\n提示：加 --out catalog-sync.json 可导出待上架/待下架清单。`);
  }

  // A ghost entry is customer-visible breakage, so fail CI on it.
  if (diff.ghosts.length > 0 && flag("--strict")) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
