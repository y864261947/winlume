import { describe, expect, it } from "vitest";
import { readGatewayConfig } from "./config";

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

describe("gateway environment configuration", () => {
  it("uses dedicated upstream variables and never falls back to NEW_API_URL", () => {
    const config = readGatewayConfig(env({
      NEW_API_URL: "https://retired-new-api.example",
      WINLUME_GATEWAY_OPENAI_BASE_URL: "https://provider.example/v1/",
      WINLUME_GATEWAY_OPENAI_UPSTREAM_API_KEY: "provider-key",
      WINLUME_GATEWAY_CORS_ORIGINS: "https://studio.example, https://console.example",
      WINLUME_GATEWAY_INTERNAL_TOKEN: "internal",
    }));
    expect(config.upstreams.openai).toEqual({
      baseUrl: "https://provider.example/v1",
      authorization: "provider-key",
    });
    expect(config.upstreams.images?.baseUrl).toBe("https://provider.example/v1");
    expect(config.upstreams.claude).toBeUndefined();
    expect(config.corsOrigins).toEqual(["https://studio.example", "https://console.example"]);
    expect(config.internalToken).toBe("internal");
    expect(config.trustedProxyIps).toEqual(["127.0.0.1", "::1"]);
  });

  it("uses an explicit trusted proxy allowlist when configured", () => {
    const config = readGatewayConfig(env({
      WINLUME_GATEWAY_TRUSTED_PROXY_IPS: "127.0.0.1, 10.0.0.0/8",
    }));
    expect(config.trustedProxyIps).toEqual(["127.0.0.1", "10.0.0.0/8"]);
  });

  it("rejects non-http upstream URLs", () => {
    expect(() =>
      readGatewayConfig(env({ WINLUME_GATEWAY_OPENAI_UPSTREAM_URL: "file:///tmp/provider" })),
    ).toThrow(/must use http or https/);
  });
});
