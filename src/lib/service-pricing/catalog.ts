export const PRICE_REFERENCES = [
  { id: "elevenlabs-tts", provider: "ElevenLabs", model: "eleven_multilingual_v2", unit: "千字符", route: "Reizo 直连", usd: "0.10", source: "https://elevenlabs.io/pricing/api", note: "API 按量价格；套餐额度、税费与实际账单可能不同。" },
  { id: "groq-stt", provider: "Groq", model: "whisper-large-v3-turbo", unit: "音频小时", route: "New API", usd: "0.04", source: "https://console.groq.com/docs/speech-to-text", note: "每次请求最少按 10 秒计费；不是按转录文字 Token 计费。" },
  { id: "tavily-search", provider: "Tavily", model: "Tavily Search", unit: "credit", route: "Reizo 直连", usd: "0.008", source: "https://docs.tavily.com/documentation/api-credits", note: "按量价；基础搜索 1 credit/次，高级搜索 2 credits/次。月套餐单价不同。" },
  { id: "jina-reader", provider: "Jina", model: "Jina Reader", unit: "百万计费 Token", route: "Reizo 直连", usd: null, source: "https://jina.ai/reader/#pricing", note: "按输出 Token 计量，共享 Jina Token 余额；充值档位及旧版自动充值价格不同，需以账号购买页确认单价。" },
  { id: "jina-embedding", provider: "Jina", model: "jina-embeddings-v3", unit: "百万计费 Token", route: "New API", usd: null, source: "https://jina.ai/embeddings/#pricing", note: "按输入 Token 计量；官网使用共享 Token 充值方案，未核实到此账号适用的固定单价。" },
  { id: "jina-rerank", provider: "Jina", model: "jina-reranker-v2-base-multilingual", unit: "百万计费 Token", route: "New API", usd: null, source: "https://jina.ai/reranker/#pricing", note: "按服务报告的计费 Token 计量；不要把文档数直接当成 Token 数，单价待账号购买页确认。" },
  { id: "openrouter-embedding", provider: "OpenRouter", model: "openai/text-embedding-3-small", unit: "百万输入 Token", route: "New API", usd: "0.02", source: "https://openrouter.ai/openai/text-embedding-3-small/api", note: "模型输入单价；充值手续费及其他账户费用另计。" },
] as const;
export const REFERENCE_CHECKED_AT = "2026-09-22";
export type PriceId = typeof PRICE_REFERENCES[number]["id"];
export type PriceDraft = { id: PriceId; revision: number; cost: string | null; sale: string | null; costCurrency: "USD" | "CNY"; saleCurrency: "USD" | "CNY"; notes: string; updatedAt: string | null };
export function isPriceId(id: unknown): id is PriceId { return PRICE_REFERENCES.some(row => row.id === id); }
export function emptyPrice(id: PriceId): PriceDraft { return { id, revision: 0, cost: null, sale: null, costCurrency: "USD", saleCurrency: "USD", notes: "", updatedAt: null }; }
