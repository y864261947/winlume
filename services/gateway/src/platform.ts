import type { GatewayAdapterResponse } from "./adapters/types";
import type {
  ApiKeyValidator,
  GatewayUsageAccounting,
  GatewayUsageContext,
  GatewayUsageReservation,
} from "./server";
import type { GatewayConfig } from "./config";
import { getPlatformRepositories } from "../../../src/lib/platform/repositories";

type PlatformReservation = GatewayUsageReservation & {
  userId: string;
  idempotencyKey: string;
};

function asPlatformReservation(reservation: GatewayUsageReservation): PlatformReservation | null {
  const candidate = reservation as Partial<PlatformReservation>;
  if (!candidate.id || !candidate.userId || !candidate.idempotencyKey) return null;
  return candidate as PlatformReservation;
}

function requestModel(context: GatewayUsageContext): string {
  const header = context.request.headers["x-winlume-model"];
  const supplied = Array.isArray(header) ? header[0] : header;
  if (typeof supplied === "string" && supplied.trim() && supplied.length <= 255) return supplied.trim();
  return context.family;
}

function idempotencyKey(context: GatewayUsageContext): string {
  return `gateway:${context.requestId}`;
}

function assertAllowedKeyScope(
  scopes: readonly string[],
  family: GatewayUsageContext["family"],
): boolean {
  // Empty scopes retain the product default (all gateway families). Once an
  // owner adds scopes, restrict the key to exact family/route-style grants.
  if (scopes.length === 0) return true;
  return scopes.includes("*") || scopes.includes(family) || scopes.includes(`${family}:*`);
}

function isAllowedIp(allowlist: readonly string[], ip: string): boolean {
  return allowlist.length === 0 || allowlist.includes(ip);
}

function costForResponse(config: GatewayConfig, response: GatewayAdapterResponse): bigint {
  const configured = config.requestCostMicrocredits;
  const value = response.headers["x-winlume-cost-microcredits"]
    ?? response.headers["x-winlume-usage-cost-microcredits"];
  if (!value || !/^\d+$/.test(value.trim())) return configured;
  try {
    return BigInt(value.trim());
  } catch {
    return configured;
  }
}

/**
 * Build the database-backed implementation used by the standalone service.
 * The relative import keeps this service independently executable with tsx
 * while the platform schema remains the single source of truth.
 */
export function createPlatformGatewayIntegration(config: GatewayConfig): {
  apiKeyValidator: ApiKeyValidator;
  usageAccounting: GatewayUsageAccounting;
} | null {
  const repositories = getPlatformRepositories();
  if (!repositories) return null;

  const apiKeyValidator: ApiKeyValidator = async (rawApiKey, context) => {
    const key = await repositories.apiKeys.findActiveByPlaintext(rawApiKey);
    if (!key) return null;
    if (!assertAllowedKeyScope(key.scopes, context.family)) return null;
    if (!isAllowedIp(key.ipAllowlist, context.request.ip)) return null;
    return {
      source: "api-key",
      userId: key.userId,
      apiKeyId: key.id,
      organizationId: key.organizationId ?? undefined,
      apiKeyDisplay: key.keyPrefix,
      apiKeyHash: key.keyHash,
    };
  };

  const usageAccounting: GatewayUsageAccounting = {
    async reserve(context) {
      if (!context.identity.userId) return null;
      const key = idempotencyKey(context);
      const usage = await repositories.wallets.reserveUsage({
        userId: context.identity.userId,
        organizationId: context.identity.organizationId ?? null,
        apiKeyId: context.identity.apiKeyId ?? null,
        idempotencyKey: key,
        requestId: context.requestId,
        provider: "winlume-gateway",
        model: requestModel(context),
        costMicrocredits: config.reservationMicrocredits,
        metadata: {
          gatewayFamily: context.family,
          gatewayPath: context.path,
          apiKeyId: context.identity.apiKeyId ?? null,
        },
      });
      return { id: usage.usage.id, userId: context.identity.userId, idempotencyKey: key };
    },

    async settle(reservation, context, response) {
      const persisted = asPlatformReservation(reservation);
      if (!persisted) throw new Error("Invalid platform usage reservation.");
      await repositories.wallets.settleReservedUsage({
        userId: persisted.userId,
        idempotencyKey: persisted.idempotencyKey,
        costMicrocredits: costForResponse(config, response),
        requestId: context.requestId,
        model: requestModel(context),
      });
    },

    async reverse(reservation) {
      const persisted = asPlatformReservation(reservation);
      if (!persisted) return;
      await repositories.wallets.reverseReservedUsage({
        userId: persisted.userId,
        idempotencyKey: persisted.idempotencyKey,
      });
    },
  };

  return { apiKeyValidator, usageAccounting };
}
