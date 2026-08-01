import { getHeader } from "./auth";
import type { HeaderMap } from "./types";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const REQUEST_BLOCKED = new Set([
  ...HOP_BY_HOP,
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-connection",
  "host",
  "content-length",
  "x-api-key",
  "api-key",
  "new-api-user",
  "x-winlume-user",
  "x-winlume-user-id",
  "x-winlume-internal-token",
  "x-winlume-internal-user-id",
  "x-winlume-internal-identity",
  "x-winlume-internal-user",
  "forwarded",
  "via",
  "origin",
  "referer",
]);

const RESPONSE_BLOCKED = new Set([
  ...HOP_BY_HOP,
  "set-cookie",
  "content-length",
  "content-encoding",
  // The gateway owns this correlation id; an upstream must not replace it.
  "x-request-id",
]);

function entries(headers: HeaderMap | Headers): Array<[string, string]> {
  const values: Array<[string, string]> = [];
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    headers.forEach((value, key) => values.push([key.toLowerCase(), value]));
    return values;
  }
  for (const [key, value] of Object.entries(headers as Record<string, string | string[] | undefined>)) {
    if (Array.isArray(value)) {
      for (const item of value) values.push([key.toLowerCase(), item]);
    } else if (typeof value === "string") {
      values.push([key.toLowerCase(), value]);
    }
  }
  return values;
}

function safeValue(value: string): string | undefined {
  if (/[\r\n]/.test(value)) return undefined;
  if (value.length > 16 * 1024) return undefined;
  return value;
}

function connectionScopedHeaders(headers: HeaderMap | Headers): Set<string> {
  return new Set(
    entries(headers)
      .filter(([name]) => name === "connection")
      .flatMap(([, value]) => value.split(","))
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isBlocked(name: string, blocked: Set<string>): boolean {
  if (blocked.has(name)) return true;
  return name.startsWith("x-forwarded-") || name.startsWith("x-winlume-internal-");
}

/** Filter untrusted request headers before forwarding them to an upstream. */
export function filterRequestHeaders(headers: HeaderMap | Headers): Record<string, string> {
  const result: Record<string, string> = {};
  const connectionHeaders = connectionScopedHeaders(headers);
  for (const [name, rawValue] of entries(headers)) {
    if (connectionHeaders.has(name) || isBlocked(name, REQUEST_BLOCKED)) continue;
    const value = safeValue(rawValue);
    if (value === undefined) continue;
    result[name] = result[name] ? `${result[name]}, ${value}` : value;
  }
  return result;
}

/** Filter response headers so upstream transport metadata cannot escape. */
export function filterResponseHeaders(headers: Headers | HeaderMap): Record<string, string> {
  const result: Record<string, string> = {};
  const connectionHeaders = connectionScopedHeaders(headers);
  for (const [name, rawValue] of entries(headers)) {
    if (connectionHeaders.has(name) || isBlocked(name, RESPONSE_BLOCKED)) continue;
    const value = safeValue(rawValue);
    if (value === undefined) continue;
    result[name] = result[name] ? `${result[name]}, ${value}` : value;
  }
  return result;
}

/** Add an internal identity only after server-side authentication. */
export function addTrustedStudioIdentity(
  headers: Record<string, string>,
  userId: string | undefined,
): Record<string, string> {
  if (userId && !/[\r\n]/.test(userId)) headers["new-api-user"] = userId;
  return headers;
}

export function firstHeader(headers: HeaderMap | Headers, name: string): string | undefined {
  return getHeader(headers, name);
}
