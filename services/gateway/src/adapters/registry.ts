import type { GatewayConfig } from "../config";
import type { ProtocolFamily } from "../types";
import { OpenAICompatibleAdapter, type FetchLike } from "./openai-compatible";
import type { GatewayAdapter } from "./types";

/** Map each protocol family to one explicit adapter. */
export class AdapterRegistry {
  private readonly adapters = new Map<ProtocolFamily, GatewayAdapter>();

  register(family: ProtocolFamily, adapter: GatewayAdapter): this {
    this.adapters.set(family, adapter);
    return this;
  }

  unregister(family: ProtocolFamily): this {
    this.adapters.delete(family);
    return this;
  }

  get(family: ProtocolFamily): GatewayAdapter | undefined {
    return this.adapters.get(family);
  }

  has(family: ProtocolFamily): boolean {
    return this.adapters.has(family);
  }

  capabilities(): Array<{ family: ProtocolFamily; adapterId: string }> {
    return [...this.adapters.entries()].map(([family, adapter]) => ({ family, adapterId: adapter.id }));
  }
}

/**
 * Every configured upstream gets a pass-through adapter. This adapter does no
 * protocol translation; it preserves the protocol selected by the route
 * catalog and can later be replaced per family by a translating adapter.
 */
export function createAdapterRegistry(
  config: GatewayConfig,
  fetchImpl: FetchLike = globalThis.fetch,
): AdapterRegistry {
  const registry = new AdapterRegistry();
  for (const [family, upstream] of Object.entries(config.upstreams) as Array<[
    ProtocolFamily,
    NonNullable<GatewayConfig["upstreams"][ProtocolFamily]>,
  ]>) {
    if (!upstream) continue;
    registry.register(
      family,
      new OpenAICompatibleAdapter({
        id: `${family}-compatible-proxy`,
        baseUrl: upstream.baseUrl,
        authorization: upstream.authorization,
        headers: upstream.headers,
        fetchImpl,
      }),
    );
  }
  return registry;
}
