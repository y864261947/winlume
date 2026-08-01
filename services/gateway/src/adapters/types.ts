import type { Readable } from "node:stream";
import type { GatewayIdentity, HeaderMap, ProtocolRouteDefinition } from "../types";

export type GatewayRequestBody = Readable | Uint8Array | string | undefined;

export interface GatewayAdapterRequest {
  method: string;
  /** Request pathname plus query string, for example /v1/chat/completions?stream=true. */
  path: string;
  headers: HeaderMap;
  body: GatewayRequestBody;
  requestId: string;
  identity: GatewayIdentity;
  route: ProtocolRouteDefinition;
  signal?: AbortSignal;
}

export interface GatewayAdapterResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: ReadableStream<Uint8Array> | null;
}

export interface GatewayAdapter {
  readonly id: string;
  proxy(request: GatewayAdapterRequest): Promise<GatewayAdapterResponse>;
}

export class UpstreamProxyError extends Error {
  readonly code = "upstream_unavailable";

  constructor(message = "The configured upstream could not be reached", options?: ErrorOptions) {
    super(message, options);
    this.name = "UpstreamProxyError";
  }
}
