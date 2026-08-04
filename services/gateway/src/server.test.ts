import { afterEach, describe, expect, it, vi } from "vitest";
import { AdapterRegistry } from "./adapters/registry";
import { OpenAICompatibleAdapter, type FetchLike } from "./adapters/openai-compatible";
import { buildGatewayServer } from "./server";
import type { GatewayConfig } from "./config";

const baseConfig: GatewayConfig = {
  host: "127.0.0.1",
  port: 0,
  trustedProxyIps: ["127.0.0.1", "::1"],
  bodyLimitBytes: 1024 * 1024,
  corsOrigins: ["https://studio.example"],
  internalToken: "studio-internal-token",
  apiKeyHashes: [],
  allowUnverifiedApiKeys: false,
  usePlatformDatabase: false,
  reservationMicrocredits: BigInt(0),
  requestCostMicrocredits: BigInt(0),
  upstreams: {},
};

const apps: Array<ReturnType<typeof buildGatewayServer>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function buildOpenAiApp(fetchImpl: FetchLike) {
  const registry = new AdapterRegistry().register(
    "openai",
    new OpenAICompatibleAdapter({
      baseUrl: "https://upstream.example/base",
      authorization: "upstream-service-token",
      fetchImpl,
    }),
  );
  const app = buildGatewayServer({
    config: baseConfig,
    registry,
    apiKeyValidator: (key) => key === "wl_valid_key",
  });
  apps.push(app);
  return app;
}

async function readBody(body: unknown): Promise<string> {
  if (!body || typeof body !== "object" || !(Symbol.asyncIterator in body)) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

describe("gateway server", () => {
  it("publishes configured protocol family ids without upstream configuration", async () => {
    const app = buildOpenAiApp(vi.fn(async () => new Response("ok")) as FetchLike);

    const capabilities = await app.inject({ method: "GET", url: "/capabilities" });

    expect(capabilities.statusCode).toBe(200);
    expect(capabilities.json().configured).toContainEqual(
      expect.objectContaining({ family: "openai" }),
    );
    expect(capabilities.payload).not.toMatch(/authorization|upstream-service-token/i);
  });

  it("reports health and returns an explicit 501 for an unconfigured protocol family", async () => {
    const app = buildGatewayServer({ config: baseConfig });
    apps.push(app);

    const health = await app.inject({ method: "GET", url: "/healthz" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: "ok", service: "winlume-gateway" });
    expect(health.headers["x-request-id"]).toBeTruthy();

    const readiness = await app.inject({ method: "GET", url: "/readyz" });
    expect(readiness.statusCode).toBe(503);
    expect(readiness.json().error.code).toBe("no_adapter_configured");

    const unavailable = await app.inject({ method: "POST", url: "/v1/images/generations" });
    expect(unavailable.statusCode).toBe(501);
    expect(unavailable.json().error).toMatchObject({
      type: "capability_error",
      code: "capability_not_configured",
    });
  });

  it("streams an OpenAI-compatible response and filters caller-controlled sensitive headers", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = init?.headers;
      capturedBody = await readBody(init?.body);
      return new Response('data: {"delta":"hello"}\n\n', {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-upstream-id": "upstream-1",
          "x-request-id": "upstream-attempt-id",
          "set-cookie": "must-not-leak=true",
        },
      });
    }) as FetchLike;
    const app = buildOpenAiApp(fetchImpl);

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions?stream=true",
      headers: {
        authorization: "Bearer wl_valid_key",
        "content-type": "application/json",
        "new-api-user": "browser-spoof",
        "x-forwarded-for": "198.51.100.10",
        connection: "x-hop-by-hop",
        "x-hop-by-hop": "must-not-forward",
        "x-request-id": "request-12345678",
      },
      payload: JSON.stringify({ model: "gpt-test", stream: true }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.payload).toBe('data: {"delta":"hello"}\n\n');
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.headers["x-upstream-id"]).toBe("upstream-1");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.headers["x-request-id"]).toBe("request-12345678");
    expect(capturedUrl).toBe("https://upstream.example/base/v1/chat/completions?stream=true");
    expect(capturedBody).toBe(JSON.stringify({ model: "gpt-test", stream: true }));
    const headers = capturedHeaders as Record<string, string>;
    expect(headers.authorization).toBe("Bearer upstream-service-token");
    expect(headers["new-api-user"]).toBeUndefined();
    expect(headers["x-forwarded-for"]).toBeUndefined();
    expect(headers["x-hop-by-hop"]).toBeUndefined();
    expect(headers["x-request-id"]).toBe("request-12345678");
  });

  it("allows a Studio identity only with the internal token and maps it upstream", async () => {
    let headers: HeadersInit | undefined;
    const app = buildOpenAiApp(
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        headers = init?.headers;
        return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
      }) as FetchLike,
    );

    const accepted = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        "content-type": "application/json",
        "x-winlume-internal-token": "studio-internal-token",
        "x-winlume-internal-user-id": "authjs-user-7",
      },
      payload: "{}",
    });
    expect(accepted.statusCode).toBe(200);
    expect((headers as Record<string, string>)["new-api-user"]).toBe("authjs-user-7");

    const rejected = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        "content-type": "application/json",
        "new-api-user": "browser-spoof",
        "x-winlume-internal-token": "invalid",
        "x-winlume-internal-user-id": "browser-spoof",
      },
      payload: "{}",
    });
    expect(rejected.statusCode).toBe(401);
    expect(rejected.json().error.code).toBe("missing_api_key");
  });

  it("does not abort the upstream request when the incoming body finishes normally", async () => {
    let upstreamSignal: AbortSignal | undefined;
    const app = buildOpenAiApp(
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        upstreamSignal = init?.signal ?? undefined;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        });
      }) as FetchLike,
    );

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        authorization: "Bearer wl_valid_key",
        "content-type": "application/json",
      },
      payload: JSON.stringify({ model: "gpt-test", stream: true }),
    });

    expect(response.statusCode).toBe(200);
    expect(upstreamSignal).toBeDefined();
    expect(upstreamSignal?.aborted).toBe(false);
  });

  it("uses X-Forwarded-For only from a configured proxy", async () => {
    let receivedIp = "";
    const app = buildGatewayServer({
      config: baseConfig,
      registry: new AdapterRegistry().register(
        "openai",
        new OpenAICompatibleAdapter({
          baseUrl: "https://upstream.example",
          fetchImpl: vi.fn(async () => new Response(JSON.stringify({ ok: true }))) as FetchLike,
        }),
      ),
      apiKeyValidator: (_key, context) => {
        receivedIp = context.request.ip;
        return true;
      },
    });
    apps.push(app);

    const proxied = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      remoteAddress: "127.0.0.1",
      headers: {
        authorization: "Bearer wl_valid_key",
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.10",
      },
      payload: "{}",
    });
    expect(proxied.statusCode).toBe(200);
    expect(receivedIp).toBe("198.51.100.10");

    const direct = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      remoteAddress: "198.51.100.20",
      headers: {
        authorization: "Bearer wl_valid_key",
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.99",
      },
      payload: "{}",
    });
    expect(direct.statusCode).toBe(200);
    expect(receivedIp).toBe("198.51.100.20");
  });

  it("returns a safe 502 when the upstream transport fails and passes through upstream API errors", async () => {
    const failing = buildOpenAiApp(
      vi.fn(async () => {
        throw new Error("socket leaked secret details");
      }) as FetchLike,
    );
    const failed = await failing.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer wl_valid_key", "content-type": "application/json" },
      payload: "{}",
    });
    expect(failed.statusCode).toBe(502);
    expect(failed.json().error).toMatchObject({ code: "upstream_unavailable" });
    expect(failed.payload).not.toContain("secret details");

    const passthrough = buildOpenAiApp(
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: "model overloaded" } }), {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "3" },
        }),
      ) as FetchLike,
    );
    const upstreamError = await passthrough.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer wl_valid_key", "content-type": "application/json" },
      payload: "{}",
    });
    expect(upstreamError.statusCode).toBe(429);
    expect(upstreamError.json()).toEqual({ error: { message: "model overloaded" } });
    expect(upstreamError.headers["retry-after"]).toBe("3");
  });

  it("settles successful requests and reverses a reservation for upstream rejections", async () => {
    const reserve = vi.fn(async () => ({ id: "usage-1" }));
    const settle = vi.fn(async () => undefined);
    const reverse = vi.fn(async () => undefined);
    const registry = new AdapterRegistry().register(
      "openai",
      new OpenAICompatibleAdapter({
        baseUrl: "https://upstream.example",
        fetchImpl: vi.fn(async (_input: string | URL | Request) => {
          const parsed = new URL(String(_input));
          return parsed.pathname.endsWith("/rejected")
            ? new Response(JSON.stringify({ error: "blocked" }), { status: 429 })
            : new Response(JSON.stringify({ ok: true }), { status: 200 });
        }) as FetchLike,
      }),
    );
    const app = buildGatewayServer({
      config: baseConfig,
      registry,
      apiKeyValidator: () => ({ source: "api-key", userId: "user-1", apiKeyId: "key-1" }),
      usageAccounting: { reserve, settle, reverse },
    });
    apps.push(app);

    const success = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: "Bearer wl_valid_key", "content-type": "application/json" },
      payload: "{}",
    });
    expect(success.statusCode).toBe(200);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(reverse).not.toHaveBeenCalled();

    const rejected = await app.inject({
      method: "POST",
      url: "/v1/rejected",
      headers: { authorization: "Bearer wl_valid_key", "content-type": "application/json" },
      payload: "{}",
    });
    expect(rejected.statusCode).toBe(429);
    expect(reverse).toHaveBeenCalledTimes(1);
  });

  it("uses an allowlist for CORS preflight", async () => {
    const app = buildOpenAiApp(vi.fn(async () => new Response("ok")) as FetchLike);
    const accepted = await app.inject({
      method: "OPTIONS",
      url: "/v1/chat/completions",
      headers: {
        origin: "https://studio.example",
        "access-control-request-method": "POST",
      },
    });
    expect(accepted.statusCode).toBe(204);
    expect(accepted.headers["access-control-allow-origin"]).toBe("https://studio.example");

    const denied = await app.inject({
      method: "OPTIONS",
      url: "/v1/chat/completions",
      headers: {
        origin: "https://untrusted.example",
        "access-control-request-method": "POST",
      },
    });
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
