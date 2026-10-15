/**
 * Render a self-contained HTML cost/margin report.
 *
 * Deliberately a single file with no external assets: it must open by
 * double-click, survive being emailed, and work offline. The data is embedded
 * as JSON and all recomputation (markup changes, filtering, sorting) happens
 * in the page, so the numbers stay live without a server.
 *
 * Pure module — returns a string, writes nothing.
 */

import type { CostDerivation } from "./pricing-pull";
import type { ModelCategory } from "./classify";


export type ReportChannel = {
  channel: string;
  baseUrl: string;
  /** Total models returned by the upstream, before filtering. */
  totalModels: number;
  derivations: CostDerivation[];
  error?: string;
};

export type ReportInput = {
  channels: ReportChannel[];
  generatedAt: string;
  groupPolicy: "highest" | "lowest";
  defaultMarkup: number;
};

/**
 * Escape text for HTML text/attribute context.
 *
 * Model names, group names and upstream-authored descriptions all flow into
 * this page. They are third-party strings: an upstream could name a model
 * `<img onerror=...>` and the report is something you open locally with your
 * own credentials in the browser.
 */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Serialize JSON for embedding inside a <script> block.
 *
 * `</script>` inside a string literal would terminate the block early, and
 * U+2028/U+2029 are literal line terminators in JS source.
 */
export function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export type ReportRow = {
  channel: string;
  model: string;
  unit: CostDerivation["unit"];
  cost: number;
  minCost: number;
  maxCost: number;
  groupUsed: string | null;
  groups: string[];
  resolution: string | null;
  explanation: string;
  blocked: boolean;
  warnings: Array<{ code: string; severity: string; message: string }>;
  /** max/min across groups; 1 when a single group applies. */
  spread: number;
  /** Modality bucket and how it was decided. */
  category: ModelCategory;
  categoryConfidence: string;
  categoryReason: string;
  /** Token-billing components, all scaled by the same markup in the UI. */
  inputCost: number | null;
  cacheCost: number | null;
};

export function toRows(input: ReportInput): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const channel of input.channels) {
    for (const derivation of channel.derivations) {
      const blocked =
        derivation.warnings.some((warning) => warning.severity === "block") || derivation.cost <= 0;
      const classification = derivation.classification ?? {
        category: "unknown" as ModelCategory,
        confidence: "guessed",
        reason: "未分类",
      };
      rows.push({
        channel: channel.channel,
        model: derivation.modelName,
        unit: derivation.unit,
        cost: derivation.cost,
        minCost: derivation.minCost,
        maxCost: derivation.maxCost,
        groupUsed: derivation.groupUsed,
        groups: derivation.groups,
        resolution: derivation.resolution,
        explanation: derivation.explanation,
        blocked,
        warnings: derivation.warnings.map((warning) => ({
          code: warning.code,
          severity: warning.severity,
          message: warning.message,
        })),
        spread: derivation.minCost > 0 ? derivation.maxCost / derivation.minCost : 1,
        category: classification.category,
        categoryConfidence: classification.confidence,
        categoryReason: classification.reason,
        inputCost: derivation.inputCost ?? null,
        cacheCost: derivation.cacheCost ?? null,
      });
    }
  }
  return rows;
}

export type ReportSummary = {
  total: number;
  usable: number;
  blocked: number;
  bySpread: number;
  byUnit: Record<string, number>;
  byCategory: Record<string, number>;
  /** Rows whose modality was guessed from the name and deserve a human look. */
  guessedCategory: number;
};

export function summarize(rows: ReportRow[]): ReportSummary {
  const byUnit: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const row of rows) {
    byUnit[row.unit] = (byUnit[row.unit] ?? 0) + 1;
    byCategory[row.category] = (byCategory[row.category] ?? 0) + 1;
  }
  return {
    total: rows.length,
    usable: rows.filter((row) => !row.blocked).length,
    blocked: rows.filter((row) => row.blocked).length,
    bySpread: rows.filter((row) => row.spread >= 1.5).length,
    byUnit,
    byCategory,
    guessedCategory: rows.filter((row) => row.categoryConfidence === "guessed").length,
  };
}

const CATEGORY_LABEL: Record<string, string> = {
  text: "文本",
  image: "图片",
  video: "视频",
  audio: "音频",
  unknown: "未分类",
};

/** Display order: the categories you price most often come first. */
const CATEGORY_ORDER: ModelCategory[] = ["text", "image", "video", "audio", "unknown"];

const UNIT_LABEL: Record<string, string> = {
  per_second: "/秒",
  per_call: "/次",
  token: "/1M tokens",
};

export function renderReport(input: ReportInput): string {
  const rows = toRows(input);
  const summary = summarize(rows);
  const payload = { rows, meta: input, summary, unitLabel: UNIT_LABEL, categoryLabel: CATEGORY_LABEL, categoryOrder: CATEGORY_ORDER };


  const channelCards = input.channels
    .map((channel) => {
      const usable = channel.derivations.filter(
        (derivation) => !derivation.warnings.some((w) => w.severity === "block") && derivation.cost > 0,
      ).length;
      const status = channel.error
        ? `<span class="err">${escapeHtml(channel.error)}</span>`
        : `${usable} / ${channel.derivations.length} 可用 · 上游共 ${channel.totalModels} 个模型`;
      return `<div class="card">
        <div class="card-name">${escapeHtml(channel.channel)}</div>
        <div class="card-url">${escapeHtml(channel.baseUrl)}</div>
        <div class="card-stat">${status}</div>
      </div>`;
    })
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>模型成本与毛利测算</title>
<style>
  :root {
    --bg: #0d1117; --panel: #161b22; --line: #30363d; --ink: #e6edf3;
    --muted: #8b949e; --accent: #58a6ff; --ok: #3fb950; --warn: #d29922; --bad: #f85149;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
  .wrap { max-width: 1400px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: var(--muted); font-size: 13px; margin-bottom: 20px; }
  .cards { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; min-width: 200px; }
  .card-name { font-weight: 600; }
  .card-url { color: var(--muted); font-size: 12px; font-family: ui-monospace, Consolas, monospace; }
  .card-stat { margin-top: 6px; font-size: 13px; }
  .err { color: var(--bad); }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .controls { display: flex; gap: 20px; flex-wrap: wrap; align-items: flex-end; }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .field label { font-size: 12px; color: var(--muted); }
  input, select { background: #0d1117; color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; font-size: 13px; }
  input[type=number] { width: 90px; }
  input[type=text] { width: 200px; }
  .stats { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 16px; }
  .stat { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 10px 18px; }
  .stat b { font-size: 20px; display: block; }
  .stat span { color: var(--muted); font-size: 12px; }
  table { width: 100%; border-collapse: collapse; background: var(--panel); border-radius: 8px; overflow: hidden; }
  th, td { padding: 9px 12px; text-align: left; border-bottom: 1px solid var(--line); font-size: 13px; }
  th { background: #1c2128; font-weight: 600; cursor: pointer; user-select: none; white-space: nowrap; }
  th:hover { color: var(--accent); }
  td.num { text-align: right; font-family: ui-monospace, Consolas, monospace; }
  tr.blocked { opacity: .55; }
  tr.blocked td:first-child::before { content: "🚨 "; }
  .tag { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 11px; border: 1px solid var(--line); color: var(--muted); }
  .tag.sec { color: var(--accent); border-color: var(--accent); }
  .spread { color: var(--warn); font-size: 12px; }
  .margin-ok { color: var(--ok); }
  .margin-bad { color: var(--bad); font-weight: 600; }
  .note { color: var(--muted); font-size: 12px; font-family: ui-monospace, Consolas, monospace; }
  .warn-line { color: var(--warn); font-size: 12px; margin-top: 3px; }
  .warn-line.block { color: var(--bad); }
  .empty { padding: 40px; text-align: center; color: var(--muted); }
  .hint { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; line-height: 1.7; }
  .tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .tab { background: var(--panel); border: 1px solid var(--line); border-radius: 999px; padding: 7px 16px; cursor: pointer; font-size: 13px; color: var(--muted); user-select: none; }
  .tab:hover { border-color: #3a4763; color: #e6ebf5; }
  .tab.on { background: #1d4ed8; border-color: #2563eb; color: #fff; }
  .tab .n { opacity: 0.72; margin-left: 6px; font-variant-numeric: tabular-nums; }
  .cat { font-size: 12px; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--line); white-space: nowrap; }
  .cat-text { color: #93c5fd; border-color: #1e3a8a; }
  .cat-image { color: #c4b5fd; border-color: #4c1d95; }
  .cat-video { color: #6ee7b7; border-color: #065f46; }
  .cat-audio { color: #fcd34d; border-color: #78350f; }
  .cat-unknown { color: var(--muted); }
  .guess { color: #fbbf24; cursor: help; margin-left: 4px; }
  .triple { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .triple i { color: var(--muted); font-style: normal; }

  details summary { cursor: pointer; color: var(--muted); font-size: 12px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>模型成本与毛利测算</h1>
  <div class="sub">
    生成于 ${escapeHtml(input.generatedAt)} ·
    成本按<b>${input.groupPolicy === "highest" ? "最高" : "最低"}</b>分组倍率计算 ·
    数据来自各上游 <code>/api/pricing</code> 实时拉取
  </div>

  <div class="cards">${channelCards}</div>

  <div class="stats">
    <div class="stat"><b>${summary.total}</b><span>模型总数</span></div>
    <div class="stat"><b class="margin-ok">${summary.usable}</b><span>可用于定价</span></div>
    <div class="stat"><b class="margin-bad">${summary.blocked}</b><span>已拦截</span></div>
    <div class="stat"><b class="spread">${summary.bySpread}</b><span>分组价差 ≥1.5×</span></div>
    <div class="stat"><b class="spread">${summary.guessedCategory}</b><span>分类靠猜，待人工核</span></div>
  </div>

  <div class="tabs" id="tabs"></div>

  <div class="panel">
    <div class="controls">
      <div class="field">
        <label>默认加价倍率</label>
        <input type="number" id="markup" value="${input.defaultMarkup}" step="0.05" min="0.01">
      </div>
      <div class="field">
        <label>筛选模型名</label>
        <input type="text" id="filter" placeholder="正则，如 video|sec">
      </div>
      <div class="field">
        <label>渠道</label>
        <select id="channel"><option value="">全部</option></select>
      </div>
      <div class="field">
        <label>计价单位</label>
        <select id="unit">
          <option value="">全部</option>
          <option value="per_second">按秒</option>
          <option value="per_call">按次</option>
          <option value="token">按 token</option>
        </select>
      </div>
      <div class="field">
        <label><input type="checkbox" id="hideBlocked"> 隐藏被拦截项</label>
      </div>
      <div class="field">
        <label><input type="checkbox" id="onlyGuessed"> 只看分类存疑</label>
      </div>
    </div>
    <div class="hint">
      <b>建议售价</b> = 最低分组成本 × 加价倍率（对手会按这个价报）。
      <b>最差毛利</b> = 按该售价成交、但请求落在最贵分组时的真实毛利。
      单一分组的模型它等于 1−1/加价倍率；<b>多分组模型才是风险所在</b>，红色表示按最低分组定价会亏钱。
      <br><b>文本模型</b>成本列显示「输入 / 输出 / 缓存」，三者按同一倍率加价，上游自带的缓存折扣原样保留。
    </div>
  </div>

  <table>
    <thead><tr>
      <th data-sort="model">模型</th>
      <th data-sort="category">类别</th>
      <th data-sort="channel">渠道</th>
      <th data-sort="unit">单位</th>
      <th data-sort="cost" class="num">成本(高)</th>
      <th data-sort="minCost" class="num">成本(低)</th>
      <th data-sort="spread" class="num">分组价差</th>
      <th class="num">建议售价</th>
      <th class="num">最差毛利</th>
      <th>说明</th>
    </tr></thead>
    <tbody id="body"></tbody>
  </table>
  <div class="empty" id="empty" style="display:none">没有匹配的模型。</div>
</div>

<script>
const DATA = ${embedJson(payload)};
const $ = (id) => document.getElementById(id);
let sortKey = "cost", sortDir = -1;

const channels = [...new Set(DATA.rows.map(r => r.channel))];
for (const c of channels) {
  const opt = document.createElement("option");
  opt.value = c; opt.textContent = c;
  $("channel").appendChild(opt);
}

// Category tabs, built from what is actually present so an empty bucket
// never shows up as a dead tab.
let categoryPick = "";
const presentCategories = DATA.categoryOrder.filter(c => (DATA.summary.byCategory[c] || 0) > 0);
function buildTabs() {
  const tabs = $("tabs");
  const mk = (value, label, count) => {
    const el = document.createElement("div");
    el.className = "tab" + (categoryPick === value ? " on" : "");
    el.innerHTML = esc(label) + '<span class="n">' + count + "</span>";
    el.onclick = () => { categoryPick = value; buildTabs(); render(); };
    tabs.appendChild(el);
  };
  tabs.innerHTML = "";
  mk("", "全部", DATA.summary.total);
  for (const c of presentCategories) mk(c, DATA.categoryLabel[c], DATA.summary.byCategory[c]);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (m) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]
  ));
}

function fmt(n) {
  if (!isFinite(n)) return "-";
  if (n === 0) return "0";
  if (n < 0.001) return n.toFixed(8);
  if (n < 1) return n.toFixed(6);
  return n.toFixed(4);
}

function render() {
  const markup = parseFloat($("markup").value) || 1;
  const channelPick = $("channel").value;
  const unitPick = $("unit").value;
  const hideBlocked = $("hideBlocked").checked;
  const onlyGuessed = $("onlyGuessed").checked;
  let pattern = null;
  const filterText = $("filter").value.trim();
  if (filterText) { try { pattern = new RegExp(filterText, "i"); } catch { pattern = null; } }

  let rows = DATA.rows.filter(r => {
    if (categoryPick && r.category !== categoryPick) return false;
    if (channelPick && r.channel !== channelPick) return false;
    if (unitPick && r.unit !== unitPick) return false;
    if (hideBlocked && r.blocked) return false;
    if (onlyGuessed && r.categoryConfidence !== "guessed") return false;
    if (pattern && !pattern.test(r.model)) return false;
    return true;
  });

  rows.sort((a, b) => {
    const x = a[sortKey], y = b[sortKey];
    if (typeof x === "number" && typeof y === "number") return (x - y) * sortDir;
    return String(x).localeCompare(String(y)) * sortDir;
  });

  const body = $("body");
  body.innerHTML = rows.map(r => {
    // Two different questions, two different numbers:
    //   建议售价 — price off the CHEAPEST group, which is what a competitor
    //              quoting this model would advertise.
    //   最差毛利 — the margin that price actually yields if the request lands
    //              on the DEAREST group.
    // Pricing off the conservative cost and then reporting margin against that
    // same cost is circular: it returns 1-1/markup on every row and hides the
    // whole point of tracking group spread.
    const optimisticCost = Math.min(r.cost, r.minCost);
    const worstCost = Math.max(r.cost, r.maxCost);
    const suggested = optimisticCost * markup;
    const worstMargin = suggested > 0 ? (suggested - worstCost) / suggested : 0;
    const unitLabel = DATA.unitLabel[r.unit] || "";
    const spreadCell = r.spread >= 1.5
      ? '<span class="spread">' + r.spread.toFixed(1) + "×</span>"
      : '<span class="note">—</span>';
    const warns = r.warnings.map(w =>
      '<div class="warn-line' + (w.severity === "block" ? " block" : "") + '">' + esc(w.message) + "</div>"
    ).join("");
    const groups = r.groups.length
      ? '<details><summary>' + r.groups.length + ' 个分组</summary><div class="note">' + esc(r.groups.join(" / ")) + "</div></details>"
      : "";
    const marginCls = worstMargin <= 0 ? "margin-bad" : worstMargin < 0.15 ? "spread" : "margin-ok";
    const marginCell = r.blocked
      ? "—"
      : '<span class="' + marginCls + '">' + (worstMargin * 100).toFixed(1) + "%</span>";

    // Text models bill on three components. Input, output and cache all take
    // the SAME markup, which keeps the upstream's own cache discount intact
    // — observed cache/input ratios range from 0.02 to 0.29, so imposing a
    // single discount would misprice most of the catalog.
    const isText = r.category === "text" && r.unit === "token";
    const costCell = isText && (r.inputCost !== null || r.cacheCost !== null)
      ? '<div class="triple"><i>入</i> ' + fmt(r.inputCost !== null ? r.inputCost : r.cost)
        + ' <i>出</i> ' + fmt(r.cost)
        + (r.cacheCost !== null ? ' <i>存</i> ' + fmt(r.cacheCost) : "")
        + "</div>"
      : fmt(r.cost);
    const priceCell = r.blocked
      ? "—"
      : isText && (r.inputCost !== null || r.cacheCost !== null)
        ? '<div class="triple"><i>入</i> ' + fmt((r.inputCost !== null ? r.inputCost : r.cost) * markup)
          + ' <i>出</i> ' + fmt(r.cost * markup)
          + (r.cacheCost !== null ? ' <i>存</i> ' + fmt(r.cacheCost * markup) : "")
          + "</div>"
        : fmt(suggested);

    const guessMark = r.categoryConfidence === "guessed"
      ? '<span class="guess" title="' + esc(r.categoryReason) + '">?</span>'
      : "";
    const catCell = '<span class="cat cat-' + r.category + '" title="' + esc(r.categoryReason) + '">'
      + esc(DATA.categoryLabel[r.category]) + "</span>" + guessMark;

    return "<tr class=\\"" + (r.blocked ? "blocked" : "") + "\\">"
      + "<td>" + esc(r.model) + (r.resolution ? ' <span class="tag sec">' + esc(r.resolution) + "</span>" : "") + "</td>"
      + "<td>" + catCell + "</td>"
      + "<td>" + esc(r.channel) + "</td>"
      + '<td><span class="tag' + (r.unit === "per_second" ? " sec" : "") + '">' + esc(unitLabel) + "</span></td>"
      + '<td class="num">' + costCell + "</td>"
      + '<td class="num"><span class="note">' + (r.minCost !== r.cost ? fmt(r.minCost) : "—") + "</span></td>"
      + '<td class="num">' + spreadCell + "</td>"
      + '<td class="num">' + priceCell + "</td>"
      + '<td class="num">' + marginCell + "</td>"
      + '<td><div class="note">' + esc(r.explanation) + "</div>" + warns + groups + "</td>"
      + "</tr>";
  }).join("");

  $("empty").style.display = rows.length ? "none" : "block";
}

for (const id of ["markup", "filter", "channel", "unit", "hideBlocked", "onlyGuessed"]) {
  $(id).addEventListener("input", render);
  $(id).addEventListener("change", render);
}
document.querySelectorAll("th[data-sort]").forEach(th => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    if (sortKey === key) sortDir = -sortDir; else { sortKey = key; sortDir = -1; }
    render();
  });
});
buildTabs();
render();
</script>
</body>
</html>
`;
}
