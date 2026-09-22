import type { ServiceId, ServiceOptions } from "./catalog";
import { ServiceConfigError } from "./config";

export type ServiceOutput = { content: string | Uint8Array; contentType: string; usage: string | null };

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new ServiceConfigError("供应商返回了空响应。", 502);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) throw new ServiceConfigError("供应商响应超过大小限制。", 502);
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (!length) throw new ServiceConfigError("供应商返回了空响应。", 502);
  return bytes;
}

function upstreamError(status: number): ServiceConfigError {
  const message = status === 401 || status === 403 ? "Key 无效或没有接口权限。"
    : status === 402 || status === 432 || status === 433 ? "供应商额度不足或已达到消费上限。"
    : status === 429 ? "供应商限流或额度受限，请稍后重试。"
    : status === 400 || status === 422 ? "供应商拒绝了参数，请检查模型和音色配置。"
    : "供应商请求失败，请检查服务状态。";
  return new ServiceConfigError(`${message}（HTTP ${status}）`, 502);
}

/** Server-side adapters. Fixed provider origins prevent credentials being sent to arbitrary hosts. */
export async function callProvider(id: ServiceId, key: string, options: ServiceOptions, input: string, fetcher: typeof fetch = fetch): Promise<ServiceOutput> {
  if (!input.trim() || input.length > 4000) throw new ServiceConfigError("输入长度必须为 1–4000 个字符。");
  let url: string;
  let body: Record<string, unknown>;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (id === "tavily") {
    url = "https://api.tavily.com/search";
    headers.Authorization = `Bearer ${key}`;
    body = { query: input, search_depth: "basic", max_results: 3, include_answer: false, include_raw_content: false, include_usage: true };
  } else if (id === "jina-reader") {
    let target: URL;
    try { target = new URL(input); } catch { throw new ServiceConfigError("请输入有效的 HTTPS 网页地址。"); }
    if (target.protocol !== "https:" || target.username || target.password) throw new ServiceConfigError("请输入不含登录凭据的 HTTPS 网页地址。");
    url = "https://r.jina.ai/";
    headers.Authorization = `Bearer ${key}`;
    headers.Accept = "application/json";
    body = { url: target.href };
  } else {
    url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(options.voiceId)}?output_format=mp3_44100_128`;
    headers["xi-api-key"] = key;
    headers.Accept = "audio/mpeg";
    body = { text: input, model_id: options.model };
  }
  try {
    const response = await fetcher(url, { method: "POST", headers, body: JSON.stringify(body), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(25_000) });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw upstreamError(response.status);
    }
    const bytes = await readLimited(response, 5 * 1024 * 1024);
    if (id === "elevenlabs") {
      if (!response.headers.get("content-type")?.startsWith("audio/")) throw new ServiceConfigError("供应商未返回有效音频。", 502);
      return { content: bytes, contentType: "audio/mpeg", usage: `输入 ${input.length} 字符（非账单金额）` };
    }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (id === "tavily") {
      if (!Array.isArray(data.results)) throw new ServiceConfigError("供应商返回的搜索结果格式不正确。", 502);
      const credits = data.usage?.credits;
      return { content: JSON.stringify(data.results), contentType: "application/json", usage: typeof credits === "number" && Number.isFinite(credits) ? `${credits} credits` : null };
    }
    if (typeof data.data?.content !== "string" || !data.data.content.trim()) throw new ServiceConfigError("供应商未返回网页正文。", 502);
    const tokens = data.data.usage?.tokens;
    return { content: data.data.content, contentType: "text/plain", usage: typeof tokens === "number" && Number.isFinite(tokens) ? `${tokens} tokens` : null };
  } catch (error) {
    if (error instanceof ServiceConfigError) throw error;
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new ServiceConfigError("供应商请求超时，请稍后重试。", 504);
    // Never return fetch errors or upstream bodies: they may include credentials.
    throw new ServiceConfigError("连接失败或响应格式异常，请检查服务器网络和服务配置。", 502);
  }
}
