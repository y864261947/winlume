import { callProvider } from "./adapters";
import { SERVICE_DEFINITIONS, type ProbeResult, type ServiceId } from "./catalog";
import { publicConfig, serviceKey, ServiceConfigError, updateConfig } from "./config";
import { changeService, readService } from "./store";

export async function listServices() {
  return Promise.all(SERVICE_DEFINITIONS.map(async ({ id }) => publicConfig(await readService(id))));
}
export async function saveService(id: ServiceId, input: unknown) {
  return publicConfig(await changeService(id, (current) => updateConfig(current, input)));
}

/** Internal entry point. Callers must implement their own user authorization and billing. */
export async function executeService(id: ServiceId, input: string) {
  const config = await readService(id);
  if (!config.enabled) throw new ServiceConfigError("该服务尚未启用。", 409);
  return callProvider(id, serviceKey(config), config.options, input);
}

export async function testService(id: ServiceId, revision: number) {
  const config = await changeService(id, (current) => {
    if (current.revision !== revision) throw new ServiceConfigError("配置已更新，请刷新后测试。", 409);
    serviceKey(current);
    if (current.lastTestStartedAt && Date.now() - Date.parse(current.lastTestStartedAt) < 30_000) throw new ServiceConfigError("请间隔 30 秒再测试。", 429);
    return { ...current, lastTestStartedAt: new Date().toISOString() };
  });
  const started = Date.now();
  let result: ProbeResult;
  try {
    const input = id === "tavily" ? "Reizo API" : id === "jina-reader" ? "https://example.com" : "你好，语音服务连接成功。";
    const output = await callProvider(id, serviceKey(config), config.options, input);
    result = { at: new Date().toISOString(), revision, ok: true, latencyMs: Date.now() - started, message: "实际接口调用成功。", usage: output.usage };
  } catch (error) {
    result = { at: new Date().toISOString(), revision, ok: false, latencyMs: Date.now() - started, message: error instanceof ServiceConfigError ? error.message : "测试失败，请检查服务配置。", usage: null };
  }
  const saved = await changeService(id, (current) => ({ ...current, tests: [result, ...current.tests].slice(0, 10) }));
  return { service: publicConfig(saved), result };
}
