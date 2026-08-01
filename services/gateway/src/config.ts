import { PROTOCOL_FAMILIES, type HeaderMap, type ProtocolFamily } from "./types";

export interface GatewayUpstreamConfig {
  baseUrl: string;
  /** Optional service credential. It is never exposed in logs or responses. */
  authorization?: string;
  headers?: Record<string, string>;
}

export interface GatewayConfig {
  host: string;
  port: number;
  /** IPs/CIDRs allowed to provide client identity through X-Forwarded-For. */
  trustedProxyIps: string[];
  bodyLimitBytes: number;
  corsOrigins: string[];
  internalToken?: string;
  apiKeyHashes: string[];
  allowUnverifiedApiKeys: boolean;
  /** Prefer the platform PostgreSQL API-key store when DATABASE_URL is set. */
  usePlatformDatabase: boolean;
  /** Fixed preauthorization amount per eligible request, in microcredits. */
  reservationMicrocredits: bigint;
  /** Fixed settlement amount per successful eligible request, in microcredits. */
  requestCostMicrocredits: bigint;
  upstreams: Partial<Record<ProtocolFamily, GatewayUpstreamConfig>>;
}

function firstNonEmpty(env: NodeJS.ProcessEnv, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeBigInt(value: string | undefined, fallback: bigint): bigint {
  if (!value) return fallback;
  if (!/^\d+$/.test(value.trim())) return fallback;
  try {
    return BigInt(value.trim());
  } catch {
    return fallback;
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeBaseUrl(value: string, envName: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${envName} must be an absolute URL`);
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error(`${envName} must use http or https`);
  }
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function authorizationForFamily(env: NodeJS.ProcessEnv, family: ProtocolFamily): string | undefined {
  const suffix = family.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return firstNonEmpty(env, [
    `WINLUME_GATEWAY_${suffix}_UPSTREAM_AUTHORIZATION`,
    `WINLUME_GATEWAY_${suffix}_UPSTREAM_API_KEY`,
    "WINLUME_GATEWAY_UPSTREAM_AUTHORIZATION",
    "WINLUME_GATEWAY_UPSTREAM_API_KEY",
    "WINLUME_GATEWAY_UPSTREAM_TOKEN",
  ]);
}

function upstreamFor(
  env: NodeJS.ProcessEnv,
  family: ProtocolFamily,
  sharedOpenAiUrl: string | undefined,
): GatewayUpstreamConfig | undefined {
  const suffix = family.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const familyUrl = firstNonEmpty(env, [
    `WINLUME_GATEWAY_${suffix}_UPSTREAM_URL`,
    `WINLUME_GATEWAY_${suffix}_BASE_URL`,
  ]);
  const baseUrl = familyUrl ?? ((["openai", "images", "audio", "embeddings", "realtime"] as string[]).includes(family) ? sharedOpenAiUrl : undefined);
  if (!baseUrl) return undefined;
  return {
    baseUrl: normalizeBaseUrl(baseUrl, familyUrl ? `WINLUME_GATEWAY_${suffix}_UPSTREAM_URL` : "WINLUME_GATEWAY_UPSTREAM_URL"),
    authorization: authorizationForFamily(env, family),
  };
}

/**
 * Read gateway-only runtime configuration. The gateway intentionally does not
 * fall back to NEW_API_URL: that host may be retired after migration.
 */
export function readGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const sharedOpenAiUrl = firstNonEmpty(env, [
    "WINLUME_GATEWAY_OPENAI_UPSTREAM_URL",
    "WINLUME_GATEWAY_OPENAI_BASE_URL",
    "WINLUME_GATEWAY_UPSTREAM_URL",
    "WINLUME_GATEWAY_BASE_URL",
  ]);
  const upstreams: Partial<Record<ProtocolFamily, GatewayUpstreamConfig>> = {};
  for (const family of PROTOCOL_FAMILIES) {
    const upstream = upstreamFor(env, family, sharedOpenAiUrl);
    if (upstream) upstreams[family] = upstream;
  }
  const trustedProxyIps = parseList(firstNonEmpty(env, ["WINLUME_GATEWAY_TRUSTED_PROXY_IPS"]));

  return {
    host: firstNonEmpty(env, ["WINLUME_GATEWAY_HOST"]) ?? "127.0.0.1",
    port: parsePositiveInteger(firstNonEmpty(env, ["WINLUME_GATEWAY_PORT"]), 4010),
    trustedProxyIps: trustedProxyIps.length > 0 ? trustedProxyIps : ["127.0.0.1", "::1"],
    bodyLimitBytes: parsePositiveInteger(firstNonEmpty(env, ["WINLUME_GATEWAY_BODY_LIMIT_BYTES"]), 50 * 1024 * 1024),
    corsOrigins: parseList(firstNonEmpty(env, ["WINLUME_GATEWAY_CORS_ORIGINS"])),
    internalToken: firstNonEmpty(env, ["WINLUME_GATEWAY_INTERNAL_TOKEN", "WINLUME_GATEWAY_STUDIO_TOKEN"]),
    apiKeyHashes: parseList(firstNonEmpty(env, ["WINLUME_GATEWAY_API_KEY_HASHES"])),
    allowUnverifiedApiKeys: parseBoolean(env.WINLUME_GATEWAY_ALLOW_UNVERIFIED_KEYS, false),
    usePlatformDatabase: parseBoolean(env.WINLUME_GATEWAY_USE_PLATFORM_DATABASE, Boolean(env.DATABASE_URL?.trim())),
    reservationMicrocredits: parseNonNegativeBigInt(env.WINLUME_GATEWAY_RESERVATION_MICROCREDITS, BigInt(0)),
    requestCostMicrocredits: parseNonNegativeBigInt(env.WINLUME_GATEWAY_REQUEST_COST_MICROCREDITS, BigInt(0)),
    upstreams,
  };
}

/** Merge test/deployment overrides without losing unrelated parsed settings. */
export function mergeGatewayConfig(
  base: GatewayConfig,
  override: Partial<GatewayConfig> = {},
): GatewayConfig {
  return {
    ...base,
    ...override,
    corsOrigins: override.corsOrigins ?? [...base.corsOrigins],
    apiKeyHashes: override.apiKeyHashes ?? [...base.apiKeyHashes],
    upstreams: {
      ...base.upstreams,
      ...(override.upstreams ?? {}),
    },
  };
}

/** Keep this type export close to configuration for callers building adapters. */
export type GatewayHeaderMap = HeaderMap;
