import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import {
  apiKeyIdentity,
  extractApiKey,
  extractInternalIdentity,
  formatApiKey,
  hashApiKey,
  internalIdentity,
  safeSecretEqual,
  verifyApiKeyHash,
} from "./auth";
import { mergeGatewayConfig, readGatewayConfig, type GatewayConfig } from "./config";
import { createAdapterRegistry, AdapterRegistry } from "./adapters/registry";
import type { GatewayAdapterResponse } from "./adapters/types";
import { UpstreamProxyError } from "./adapters/types";
import { matchPublicRoute, PUBLIC_ROUTE_CATALOG } from "./routes";
import type { GatewayIdentity, ProtocolFamily } from "./types";
import { createPlatformGatewayIntegration } from "./platform";

declare module "fastify" {
  interface FastifyRequest {
    gatewayRequestId: string;
  }
}

export interface ApiKeyVerificationContext {
  requestId: string;
  family: ProtocolFamily;
  path: string;
  request: FastifyRequest;
}

export type ApiKeyValidatorResult = GatewayIdentity | boolean | null | undefined;
export type ApiKeyValidator = (
  rawApiKey: string,
  context: ApiKeyVerificationContext,
) => ApiKeyValidatorResult | Promise<ApiKeyValidatorResult>;

export interface GatewayUsageContext {
  requestId: string;
  family: ProtocolFamily;
  path: string;
  request: FastifyRequest;
  identity: GatewayIdentity;
}

export interface GatewayUsageReservation {
  /** Opaque to the server; owned by the accounting implementation. */
  id: string;
}

/**
 * Lets a deployment charge after the gateway has authenticated a caller while
 * keeping protocol adapters independent from wallet implementation details.
 */
export interface GatewayUsageAccounting {
  reserve(context: GatewayUsageContext): Promise<GatewayUsageReservation | null>;
  settle(
    reservation: GatewayUsageReservation,
    context: GatewayUsageContext,
    response: GatewayAdapterResponse,
  ): Promise<void>;
  reverse(
    reservation: GatewayUsageReservation,
    context: GatewayUsageContext,
    reason: "upstream_error" | "upstream_rejected",
  ): Promise<void>;
}

export interface GatewayServerOptions {
  config?: Partial<GatewayConfig>;
  env?: NodeJS.ProcessEnv;
  registry?: AdapterRegistry;
  apiKeyValidator?: ApiKeyValidator;
  usageAccounting?: GatewayUsageAccounting;
  logger?: boolean;
}

interface GatewayErrorBody {
  error: {
    type: string;
    code: string;
    message: string;
  };
  request_id: string;
}

function requestIdFromHeader(request: FastifyRequest): string {
  const candidate = request.headers["x-request-id"];
  const value = Array.isArray(candidate) ? candidate[0] : candidate;
  if (typeof value === "string" && /^[A-Za-z0-9._-]{8,128}$/.test(value)) return value;
  return randomUUID();
}

function requestPath(request: FastifyRequest): { pathname: string; pathWithQuery: string } {
  const raw = request.raw.url ?? request.url;
  const parsed = new URL(raw, "http://gateway.local");
  return { pathname: parsed.pathname, pathWithQuery: `${parsed.pathname}${parsed.search}` };
}

function errorBody(request: FastifyRequest, type: string, code: string, message: string): GatewayErrorBody {
  return {
    error: { type, code, message },
    request_id: request.gatewayRequestId,
  };
}

function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  type: string,
  code: string,
  message: string,
) {
  return reply.code(statusCode).type("application/json").send(errorBody(request, type, code, message));
}

function responseBody(body: GatewayAdapterResponse["body"]): Readable | undefined {
  if (!body) return undefined;
  if (typeof (body as unknown as { pipe?: unknown }).pipe === "function") return body as unknown as Readable;
  return Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
}

function incomingBody(request: FastifyRequest): Readable | string | Uint8Array | undefined {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  if (!request.raw.readableEnded) return request.raw;
  const body = request.body;
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string" || body instanceof Uint8Array) return body;
  return JSON.stringify(body);
}

function configuredApiKeyValidator(config: GatewayConfig): ApiKeyValidator | undefined {
  if (config.apiKeyHashes.length === 0) return undefined;
  return (rawApiKey) => {
    const matches = config.apiKeyHashes.some((expected) => verifyApiKeyHash(rawApiKey, expected));
    return matches;
  };
}

async function resolveIdentity(
  request: FastifyRequest,
  family: ProtocolFamily,
  path: string,
  config: GatewayConfig,
  validator: ApiKeyValidator | undefined,
): Promise<{ identity?: GatewayIdentity; statusCode?: number; code?: string; message?: string }> {
  const trustedStudioIdentity = extractInternalIdentity(request.headers, config.internalToken);
  if (trustedStudioIdentity) return { identity: internalIdentity(trustedStudioIdentity) };

  const extracted = extractApiKey(request.headers);
  if (!extracted) {
    return {
      statusCode: 401,
      code: "missing_api_key",
      message: "Provide a Bearer API key or x-api-key header",
    };
  }

  if (!validator && !config.allowUnverifiedApiKeys) {
    return {
      statusCode: 503,
      code: "api_key_verification_unavailable",
      message: "API key verification is not configured",
    };
  }

  let result: ApiKeyValidatorResult = true;
  if (validator) {
    result = await validator(extracted.value, {
      requestId: request.gatewayRequestId,
      family,
      path,
      request,
    });
  }
  if (!result) {
    return { statusCode: 401, code: "invalid_api_key", message: "The API key is invalid or inactive" };
  }

  const base = apiKeyIdentity(extracted);
  if (typeof result === "object") {
    return {
      identity: {
        ...base,
        ...result,
        source: "api-key",
        apiKeyDisplay: result.apiKeyDisplay ?? base.apiKeyDisplay,
        apiKeyHash: result.apiKeyHash ?? base.apiKeyHash,
      },
    };
  }
  return { identity: base };
}

function sendProxyResponse(reply: FastifyReply, response: GatewayAdapterResponse) {
  for (const [name, value] of Object.entries(response.headers)) reply.header(name, value);
  reply.code(response.statusCode);
  const body = responseBody(response.body);
  return body ? reply.send(body) : reply.send();
}

function corsOrigin(allowedOrigins: readonly string[]) {
  return async (origin: string | undefined): Promise<boolean> => {
    if (!origin) return true;
    return allowedOrigins.includes("*") || allowedOrigins.includes(origin);
  };
}

/**
 * Build a standalone HTTP gateway. It deliberately has no database dependency:
 * production callers must supply an API key validator or configured key hashes.
 */
export function buildGatewayServer(options: GatewayServerOptions = {}): FastifyInstance {
  const config = mergeGatewayConfig(readGatewayConfig(options.env), options.config);
  const registry = options.registry ?? createAdapterRegistry(config);
  const configuredValidator = configuredApiKeyValidator(config);
  const platformIntegration = !options.apiKeyValidator && !configuredValidator && config.usePlatformDatabase
    ? createPlatformGatewayIntegration(config)
    : undefined;
  const validator = options.apiKeyValidator ?? configuredValidator ?? platformIntegration?.apiKeyValidator;
  const usageAccounting = options.usageAccounting ?? platformIntegration?.usageAccounting;
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: config.bodyLimitBytes,
    trustProxy: config.trustedProxyIps,
  });

  // Proxy request streams instead of parsing JSON or multipart payloads first.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", (_request, _payload, done) => done(null));

  app.register(cors, {
    origin: corsOrigin(config.corsOrigins),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type", "x-api-key", "x-request-id"],
    exposedHeaders: ["x-request-id"],
  });

  app.addHook("onRequest", async (request, reply) => {
    request.gatewayRequestId = requestIdFromHeader(request);
    reply.header("x-request-id", request.gatewayRequestId);
  });

  const healthHandler = async (request: FastifyRequest) => ({
    status: "ok",
    service: "winlume-gateway",
    request_id: request.gatewayRequestId,
  });
  app.get("/healthz", healthHandler);
  app.get("/health", healthHandler);

  const readinessHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const capabilities = registry.capabilities();
    if (capabilities.length === 0) {
      return sendError(
        reply,
        request,
        503,
        "readiness_error",
        "no_adapter_configured",
        "No upstream adapter is configured",
      );
    }
    return {
      status: "ready",
      service: "winlume-gateway",
      adapters: capabilities,
      request_id: request.gatewayRequestId,
    };
  };
  app.get("/readyz", readinessHandler);
  app.get("/ready", readinessHandler);

  app.get("/capabilities", async (request) => ({
    configured: registry.capabilities(),
    catalog: PUBLIC_ROUTE_CATALOG.map(({ id, family, description, methods }) => ({
      id,
      family,
      description,
      methods,
    })),
    request_id: request.gatewayRequestId,
  }));

  app.route({
    method: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    url: "/*",
    handler: async (request, reply) => {
      const { pathname, pathWithQuery } = requestPath(request);
      const route = matchPublicRoute(pathname, request.method);
      if (!route) {
        return sendError(reply, request, 404, "not_found", "route_not_found", "The requested API route does not exist");
      }

      const adapter = registry.get(route.family);
      if (!adapter) {
        return sendError(
          reply,
          request,
          501,
          "capability_error",
          "capability_not_configured",
          `No adapter is configured for the ${route.family} protocol family`,
        );
      }

      let resolved;
      try {
        resolved = await resolveIdentity(request, route.family, pathWithQuery, config, validator);
      } catch (error) {
        request.log.error({ err: error, requestId: request.gatewayRequestId }, "API key validator failed");
        return sendError(
          reply,
          request,
          503,
          "authentication_error",
          "api_key_verification_failed",
          "API key verification is temporarily unavailable",
        );
      }
      if (!resolved.identity) {
        return sendError(
          reply,
          request,
          resolved.statusCode ?? 401,
          "authentication_error",
          resolved.code ?? "invalid_api_key",
          resolved.message ?? "API key authentication failed",
        );
      }

      const usageContext: GatewayUsageContext = {
        requestId: request.gatewayRequestId,
        family: route.family,
        path: pathWithQuery,
        request,
        identity: resolved.identity,
      };
      let reservation: GatewayUsageReservation | null = null;
      if (usageAccounting && resolved.identity.userId) {
        try {
          reservation = await usageAccounting.reserve(usageContext);
        } catch (error) {
          request.log.error({ err: error, requestId: request.gatewayRequestId }, "Gateway usage reservation failed");
          return sendError(
            reply,
            request,
            402,
            "billing_error",
            "usage_reservation_failed",
            "The request could not reserve available credits",
          );
        }
      }

      try {
        const response = await adapter.proxy({
          method: request.method,
          path: pathWithQuery,
          headers: request.headers,
          body: incomingBody(request),
          requestId: request.gatewayRequestId,
          identity: resolved.identity,
          route,
          signal: request.signal,
        });
        if (reservation && usageAccounting) {
          try {
            if (response.statusCode >= 200 && response.statusCode < 400) {
              await usageAccounting.settle(reservation, usageContext, response);
            } else {
              await usageAccounting.reverse(reservation, usageContext, "upstream_rejected");
            }
          } catch (error) {
            request.log.error({ err: error, requestId: request.gatewayRequestId }, "Gateway usage settlement failed");
            return sendError(
              reply,
              request,
              503,
              "billing_error",
              "usage_settlement_failed",
              "The request could not be billed safely",
            );
          }
        }
        return sendProxyResponse(reply, response);
      } catch (error) {
        if (reservation && usageAccounting) {
          try {
            await usageAccounting.reverse(reservation, usageContext, "upstream_error");
          } catch (billingError) {
            request.log.error({ err: billingError, requestId: request.gatewayRequestId }, "Gateway usage reversal failed");
          }
        }
        if (error instanceof UpstreamProxyError) {
          request.log.warn({ err: error, requestId: request.gatewayRequestId }, "Gateway upstream unavailable");
          return sendError(reply, request, 502, "upstream_error", error.code, "The configured upstream is unavailable");
        }
        request.log.error({ err: error, requestId: request.gatewayRequestId }, "Gateway adapter failed");
        return sendError(reply, request, 502, "upstream_error", "upstream_request_failed", "The upstream request failed");
      }
    },
  });

  app.setNotFoundHandler((request, reply) =>
    sendError(reply, request, 404, "not_found", "route_not_found", "The requested API route does not exist"),
  );
  app.setErrorHandler((error, request, reply) => {
    if (reply.sent) return;
    const candidate =
      typeof error === "object" && error !== null && "statusCode" in error
        ? (error as { statusCode?: unknown }).statusCode
        : undefined;
    const statusCode =
      typeof candidate === "number" && candidate >= 400 && candidate < 500 ? candidate : 500;
    request.log.error({ err: error, requestId: request.gatewayRequestId }, "Gateway request failed");
    return sendError(reply, request, statusCode, "gateway_error", "gateway_request_failed", "The gateway could not process this request");
  });

  return app;
}

export async function startGatewayServer(options: GatewayServerOptions = {}): Promise<FastifyInstance> {
  const config = mergeGatewayConfig(readGatewayConfig(options.env), options.config);
  const app = buildGatewayServer({ ...options, config });
  await app.listen({ host: config.host, port: config.port });
  return app;
}

/** Useful when integrating a database-backed verifier into the platform process. */
export function staticApiKeyIdentity(rawApiKey: string): GatewayIdentity {
  return {
    source: "api-key",
    apiKeyDisplay: formatApiKey(rawApiKey),
    apiKeyHash: hashApiKey(rawApiKey),
  };
}

/** Constant-time helper for a future internal token verifier. */
export function verifyInternalToken(expected: string | undefined, received: string | undefined): boolean {
  return safeSecretEqual(expected, received);
}
