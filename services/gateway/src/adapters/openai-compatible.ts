import { filterRequestHeaders, filterResponseHeaders, addTrustedStudioIdentity } from "../headers";
import type { GatewayAdapter, GatewayAdapterRequest, GatewayAdapterResponse } from "./types";
import { UpstreamProxyError } from "./types";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface OpenAICompatibleAdapterOptions {
  id?: string;
  baseUrl: string;
  /** A raw API key or a complete Authorization header value. */
  authorization?: string;
  headers?: Record<string, string>;
  fetchImpl?: FetchLike;
}

function normalizeAuthorization(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return /^[A-Za-z][A-Za-z0-9-]*\s+/.test(trimmed) ? trimmed : `Bearer ${trimmed}`;
}

/**
 * Resolve an upstream URL without allowing a request to replace its origin.
 * A base URL ending in /v1 may be used with regular /v1 client paths.
 */
export function joinUpstreamUrl(baseUrl: string, requestPath: string): URL {
  const base = new URL(baseUrl);
  const incoming = new URL(requestPath, "http://gateway.local");
  const basePath = base.pathname.replace(/\/+$/, "") || "/";
  const incomingPath = incoming.pathname;

  if (basePath === "/") {
    base.pathname = incomingPath;
  } else if (incomingPath === basePath || incomingPath.startsWith(`${basePath}/`)) {
    base.pathname = incomingPath;
  } else if (basePath.endsWith("/v1") && incomingPath.startsWith("/v1/")) {
    base.pathname = `${basePath}${incomingPath.slice(3)}`;
  } else {
    base.pathname = `${basePath}/${incomingPath.replace(/^\/+/, "")}`;
  }
  base.search = incoming.search;
  base.hash = "";
  return base;
}

function isBodyAllowed(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

/** A transparent Fetch-based reverse proxy for OpenAI-compatible HTTP APIs. */
export class OpenAICompatibleAdapter implements GatewayAdapter {
  readonly id: string;
  private readonly baseUrl: string;
  private readonly authorization?: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: FetchLike;

  constructor(options: OpenAICompatibleAdapterOptions) {
    this.id = options.id ?? "openai-compatible-proxy";
    this.baseUrl = options.baseUrl;
    this.authorization = normalizeAuthorization(options.authorization);
    this.headers = { ...(options.headers ?? {}) };
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async proxy(request: GatewayAdapterRequest): Promise<GatewayAdapterResponse> {
    const headers = filterRequestHeaders(request.headers);
    headers["x-request-id"] = request.requestId;
    Object.assign(headers, this.headers);
    if (this.authorization) headers.authorization = this.authorization;
    if (request.identity.source === "studio-internal") {
      addTrustedStudioIdentity(headers, request.identity.userId);
    }

    const init: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      redirect: "manual",
      signal: request.signal,
    };
    if (request.body && isBodyAllowed(request.method)) {
      init.body = request.body as unknown as BodyInit;
      // Node requires duplex for an IncomingMessage/Readable request body.
      init.duplex = "half";
    }

    let response: Response;
    try {
      response = await this.fetchImpl(joinUpstreamUrl(this.baseUrl, request.path), init);
    } catch (error) {
      throw new UpstreamProxyError("The configured upstream could not be reached", { cause: error });
    }

    return {
      statusCode: response.status,
      headers: filterResponseHeaders(response.headers),
      body: response.body,
    };
  }
}
