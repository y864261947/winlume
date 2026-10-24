/**
 * Model cost ledger CLI — manual cost entry for upstream models.
 *
 * The three upstreams in use publish prices on documentation pages, not
 * through an API, so cost is entered by hand here and stored as a JSON ledger.
 * Every entry records its effective date, so a price change never silently
 * rewrites historical margin.
 *
 * Usage:
 *   npm run cost -- set --model veo-3.1 --channel yunfei --unit per_second --cost 0.40
 *   npm run cost -- set --model MiniMaxH3-720p --channel 22codex --unit per_call --cost 0.25
 *   npm run cost -- set --model gpt-5.6 --channel kacang --unit token --input 1.25 --output 10
 *   npm run cost -- list
 *   npm run cost -- markup --default 1.5 --vendor openai=1.6 --model veo-3.1=1.25
 *   npm run cost -- report --price veo-3.1=0.60
 *
 * Ledger file: ./model-costs.json (gitignored — it is commercial data).
 */

import { readFile, writeFile } from "node:fs/promises";
import {
  DEFAULT_MARKUP_POLICY,
  marginVerdict,
  resolveCost,
  resolveMarkup,
  suggestedPrice,
  validateCostEntry,
  type CostEntry,
  type CostUnit,
  type MarkupPolicy,
} from "../src/lib/probe/cost-ledger";
import {
  deriveCost,
  isAcceptable,
  toCostEntry,
  type CostDerivation,
  type GroupPolicy,
  type PricingPayload,
} from "../src/lib/probe/pricing-pull";
import { renderReport, type ReportChannel } from "../src/lib/probe/cost-report-html";



const LEDGER_PATH = "./model-costs.json";

type Ledger = {
  entries: CostEntry[];
  markup: MarkupPolicy;
  /** Model name → vendor key, used to resolve per-vendor markup. */
  vendors?: Record<string, string>;
};

async function loadLedger(path: string): Promise<Ledger> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<Ledger>;
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      markup: parsed.markup ?? DEFAULT_MARKUP_POLICY,
      vendors: parsed.vendors ?? {},
    };
  } catch {
    return { entries: [], markup: DEFAULT_MARKUP_POLICY, vendors: {} };
  }
}

async function saveLedger(path: string, ledger: Ledger): Promise<void> {
  await writeFile(path, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function parseFlags(argv: string[]): Record<string, string[]> {
  const flags: Record<string, string[]> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      (flags[key] ??= []).push("true");
    } else {
      (flags[key] ??= []).push(value);
      index += 1;
    }
  }
  return flags;
}

function one(flags: Record<string, string[]>, key: string): string | undefined {
  return flags[key]?.[0];
}

function requireOne(flags: Record<string, string[]>, key: string): string {
  const value = one(flags, key);
  if (value === undefined) throw new Error(`缺少必填参数 --${key}`);
  return value;
}

function parseNumber(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${field} 必须是非负数字，收到 "${value}"`);
  }
  return parsed;
}

/** Parse repeated `key=value` flags into a record. */
function parsePairs(values: string[] | undefined, field: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const raw of values ?? []) {
    const splitAt = raw.lastIndexOf("=");
    if (splitAt <= 0) throw new Error(`${field} 需要 key=value 格式，收到 "${raw}"`);
    const key = raw.slice(0, splitAt).trim();
    result[key] = parseNumber(raw.slice(splitAt + 1), `${field} ${key}`);
  }
  return result;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function commandSet(flags: Record<string, string[]>): Promise<void> {
  const unit = requireOne(flags, "unit") as CostUnit;
  const entry: CostEntry = {
    modelName: requireOne(flags, "model"),
    channel: requireOne(flags, "channel"),
    unit,
    currency: (one(flags, "currency") ?? "USD") as "USD" | "CNY",
    effectiveFrom: one(flags, "from") ?? todayIso(),
    note: one(flags, "note"),
  };

  if (unit === "token") {
    entry.inputCost = parseNumber(requireOne(flags, "input"), "--input");
    entry.outputCost = parseNumber(requireOne(flags, "output"), "--output");
  } else {
    entry.unitCost = parseNumber(requireOne(flags, "cost"), "--cost");
  }

  validateCostEntry(entry);

  const ledger = await loadLedger(LEDGER_PATH);
  // Same model+channel+date is a correction, not a new price point; replacing
  // avoids a pile of same-day duplicates whose order would decide the answer.
  const existing = ledger.entries.findIndex(
    (row) =>
      row.modelName === entry.modelName &&
      row.channel === entry.channel &&
      row.effectiveFrom === entry.effectiveFrom,
  );
  if (existing >= 0) ledger.entries[existing] = entry;
  else ledger.entries.push(entry);

  const vendor = one(flags, "vendor");
  if (vendor) (ledger.vendors ??= {})[entry.modelName] = vendor.toLowerCase();

  await saveLedger(LEDGER_PATH, ledger);

  const markup = resolveMarkup(ledger.markup, entry.modelName, ledger.vendors?.[entry.modelName]);
  const suggestion = suggestedPrice(entry, markup);
  console.log(`✅ 已记录 ${entry.modelName} @ ${entry.channel}（${entry.effectiveFrom} 起生效）`);
  if (suggestion.unit === "token") {
    console.log(`   加价 ${markup}× → 建议售价 输入 ${suggestion.input.toFixed(6)} / 输出 ${suggestion.output.toFixed(6)} 每 1M tokens`);
  } else {
    const label = suggestion.unit === "per_second" ? "/秒" : "/次";
    console.log(`   加价 ${markup}× → 建议售价 ${suggestion.unitPrice.toFixed(6)} ${label}`);
  }
}

async function commandList(): Promise<void> {
  const ledger = await loadLedger(LEDGER_PATH);
  if (ledger.entries.length === 0) {
    console.log(`台账为空。先用 set 录入，例如：
  npm run cost -- set --model veo-3.1 --channel yunfei --unit per_second --cost 0.40`);
    return;
  }
  console.log(`加价策略：默认 ${ledger.markup.default}×`);
  for (const [vendor, value] of Object.entries(ledger.markup.byVendor ?? {})) {
    console.log(`  厂商 ${vendor}: ${value}×`);
  }
  for (const [model, value] of Object.entries(ledger.markup.byModel ?? {})) {
    console.log(`  模型 ${model}: ${value}×`);
  }
  console.log("");

  const sorted = [...ledger.entries].sort(
    (a, b) => a.modelName.localeCompare(b.modelName) || a.effectiveFrom.localeCompare(b.effectiveFrom),
  );
  for (const entry of sorted) {
    const markup = resolveMarkup(ledger.markup, entry.modelName, ledger.vendors?.[entry.modelName]);
    const suggestion = suggestedPrice(entry, markup);
    const priceText =
      suggestion.unit === "token"
        ? `输入 ${suggestion.input.toFixed(4)} / 输出 ${suggestion.output.toFixed(4)} 每 1M`
        : `${suggestion.unitPrice.toFixed(6)} ${suggestion.unit === "per_second" ? "/秒" : "/次"}`;
    const costText =
      entry.unit === "token"
        ? `${entry.inputCost} / ${entry.outputCost}`
        : String(entry.unitCost);
    console.log(
      `${entry.modelName.padEnd(28)} ${entry.channel.padEnd(12)} ${entry.unit.padEnd(11)} 成本 ${costText.padEnd(18)} ×${markup} → ${priceText}   [${entry.effectiveFrom}]`,
    );
  }
}

async function commandMarkup(flags: Record<string, string[]>): Promise<void> {
  const ledger = await loadLedger(LEDGER_PATH);
  const defaultValue = one(flags, "default");
  if (defaultValue) ledger.markup.default = parseNumber(defaultValue, "--default");

  const vendors = parsePairs(flags.vendor, "--vendor");
  if (Object.keys(vendors).length > 0) {
    ledger.markup.byVendor = { ...ledger.markup.byVendor };
    for (const [key, value] of Object.entries(vendors)) {
      ledger.markup.byVendor[key.toLowerCase()] = value;
    }
  }

  const models = parsePairs(flags.model, "--model");
  if (Object.keys(models).length > 0) {
    ledger.markup.byModel = { ...ledger.markup.byModel, ...models };
  }

  await saveLedger(LEDGER_PATH, ledger);
  console.log("✅ 加价策略已更新。优先级：模型 > 厂商 > 默认。");
  await commandList();
}

async function commandReport(flags: Record<string, string[]>): Promise<void> {
  const ledger = await loadLedger(LEDGER_PATH);
  const prices = parsePairs(flags.price, "--price");
  const at = one(flags, "at") ? new Date(requireOne(flags, "at")) : new Date();

  const seen = new Set<string>();
  const verdicts = [];
  for (const entry of ledger.entries) {
    const key = `${entry.modelName}@${entry.channel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const effective = resolveCost(ledger.entries, entry.modelName, entry.channel, at);
    if (!effective) continue;
    const markup = resolveMarkup(ledger.markup, effective.modelName, ledger.vendors?.[effective.modelName]);
    const actual = prices[effective.modelName];
    verdicts.push(
      marginVerdict({
        entry: effective,
        markup,
        actualPrice: typeof actual === "number" ? actual : null,
      }),
    );
  }

  if (verdicts.length === 0) {
    console.log("没有可报告的成本记录。");
    return;
  }

  console.log(`═══ 毛利报告（截至 ${at.toISOString().slice(0, 10)}）═══\n`);
  for (const verdict of verdicts) {
    const mark = verdict.losingMoney ? "🚨" : verdict.actual === null ? "•" : "✅";
    console.log(`${mark} ${verdict.modelName} @ ${verdict.channel}`);
    console.log(`   ${verdict.detail}`);
  }

  const losing = verdicts.filter((verdict) => verdict.losingMoney);
  if (losing.length > 0) {
    console.log(`\n🚨 ${losing.length} 个模型售价未覆盖成本：`);
    for (const verdict of losing) console.log(`   - ${verdict.modelName} @ ${verdict.channel}`);
    process.exitCode = 1;
  }
}

/**
 * Pull costs from an upstream's public `/api/pricing`.
 *
 * Nothing is written without `--apply`: the default run is a dry preview, and
 * any derivation carrying a `block` warning is excluded even then. Cost data
 * decides what you charge, so an automatic pull must not be able to quietly
 * install a wrong number.
 */
async function commandPull(flags: Record<string, string[]>): Promise<void> {
  const channel = requireOne(flags, "channel");
  const baseUrl = requireOne(flags, "url").replace(/\/+$/, "");
  const policy = ((one(flags, "group-policy") ?? "highest") as GroupPolicy);
  if (policy !== "highest" && policy !== "lowest") {
    throw new Error('--group-policy 只能是 highest 或 lowest');
  }
  const apply = one(flags, "apply") === "true";
  const filter = one(flags, "filter");
  const effectiveFrom = one(flags, "from") ?? todayIso();

  const { derivations, totalModels } = await fetchDerivations({
    channel,
    baseUrl,
    policy,
    filter,
    key: one(flags, "key"),
  });
  if (totalModels === 0) throw new Error("上游未返回任何模型。");

  const accepted = derivations.filter(isAcceptable);
  const blocked = derivations.filter((entry) => !isAcceptable(entry));

  console.log(`从 ${baseUrl} 拉取到 ${totalModels} 个模型，匹配 ${derivations.length} 个，成本按${policy === "highest" ? "最高" : "最低"}分组计算。\n`);

  if (accepted.length > 0) {
    console.log("可入账：");
    for (const entry of accepted) {
      const unitLabel = entry.unit === "per_second" ? "/秒" : entry.unit === "per_call" ? "/次" : "/1M tokens";
      const spread =
        entry.minCost !== entry.maxCost
          ? `  [分组区间 ${entry.minCost.toFixed(6)} ~ ${entry.maxCost.toFixed(6)}]`
          : "";
      console.log(`  ${entry.modelName.padEnd(34)} ${entry.cost.toFixed(6)} ${unitLabel}${spread}`);
      console.log(`      ${entry.explanation}`);
      for (const warning of entry.warnings) {
        console.log(`      ⚠️  ${warning.message}`);
      }
    }
    console.log("");
  }

  if (blocked.length > 0) {
    console.log("🚨 已拦截，不会入账：");
    for (const entry of blocked) {
      console.log(`  ${entry.modelName}`);
      for (const warning of entry.warnings.filter((w) => w.severity === "block")) {
        console.log(`      ${warning.message}`);
      }
      if (entry.warnings.every((w) => w.severity !== "block")) {
        console.log(`      成本推导结果为 0，无法使用。`);
      }
    }
    console.log("");
  }

  if (!apply) {
    console.log(`这是预览。确认无误后加 --apply 写入台账（${accepted.length} 条）。`);
    return;
  }

  const ledger = await loadLedger(LEDGER_PATH);
  let written = 0;
  for (const derivation of accepted) {
    const entry = toCostEntry(derivation, { effectiveFrom });
    validateCostEntry(entry);
    const existing = ledger.entries.findIndex(
      (row) =>
        row.modelName === entry.modelName &&
        row.channel === entry.channel &&
        row.effectiveFrom === entry.effectiveFrom,
    );
    if (existing >= 0) ledger.entries[existing] = entry;
    else ledger.entries.push(entry);
    written += 1;
  }
  await saveLedger(LEDGER_PATH, ledger);
  console.log(`✅ 已写入 ${written} 条成本记录（生效日期 ${effectiveFrom}）。`);
  if (blocked.length > 0) {
    console.log(`⚠️  ${blocked.length} 个模型被拦截，需要人工处理后用 set 手工录入。`);
  }
}

/**
 * Fetch and derive costs for one channel. Shared by `pull` and `html`.
 */
async function fetchDerivations(input: {
  channel: string;
  baseUrl: string;
  policy: GroupPolicy;
  filter?: string;
  key?: string;
}): Promise<{ derivations: CostDerivation[]; totalModels: number }> {
  const response = await fetch(`${input.baseUrl}/api/pricing`, {
    signal: AbortSignal.timeout(30_000),
    headers: input.key ? { Authorization: `Bearer ${input.key}` } : {},
  });
  if (!response.ok) {
    throw new Error(`${input.baseUrl}/api/pricing 返回 ${response.status}`);
  }
  const payload = (await response.json()) as PricingPayload;
  const rows = payload.data ?? [];
  const pattern = input.filter ? new RegExp(input.filter, "i") : null;
  const derivations: CostDerivation[] = [];
  for (const row of rows) {
    if (pattern && !pattern.test(row.model_name ?? "")) continue;
    const derived = deriveCost({
      row,
      channel: input.channel,
      groupRatio: payload.group_ratio ?? {},
      policy: input.policy,
    });
    if (derived) derivations.push(derived);
  }
  return { derivations, totalModels: rows.length };
}

/**
 * Generate a self-contained HTML cost/margin report across channels.
 *
 * Read-only: it never touches the ledger. A channel that fails to respond is
 * recorded as an error card rather than dropped, so a partial report cannot be
 * mistaken for a complete one.
 */
async function commandHtml(flags: Record<string, string[]>): Promise<void> {
  const policy = ((one(flags, "group-policy") ?? "highest") as GroupPolicy);
  if (policy !== "highest" && policy !== "lowest") {
    throw new Error("--group-policy 只能是 highest 或 lowest");
  }
  const out = one(flags, "out") ?? "./model-cost-report.html";
  const filter = one(flags, "filter");
  const markup = Number(one(flags, "markup") ?? 1.5);
  if (!Number.isFinite(markup) || markup <= 0) throw new Error("--markup 必须是正数");

  // --channel name=url, repeatable. Defaults to the three known upstreams.
  const specs = flags.channel?.length
    ? flags.channel.map((raw) => {
        const splitAt = raw.indexOf("=");
        if (splitAt <= 0) throw new Error(`--channel 需要 name=url 格式，收到 "${raw}"`);
        return { channel: raw.slice(0, splitAt), baseUrl: raw.slice(splitAt + 1).replace(/\/+$/, "") };
      })
    : [
        { channel: "yunfei", baseUrl: "https://img.yunfei.best" },
        { channel: "22codex", baseUrl: "https://app.22codex.xyz" },
        { channel: "kacang", baseUrl: "https://newapi.prompt-hubs.com" },
      ];

  const channels: ReportChannel[] = [];
  for (const spec of specs) {
    try {
      const { derivations, totalModels } = await fetchDerivations({ ...spec, policy, filter });
      channels.push({ ...spec, derivations, totalModels });
      console.log(`✅ ${spec.channel}: ${derivations.length} 个模型`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      channels.push({ ...spec, derivations: [], totalModels: 0, error: message });
      console.log(`⚠️  ${spec.channel}: ${message}`);
    }
  }

  const html = renderReport({
    channels,
    generatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
    groupPolicy: policy,
    defaultMarkup: markup,
  });
  await writeFile(out, html, "utf8");

  const total = channels.reduce((sum, channel) => sum + channel.derivations.length, 0);
  console.log(`\n📊 已生成 ${out}（${total} 个模型，${(html.length / 1024).toFixed(0)} KB，单文件可直接打开）`);
}

function printHelp(): void {


  console.log(`模型成本台账

  npm run cost -- pull --channel <渠道> --url <上游地址> [--filter <正则>] [--apply]
  npm run cost -- set --model <名称> --channel <渠道> --unit <单位> ...
  npm run cost -- list
  npm run cost -- markup [--default 1.5] [--vendor openai=1.6] [--model veo-3.1=1.25]
  npm run cost -- report [--price <模型>=<售价>] [--at YYYY-MM-DD]

自动拉取（三家上游都是 new-api，/api/pricing 可公开读取）
  npm run cost -- pull --channel yunfei  --url https://img.yunfei.best
  npm run cost -- pull --channel kacang  --url https://newapi.prompt-hubs.com
  npm run cost -- pull --channel 22codex --url https://app.22codex.xyz --filter "video|sec"

  默认只预览不写入，确认后加 --apply。
  --group-policy highest|lowest  同一模型多分组时按哪个算成本，默认 highest（保守）
  --filter <正则>                只处理匹配的模型名

计价单位（--unit，手工录入用）
  per_call     按次   搭配 --cost（美元/次）
  per_second   按秒   搭配 --cost（美元/秒）
  token        按量   搭配 --input 与 --output（美元/1M tokens）

通用参数
  --from YYYY-MM-DD   生效日期，默认今天。调价时用新日期再录一条，历史记录会保留
  --vendor <厂商>      标记模型所属厂商，用于按厂商加价
  --currency USD|CNY  默认 USD
  --note "备注"

台账文件 ${LEDGER_PATH}（已 gitignore，属于商业数据）`);

}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  switch (command) {
    case "set": return commandSet(flags);
    case "pull": return commandPull(flags);
    case "html": return commandHtml(flags);
    case "list": return commandList();


    case "markup": return commandMarkup(flags);
    case "report": return commandReport(flags);
    case "help": case "--help": case "-h": case undefined: return printHelp();
    default: throw new Error(`未知命令 "${command}"。运行 npm run cost -- help 查看用法。`);
  }
}

main().catch((error: unknown) => {
  console.error(`成本台账操作失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
