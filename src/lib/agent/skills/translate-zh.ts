import { getPlatformRepositories } from "@/lib/platform/repositories";
import { clearSkillsCache } from "./registry";

const CJK_RE = /[\u4e00-\u9fff]/g;
const LATIN_RE = /[A-Za-z]/g;

export function looksEnglishHeavy(text: string): boolean {
  const cjk = text.match(CJK_RE)?.length ?? 0;
  const latin = text.match(LATIN_RE)?.length ?? 0;
  return latin >= 8 && cjk * 2 < latin;
}

function gatewayToken(): string {
  return (
    process.env.REIZO_SERVICE_KEY?.trim() ||
    process.env.REIZO_GATEWAY_TOKEN?.trim() ||
    process.env.NEW_API_ADMIN_TOKEN?.trim() ||
    ""
  );
}

function gatewayUrl(): string {
  const base = (process.env.REIZO_GATEWAY_URL || process.env.NEW_API_URL || "").replace(/\/+$/, "");
  const path = process.env.REIZO_CHAT_PATH || "/v1/chat/completions";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function translateModel(): string {
  return process.env.REIZO_TRANSLATE_MODEL?.trim() || process.env.REIZO_DEFAULT_MODEL?.trim() || "gpt-4o-mini";
}

async function completeJson(prompt: string): Promise<string> {
  const token = gatewayToken();
  const url = gatewayUrl();
  if (!token || !url.startsWith("http")) {
    throw new Error("未配置可用于翻译的模型网关。");
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: translateModel(),
      temperature: 0.2,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "你是翻译器。把用户给出的 JSON 译成简体中文。只返回 JSON，不要 markdown。保留技术专有名词（API、AWS、Skill、id）。name 不超过 24 个汉字。description 不超过 80 个汉字。",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text.slice(0, 300) || `翻译失败 (${response.status})`);
  const json = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("翻译结果为空");
  return content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
}

export async function translateSkillLabel(input: {
  name: string;
  description: string;
}): Promise<{ name: string; description: string }> {
  const raw = await completeJson(JSON.stringify(input));
  const parsed = JSON.parse(raw) as { name?: unknown; description?: unknown };
  const name = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : input.name;
  const description =
    typeof parsed.description === "string" && parsed.description.trim()
      ? parsed.description.trim()
      : input.description;
  return { name, description };
}

export async function translateImportedSkillLabels(options?: {
  limit?: number;
}): Promise<{ translated: number; skipped: number; failed: number }> {
  const repositories = getPlatformRepositories();
  if (!repositories) throw new Error("平台数据库尚未配置。");
  const limit = Math.min(Math.max(options?.limit ?? 40, 1), 80);
  const imported = await repositories.skills.listImportedLabels();
  const pending = imported.filter(
    (row) => looksEnglishHeavy(`${row.name}\n${row.description}`),
  );
  let translated = 0;
  let failed = 0;
  const batch = pending.slice(0, limit);
  const concurrency = 5;
  for (let i = 0; i < batch.length; i += concurrency) {
    const slice = batch.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      slice.map(async (row) => {
        const next = await translateSkillLabel({
          name: row.name,
          description: row.description,
        });
        await repositories.skills.update(row.id, {
          name: next.name,
          description: next.description,
        });
        return row.id;
      }),
    );
    for (const result of results) {
      if (result.status === "fulfilled") translated += 1;
      else {
        failed += 1;
        console.warn("[skills] translate failed", result.reason);
      }
    }
  }
  if (translated) clearSkillsCache();
  return { translated, skipped: pending.length - batch.length, failed };
}
