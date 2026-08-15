import { AliyunViapiProvider } from "./aliyun-viapi";
import { ToolProviderError, type ToolCapabilityId, type ToolInvocationInput, type ToolInvocationResult, type ToolProvider } from "./types";

const PROVIDERS: readonly ToolProvider[] = [new AliyunViapiProvider()];

/**
 * The direct tool executor resolves capabilities through this registry. A
 * second vendor can be added here without changing any tool page or executor.
 */
export async function invokeToolCapability(
  capability: ToolCapabilityId,
  input: ToolInvocationInput,
): Promise<ToolInvocationResult> {
  const provider = PROVIDERS.find((candidate) => candidate.capabilities.includes(capability));
  if (!provider) {
    throw new ToolProviderError("configuration", "该图片工具尚未配置服务。");
  }
  return provider.invoke(capability, input);
}
