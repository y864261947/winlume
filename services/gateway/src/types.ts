import type { IncomingHttpHeaders } from "node:http";

/** Header values accepted by Node's HTTP server and the Fetch API. */
export type HeaderValue = string | string[] | undefined;
export type HeaderMap = IncomingHttpHeaders | Record<string, HeaderValue>;

export const PROTOCOL_FAMILIES = [
  "openai",
  "claude",
  "gemini",
  "images",
  "audio",
  "embeddings",
  "realtime",
  "task",
  "midjourney",
  "suno",
  "video",
] as const;

export type ProtocolFamily = (typeof PROTOCOL_FAMILIES)[number];

export type GatewayIdentitySource = "api-key" | "studio-internal";

export interface GatewayIdentity {
  source: GatewayIdentitySource;
  /** The user id is populated only for a validated Studio identity header. */
  userId?: string;
  /** Persisted platform key id. Never derived from a caller-supplied header. */
  apiKeyId?: string;
  /** Workspace ownership attached to a validated platform key, when present. */
  organizationId?: string;
  /** A display-safe API key representation. Never store the raw key here. */
  apiKeyDisplay?: string;
  /** SHA-256 digest of the API key, when the request used one. */
  apiKeyHash?: string;
}

export interface ProtocolRouteDefinition {
  id: string;
  family: ProtocolFamily;
  description: string;
  methods: readonly string[];
  matches(pathname: string): boolean;
}
