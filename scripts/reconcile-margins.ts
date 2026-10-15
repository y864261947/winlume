/**
 * Reconcile real new-api usage against the cost ledger.
 *
 * Read-only against new-api: it runs one SELECT on `logs` and writes
 * nothing back. Costs come from the upstream /api/pricing pull.
 */
import { Client } from "ssh2";
import { deriveCost, type PricingPayload } from "../src/lib/probe/pricing-pull";
import { reconcileRow, summarizeMargins, lossMakers, type RelayLogRow } from "../src/lib/probe/margin-reconcile";

const HOST = process.env.RELAY_HOST ?? "15.204.82.213";
const USER = process.env.RELAY_USER ?? "ubuntu";
const PASS = process.env.RELAY_PASS;

/** Map new-api channel_id → the upstream base_url it proxies to. */
const UPSTREAM_BY_HOST: Record<string, string> = {
  "img.yunfei.best": "yunfei",
  "app.22codex.xyz": "22codex",
  "newapi.prompt-hubs.com": "kacang",
};

function ssh(command: string): Promise<string> {
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
      .connect({ host: HOST, username: USER, password: PASS, readyTimeout: 25_000 });
  });
}

const psql = (sql: string) =>
  `DSN=$(sudo -n grep -oP '(?<=SQL_DSN=).*' /etc/new-api/native.env); ` +
  `sudo -n psql "$DSN" -At -F '\u0001' -c "${sql.replace(/"/g, '\\"')}"`;

async function main(): Promise<void> {
  if (!PASS) throw new Error("请设置 RELAY_PASS 环境变量。");
  const days = Number(process.argv[process.argv.indexOf("--days") + 1]) || 7;

  // Channel → upstream, so a log row can be priced against the right catalog.
  const channelsRaw = await ssh(psql(`SELECT id, name, base_url FROM channels`));
  const channelUpstream = new Map<number, string>();
  const channelName = new Map<number, string>();
  for (const line of channelsRaw.trim().split("\n").filter(Boolean)) {
    const [id, name, baseUrl] = line.split("\u0001");
    channelName.set(Number(id), name);
    try {
      const host = new URL(baseUrl).host;
      if (UPSTREAM_BY_HOST[host]) channelUpstream.set(Number(id), UPSTREAM_BY_HOST[host]);
    } catch { /* channels may have an empty base_url (official endpoints) */ }
  }

  const logsRaw = await ssh(
    psql(
      `SELECT model_name, channel_id, quota, created_at, coalesce(other,'') ` +
        `FROM logs WHERE type=2 AND created_at > extract(epoch from now())::bigint - ${days * 86400}`,
    ),
  );
  const rows: RelayLogRow[] = [];
  for (const line of logsRaw.trim().split("\n").filter(Boolean)) {
    const [modelName, channelId, quota, createdAt, other] = line.split("\u0001");
    let parsed = null;
    try { parsed = other ? JSON.parse(other) : null; } catch { /* malformed rows are tolerated */ }
    rows.push({ modelName, channelId: Number(channelId), quota: Number(quota), createdAt: Number(createdAt), other: parsed });
  }

  // Cost index from upstream pricing.
  const bases: Record<string, string> = {
    yunfei: "https://img.yunfei.best",
    "22codex": "https://app.22codex.xyz",
    kacang: "https://newapi.prompt-hubs.com",
  };
  const costs = new Map<string, number>();
  for (const [upstream, base] of Object.entries(bases)) {
    try {
      const res = await fetch(`${base}/api/pricing`, { signal: AbortSignal.timeout(30_000) });
      const payload = (await res.json()) as PricingPayload;
      for (const modelRow of payload.data ?? []) {
        if (!modelRow.model_name) continue;
        const derived = deriveCost({ row: modelRow, channel: upstream, groupRatio: payload.group_ratio ?? {}, policy: "lowest" });
        if (derived && derived.cost > 0) {
          costs.set(`${upstream}\u0000${modelRow.model_name.toLowerCase()}`, derived.cost);
        }
      }
    } catch (error) {
      console.warn(`⚠️ 拉取 ${upstream} 价格失败：${error instanceof Error ? error.message : error}`);
    }
  }

  const reconciled = rows.map((r) =>
    reconcileRow(r, (model, channelId) => {
      const upstream = channelUpstream.get(channelId);
      if (!upstream) return null;
      return costs.get(`${upstream}\u0000${model.toLowerCase()}`) ?? null;
    }),
  );

  const summaries = summarizeMargins(reconciled);
  const priced = summaries.filter((s) => s.calls > s.unpriced);

  const width = (s: string) => [...s].reduce((w, c) => w + (c.charCodeAt(0) > 255 ? 2 : 1), 0);
  const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - width(s)));

  console.log(`\n近 ${days} 天：${rows.length} 次调用，${summaries.length} 个 (模型,渠道) 组合\n`);
  console.log(pad("模型", 30) + pad("渠道", 20) + pad("次数", 7) + pad("收入", 11) + pad("成本", 11) + pad("毛利", 11) + "毛利率");
  console.log("-".repeat(102));
  for (const s of priced.slice(0, 25)) {
    const flag = s.profit <= 0 ? " ⚠️" : "";
    console.log(
      pad(s.modelName, 30) +
        pad(channelName.get(s.channelId) ?? String(s.channelId), 20) +
        pad(String(s.calls), 7) +
        pad(s.revenue.toFixed(4), 11) +
        pad(s.cost.toFixed(4), 11) +
        pad(s.profit.toFixed(4), 11) +
        (s.margin * 100).toFixed(1) + "%" + flag,
    );
  }

  const losses = lossMakers(summaries);
  const unpricedCalls = reconciled.filter((r) => r.cost === null).length;
  console.log(`\n无成本记录的调用：${unpricedCalls} / ${rows.length}（渠道未对应到已知上游，或台账缺该模型）`);
  if (losses.length > 0) {
    console.log(`\n❌ ${losses.length} 个组合在亏本销售：`);
    for (const l of losses) console.log(`   ${l.modelName} @ ${channelName.get(l.channelId) ?? l.channelId}：收入 ${l.revenue.toFixed(4)}，成本 ${l.cost.toFixed(4)}`);
    process.exitCode = 1;
  } else if (priced.length > 0) {
    console.log("\n✅ 所有可核算的组合均为正毛利。");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
