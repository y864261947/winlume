import { z } from "zod";
import { decryptSecret, encryptSecret } from "@/lib/newapi/crypto";
import { DEFAULT_SERVICE_OPTIONS, type ProbeResult, type PublicServiceConfig, type ServiceId, type ServiceOptions } from "./catalog";

export class ServiceConfigError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export type StoredServiceConfig = {
  id: ServiceId;
  enabled: boolean;
  keyCiphertext: string | null;
  revision: number;
  options: ServiceOptions;
  updatedAt: string | null;
  lastTestStartedAt: string | null;
  tests: ProbeResult[];
};
export const configInput = z.object({
  revision: z.number().int().nonnegative(),
  enabled: z.boolean(),
  apiKey: z.string().trim().max(4096).refine((s) => !/[\s\x00-\x1f\x7f]/.test(s), "Key 不能包含空白或控制字符。").optional(),
  clearKey: z.boolean().optional(),
  options: z.object({ model: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), voiceId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) }).strict(),
}).strict();

export function emptyConfig(id: ServiceId): StoredServiceConfig {
  return { id, enabled: false, keyCiphertext: null, revision: 0, options: { ...DEFAULT_SERVICE_OPTIONS }, updatedAt: null, lastTestStartedAt: null, tests: [] };
}
export function publicConfig(config: StoredServiceConfig): PublicServiceConfig {
  // Explicit allow-list: never serialize a database row or an encrypted key.
  return { id: config.id, enabled: config.enabled, hasKey: Boolean(config.keyCiphertext), revision: config.revision, options: config.options, updatedAt: config.updatedAt, tests: config.tests };
}
export function updateConfig(current: StoredServiceConfig, raw: unknown): StoredServiceConfig {
  const parsed = configInput.safeParse(raw);
  if (!parsed.success) throw new ServiceConfigError("配置格式不正确，请检查 Key、模型和音色 ID。");
  const input = parsed.data;
  if (input.revision !== current.revision) throw new ServiceConfigError("配置已被更新，请刷新后重试。", 409);
  if (input.clearKey && input.apiKey) throw new ServiceConfigError("清除 Key 与更换 Key 不能同时操作。");
  const keyCiphertext = input.clearKey ? null : input.apiKey ? encryptSecret(input.apiKey) : current.keyCiphertext;
  if (input.enabled && !keyCiphertext) throw new ServiceConfigError("请先保存 API Key，再启用服务。");
  return { ...current, enabled: input.enabled, keyCiphertext, options: input.options, revision: current.revision + 1, updatedAt: new Date().toISOString() };
}
export function serviceKey(config: StoredServiceConfig): string {
  if (!config.keyCiphertext) throw new ServiceConfigError("请先保存 API Key。");
  try { return decryptSecret(config.keyCiphertext); }
  catch { throw new ServiceConfigError("无法解密 API Key，请检查服务器加密密钥或重新保存 Key。", 503); }
}
