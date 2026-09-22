/** Safe to import in the browser. Credentials never belong in this catalog. */
export const SERVICE_DEFINITIONS = [
  { id: "tavily", name: "Tavily", capability: "联网搜索", description: "搜索网页，获取标题、链接与内容摘要。", endpoint: "https://api.tavily.com/search", keyUrl: "https://app.tavily.com/", testDescription: "执行一次基础搜索，可能消耗供应商额度。" },
  { id: "jina-reader", name: "Jina Reader", capability: "网页读取", description: "将网页正文转换为适合模型阅读的文本。", endpoint: "https://r.jina.ai", keyUrl: "https://jina.ai/reader/", testDescription: "读取 example.com 示例网页，可能消耗供应商额度。" },
  { id: "elevenlabs", name: "ElevenLabs", capability: "语音合成", description: "将文字转换为语音，支持选择模型和音色。", endpoint: "https://api.elevenlabs.io/v1/text-to-speech", keyUrl: "https://elevenlabs.io/app/settings/api-keys", testDescription: "合成一句中文测试语音，可能消耗供应商额度。" },
] as const;

export type ServiceId = typeof SERVICE_DEFINITIONS[number]["id"];
export function isServiceId(value: unknown): value is ServiceId {
  return SERVICE_DEFINITIONS.some((service) => service.id === value);
}
export type ServiceOptions = { model: string; voiceId: string };
export const DEFAULT_SERVICE_OPTIONS: ServiceOptions = { model: "eleven_multilingual_v2", voiceId: "JBFqnCBsd6RMkjVDRZzb" };
export type ProbeResult = {
  at: string;
  revision: number;
  ok: boolean;
  latencyMs: number;
  message: string;
  usage: string | null;
};
export type PublicServiceConfig = {
  id: ServiceId;
  enabled: boolean;
  hasKey: boolean;
  revision: number;
  options: ServiceOptions;
  updatedAt: string | null;
  tests: ProbeResult[];
};
