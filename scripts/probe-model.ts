/**
 * Model capability & cost probe.
 *
 * Probes upstream channels directly to answer, per model:
 *   - which capabilities actually work
 *   - what the call really consumed (tokens, and quota on new-api channels)
 *   - for per-second video models, whether the duration multiplier applies
 *
 * Usage:
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/probe-model.ts [options]
 *   npx tsx scripts/probe-model.ts --config probe-channels.json --tier smoke
 *
 * Options:
 *   --config <path>    Channel config JSON (default: ./probe-channels.json)
 *   --channel <name>   Only probe this channel (repeatable via comma list)
 *   --models a,b,c     Explicit model ids, overriding channel config/discovery
 *   --tier <t>         smoke | standard | full   (default: smoke)
 *   --limit <n>        Max models per channel (default: 20)
 *   --concurrency <n>  Parallel model probes (default: 3)
 *   --out <path>       Report output path (default: ./probe-report.json)
 *   --check-duration   Run the 5s-vs-10s per-second billing check on video models
 *   --yes              Skip the cost confirmation prompt
 *
 * Config format (probe-channels.json):
 *   {
 *     "channels": [
 *       {
 *         "name": "upstream-a",
 *         "baseUrl": "https://provider.example",
 *         "apiKey": "sk-...",
 *         "kind": "new-api",
 *         "logToken": "optional PAT for /api/log/self cost lookup",
 *         "models": ["gpt-4o", "claude-sonnet-4"]
 *       }
 *     ]
 *   }
 *
 * NOTE: probe-channels.json holds live upstream credentials. Keep it out of
 * version control (see .gitignore) and never commit a filled-in copy.
 */

import { readFile, writeFile } from "node:fs/promises";
import { casesForTier, estimateRunWeight, inferModelKind, type ProbeCaseId } from "../src/lib/probe/cases";
import {
  costFromLogRow,
  extractUsage,
  judgeCase,
  judgeDurationMultiplier,
  QUOTA_PER_CREDIT,
  type JudgeInput,
} from "../src/lib/probe/judge";
import { buildImageRequest, buildTextRequest, buildVideoRequest } from "../src/lib/probe/requests";
import { durationCheckPair, inferVideoFamily } from "../src/lib/probe/video";

import type {
  ModelProbeReport,
  ObservedCost,
  ProbeChannel,
  ProbeCaseResult,
  ProbeConfig,
  ProbeTier,
} from "../src/lib/probe/types";

const REQUEST_ID_HEADER = "x-oneapi-request-id";
const CALL_TIMEOUT_MS = 180_000;
const VIDEO_TIMEOUT_MS = 300_000;

type Options = {
  config: string;
  channels: string[] | null;
  models: string[] | null;
  tier: ProbeTier;
  limit: number;
  concurrency: number;
  out: string;
  checkDuration: boolean;
  yes: boolean;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    config: "./probe-channels.json",
    channels: null,
    models: null,
    tier: "smoke",
    limit: 20,
    concurrency: 3,
    out: "./probe-report.json",
    checkDuration: false,
    yes: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      index += 1;
      return value;
    };
    switch (arg) {
      case "--config": options.config = next(); break;
      case "--channel": options.channels = next().split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--models": options.models = next().split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--tier": {
        const value = next();
        if (value !== "smoke" && value !== "standard" && value !== "full") {
          throw new Error(`--tier must be smoke|standard|full, got "${value}"`);
        }
        options.tier = value;
        break;
      }
      case "--limit": options.limit = Number(next()); break;
      case "--concurrency": options.concurrency = Number(next()); break;
      case "--out": options.out = next(); break;
      case "--check-duration": options.checkDuration = true; break;
      case "--yes": case "-y": options.yes = true; break;
      case "--help": case "-h": options.yes = false; printHelpAndExit(); break;
      default: throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!Number.isFinite(options.limit) || options.limit <= 0) throw new Error("--limit must be a positive number");
  if (!Number.isFinite(options.concurrency) || options.concurrency <= 0) throw new Error("--concurrency must be a positive number");
  return options;
}

function printHelpAndExit(): never {
  console.log(`模型能力与成本探针

  npx tsx scripts/probe-model.ts --config probe-channels.json --tier smoke

  --config <path>    渠道配置 JSON（默认 ./probe-channels.json）
  --channel <name>   只探测指定渠道，逗号分隔
  --models a,b,c     显式指定模型，覆盖配置与自动发现
  --tier <t>         smoke | standard | full（默认 smoke）
  --limit <n>        每个渠道最多探测的模型数（默认 20）
  --concurrency <n>  并发模型数（默认 3）
  --out <path>       报告输出路径（默认 ./probe-report.json）
  --check-duration   对视频模型执行 5s/10s 时长计费校验
  --yes              跳过开销确认

  注意：每次探测都会产生真实调用与真实费用。先用 --tier smoke 筛选。`);
  process.exit(0);
}

function trimUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

async function loadConfig(path: string): Promise<ProbeConfig> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error(
      `未找到渠道配置 ${path}。请创建该文件，格式参见 scripts/probe-model.ts 顶部说明，或用 --config 指定路径。`,
    );
  }
  const parsed = JSON.parse(raw) as ProbeConfig;
  if (!parsed || !Array.isArray(parsed.channels) || parsed.channels.length === 0) {
    throw new Error(`${path} 中没有配置任何 channels。`);
  }
  parsed.channels.forEach((channel, index) => {
    if (!channel.name) throw new Error(`channels[${index}] 缺少 name`);
    if (!channel.baseUrl) throw new Error(`渠道 ${channel.name} 缺少 baseUrl`);
    if (!channel.apiKey) throw new Error(`渠道 ${channel.name} 缺少 apiKey`);
    if (channel.kind !== "openai" && channel.kind !== "new-api") {
      throw new Error(`渠道 ${channel.name} 的 kind 必须是 "openai" 或 "new-api"`);
    }
  });
  return parsed;
}

type CallResult = {
  status: number | null;
  body: unknown;
  requestId: string | null;
  latencyMs: number;
  transportError?: string;
  streamedText?: string;
  streamEvents?: number;
};

async function call(
  channel: ProbeChannel,
  path: string,
  body: Record<string, unknown>,
  options: { stream: boolean; timeoutMs?: number },
): Promise<CallResult> {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${trimUrl(channel.baseUrl)}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channel.apiKey}`,
        Accept: options.stream ? "text/event-stream" : "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? CALL_TIMEOUT_MS),
    });
    const requestId = response.headers.get(REQUEST_ID_HEADER);

    if (options.stream && response.ok) {
      const text = await response.text();
      let streamEvents = 0;
      let streamedText = "";
      for (const line of text.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const chunk = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = chunk.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            streamEvents += 1;
            streamedText += delta;
          }
        } catch {
          // A malformed chunk is not fatal to the streaming verdict.
        }
      }
      return {
        status: response.status,
        body: null,
        requestId,
        latencyMs: Date.now() - startedAt,
        streamedText,
        streamEvents,
      };
    }

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { message: text.slice(0, 300) };
    }
    return { status: response.status, body: parsed, requestId, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      status: null,
      body: null,
      requestId: null,
      latencyMs: Date.now() - startedAt,
      transportError: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Exact per-call cost via X-Oneapi-Request-Id → /api/log/self.
 *
 * Only new-api channels expose this. A direct vendor channel returns an
 * explicit "unavailable" reason rather than a fabricated zero.
 */
async function lookupCost(channel: ProbeChannel, requestId: string | null): Promise<ObservedCost> {
  if (channel.kind !== "new-api" || !requestId) {
    return costFromLogRow(channel.kind === "new-api" ? requestId : null, null);
  }
  const token = channel.logToken ?? channel.apiKey;
  // The billing log row is written after the response is flushed; give it a moment.
  await sleep(1500);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const params = new URLSearchParams({ p: "1", page_size: "10", request_id: requestId });
      const response = await fetch(`${trimUrl(channel.baseUrl)}/api/log/self?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          success?: boolean;
          data?: { items?: Array<{ quota?: number; request_id?: string }> };
        };
        const row = payload.data?.items?.find((item) => item.request_id === requestId);
        if (row) return costFromLogRow(requestId, row);
      }
    } catch {
      // Retry below.
    }
    await sleep(2000 * (attempt + 1));
  }
  return costFromLogRow(requestId, null);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function discoverModels(channel: ProbeChannel): Promise<string[]> {
  if (channel.models?.length) return channel.models;
  const response = await fetch(`${trimUrl(channel.baseUrl)}/v1/models`, {
    headers: { Authorization: `Bearer ${channel.apiKey}` },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`渠道 ${channel.name} 的 /v1/models 返回 ${response.status}`);
  }
  const payload = (await response.json()) as { data?: Array<{ id?: unknown }> };
  return (payload.data ?? [])
    .map((row) => (typeof row.id === "string" ? row.id.trim() : ""))
    .filter(Boolean);
}

async function runCase(
  channel: ProbeChannel,
  model: string,
  caseId: ProbeCaseId,
): Promise<ProbeCaseResult> {
  const kind = inferModelKind(model);
  let request;
  try {
    request =
      kind === "image"
        ? buildImageRequest(caseId, model)
        : kind === "video"
          ? buildVideoRequest(model, 5)
          : buildTextRequest(caseId, model);
  } catch (error) {
    return {
      id: caseId,
      outcome: "skip",
      detail: error instanceof Error ? error.message : String(error),
      latencyMs: 0,
      usage: null,
      cost: null,
    };
  }

  const result = await call(channel, request.path, request.body, {
    stream: request.stream,
    timeoutMs: kind === "video" ? VIDEO_TIMEOUT_MS : CALL_TIMEOUT_MS,
  });

  const judgeInput: JudgeInput = {
    status: result.status,
    body: result.body,
    streamedText: result.streamedText,
    streamEvents: result.streamEvents,
    transportError: result.transportError,
  };
  const judgement = judgeCase(caseId, judgeInput);
  const cost = await lookupCost(channel, result.requestId);

  return {
    id: caseId,
    outcome: judgement.outcome,
    detail: judgement.detail,
    latencyMs: result.latencyMs,
    usage: extractUsage(result.body),
    cost,
  };
}

/**
 * Duration billing check.
 *
 * Submits the same clip at two DIFFERENT, FAMILY-LEGAL durations and compares
 * actual quota. A ratio near 1.0 means the duration multiplier never applied —
 * the model bills one second no matter how long the clip is.
 *
 * Durations come from the family rules rather than a fixed 5/10 pair: 云飞 veo
 * accepts only 4/6/8 and Wan 3.0 starts at 3, so a hardcoded pair would send
 * an illegal value and produce a meaningless verdict.
 */
async function runDurationCheck(channel: ProbeChannel, model: string) {
  const family = inferVideoFamily(model);
  const pair = durationCheckPair(family);
  if (!pair) {
    return judgeDurationMultiplier({
      modelName: model,
      shortSeconds: 0,
      longSeconds: 0,
      shortCost: null,
      longCost: null,
    });
  }
  const { short: shortSeconds, long: longSeconds } = pair;

  const shortRequest = buildVideoRequest(model, shortSeconds);
  const shortCall = await call(channel, shortRequest.path, shortRequest.body, {
    stream: false,
    timeoutMs: VIDEO_TIMEOUT_MS,
  });
  const shortCost = await lookupCost(channel, shortCall.requestId);

  const longRequest = buildVideoRequest(model, longSeconds);
  const longCall = await call(channel, longRequest.path, longRequest.body, {
    stream: false,
    timeoutMs: VIDEO_TIMEOUT_MS,
  });
  const longCost = await lookupCost(channel, longCall.requestId);


  return judgeDurationMultiplier({
    modelName: model,
    shortSeconds,
    longSeconds,
    shortCost: shortCost.quota,
    longCost: longCost.quota,
  });
}

async function probeModel(
  channel: ProbeChannel,
  model: string,
  tier: ProbeTier,
  checkDuration: boolean,
): Promise<ModelProbeReport> {
  const kind = inferModelKind(model);
  const cases: ProbeCaseResult[] = [];
  for (const caseId of casesForTier(kind, tier)) {
    cases.push(await runCase(channel, model, caseId));
  }

  const shouldCheckDuration =
    checkDuration && kind === "video" && cases.some((entry) => entry.outcome === "pass");

  return {
    channel: channel.name,
    model,
    kind,
    probedAt: new Date().toISOString(),
    tier,
    cases,
    durationMultiplier: shouldCheckDuration ? await runDurationCheck(channel, model) : null,
  };
}

/** Bounded-concurrency map; keeps upstream rate limits out of the results. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function symbolFor(outcome: string): string {
  return outcome === "pass" ? "✅" : outcome === "fail" ? "❌" : outcome === "skip" ? "⏭️" : "⚠️";
}

function summarize(reports: ModelProbeReport[]): void {
  console.log("\n═══ 探针结果 ═══\n");
  for (const report of reports) {
    const passed = report.cases.filter((entry) => entry.outcome === "pass").length;
    const errored = report.cases.filter((entry) => entry.outcome === "error").length;
    const quota = report.cases.reduce((sum, entry) => sum + (entry.cost?.quota ?? 0), 0);
    const costLabel = quota > 0 ? ` · 实测扣费 ${(quota / QUOTA_PER_CREDIT).toFixed(4)} credits` : "";
    console.log(`${report.channel} / ${report.model} [${report.kind}] ${passed}/${report.cases.length} 通过${costLabel}`);
    for (const entry of report.cases) {
      console.log(`   ${symbolFor(entry.outcome)} ${entry.id.padEnd(14)} ${entry.detail}`);
    }
    if (errored > 0) {
      console.log(`   ⚠️  ${errored} 项为 error（传输/限流问题），不能据此判定模型能力。`);
    }
    if (report.durationMultiplier) {
      const duration = report.durationMultiplier;
      console.log(`   ${symbolFor(duration.outcome)} 时长计价       ${duration.detail}`);
      if (duration.outcome === "fail") {
        console.log(`   🚨 该模型存在静默亏损风险，禁止上架。`);
      }
    }
    console.log("");
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const config = await loadConfig(options.config);

  const channels = options.channels
    ? config.channels.filter((channel) => options.channels!.includes(channel.name))
    : config.channels;
  if (channels.length === 0) throw new Error("没有匹配到任何渠道。");

  const targets: Array<{ channel: ProbeChannel; model: string; kind: string }> = [];
  for (const channel of channels) {
    const discovered = options.models ?? (await discoverModels(channel));
    for (const model of discovered.slice(0, options.limit)) {
      targets.push({ channel, model, kind: inferModelKind(model) });
    }
  }
  if (targets.length === 0) throw new Error("没有解析到任何待探测模型。");

  const weight = estimateRunWeight(
    targets.map((target) => ({ kind: inferModelKind(target.model) })),
    options.tier,
  );
  console.log(`将探测 ${targets.length} 个模型（tier=${options.tier}），相对开销权重 ≈ ${weight}。`);
  if (options.checkDuration) {
    const videoCount = targets.filter((target) => target.kind === "video").length;
    if (videoCount > 0) {
      console.log(`其中 ${videoCount} 个视频模型将额外执行 5s/10s 时长计费校验（每个 2 次真实生成）。`);
    }
  }
  console.log("每次探测都会产生真实调用与真实费用。\n");

  if (!options.yes && weight > 200) {
    console.log("开销权重较高。确认无误请加 --yes 重新执行，或先用 --tier smoke 筛选。");
    process.exit(1);
  }

  const reports = await mapWithConcurrency(targets, options.concurrency, (target) =>
    probeModel(target.channel, target.model, options.tier, options.checkDuration),
  );

  summarize(reports);
  await writeFile(options.out, `${JSON.stringify(reports, null, 2)}\n`, "utf8");
  console.log(`完整报告已写入 ${options.out}`);

  const blocked = reports.filter((report) => report.durationMultiplier?.outcome === "fail");
  if (blocked.length > 0) {
    console.log(`\n🚨 ${blocked.length} 个模型的时长乘数未生效，禁止上架：`);
    for (const report of blocked) console.log(`   - ${report.channel} / ${report.model}`);
  }
}

main().catch((error: unknown) => {
  console.error(`探针失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
