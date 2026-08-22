import { getGatewayBaseUrl } from "@/lib/agent/provider/gateway";
import {
  buildCapabilityCatalog,
  type CapabilityCatalog,
} from "./capabilities";

type LoadCapabilityCatalogDeps = {
  fetchImpl?: typeof fetch;
  /** Test-only override; production reads the server environment. */
  baseUrl?: string;
  /**
   * Test-only override for the Bearer token used on /v1/models. Production
   * prefers the current user's Studio token, then service/legacy gateway
   * tokens, and finally the admin PAT for public fallback callers.
   */
  authToken?: string;
  /** @deprecated use authToken — retained for call-site compatibility. */
  internalToken?: string;
};

type GatewayCapabilitiesPayload = {
  configured?: Array<{ family?: unknown }>;
};

type GatewayModelsPayload = {
  data?: Array<{ id?: unknown }>;
};

type FamilyProbe = {
  reachable: boolean;
  families: Set<string>;
};

function configuredFamiliesFromModelIds(modelIds: readonly string[]): Set<string> {
  const families = new Set(["openai"]);
  const hasImageModel = modelIds.some((id) => /(^|[-_/])image([-_/]|$)/i.test(id));
  if (hasImageModel || process.env.REIZO_IMAGE_MODEL?.trim()) {
    families.add("images");
  }
  return families;
}

function joinGatewayPath(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function resolveAuthToken(deps: LoadCapabilityCatalogDeps): string {
  return (
    deps.authToken?.trim() ||
    deps.internalToken?.trim() ||
    process.env.REIZO_SERVICE_KEY?.trim() ||
    // Compatibility for local environments that still carry the pre-service-account token.
    process.env.REIZO_GATEWAY_TOKEN?.trim() ||
    process.env.NEW_API_ADMIN_TOKEN?.trim() ||
    ""
  );
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchConfiguredFamilies(
  baseUrl: string,
  fetchImpl: typeof fetch,
): Promise<FamilyProbe> {
  try {
    const response = await fetchImpl(joinGatewayPath(baseUrl, "/capabilities"), {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return { reachable: false, families: new Set() };

    const payload = (await safeJson(response)) as GatewayCapabilitiesPayload | null;
    // new-api serves its web app shell at /capabilities (HTTP 200), which is
    // not the gateway capability contract. Treat non-JSON/non-contract data as
    // an unavailable probe so the authenticated /v1/models fallback runs.
    if (!payload || !Array.isArray(payload.configured)) {
      return { reachable: false, families: new Set() };
    }
    const configured = Array.isArray(payload?.configured) ? payload.configured : [];
    const families = new Set(
      configured.flatMap((entry) => {
        const family = typeof entry?.family === "string" ? entry.family.trim() : "";
        return family ? [family] : [];
      }),
    );
    return { reachable: true, families };
  } catch {
    return { reachable: false, families: new Set() };
  }
}

async function fetchGatewayModelIds(
  baseUrl: string,
  authToken: string,
  fetchImpl: typeof fetch,
): Promise<string[]> {
  try {
    const headers: Record<string, string> = {};
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }
    const response = await fetchImpl(joinGatewayPath(baseUrl, "/v1/models"), {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return [];

    const payload = (await safeJson(response)) as GatewayModelsPayload | null;
    const data = Array.isArray(payload?.data) ? payload.data : [];
    return data.flatMap((entry) => {
      const id = typeof entry?.id === "string" ? entry.id.trim() : "";
      return id ? [id] : [];
    });
  } catch {
    return [];
  }
}

/**
 * Read gateway/new-api configuration only on the server and reduce it to public facts.
 * Deliberately swallow transport details so callers never receive endpoint or
 * credential-shaped error text.
 *
 * Base URL resolution matches Task 10 (`getGatewayBaseUrl`: REIZO_GATEWAY_URL →
 * NEW_API_URL → localhost). Model listing uses the current user's Studio token
 * or the configured gateway fallback token.
 */
export async function loadCapabilityCatalog(
  deps: LoadCapabilityCatalogDeps = {},
): Promise<CapabilityCatalog> {
  const baseUrl = deps.baseUrl ?? getGatewayBaseUrl();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const authToken = resolveAuthToken(deps);
  const familyProbe = await fetchConfiguredFamilies(baseUrl, fetchImpl);

  // new-api has no /capabilities endpoint. When the legacy probe fails, fall
  // through to /v1/models and treat a successful listing as openai-capable.
  if (!familyProbe.reachable) {
    const modelIds = await fetchGatewayModelIds(baseUrl, authToken, fetchImpl);
    if (modelIds.length === 0) {
      return buildCapabilityCatalog({
        configuredFamilies: [],
        modelIds: [],
        gatewayReachable: false,
      });
    }
    return buildCapabilityCatalog({
      configuredFamilies: configuredFamiliesFromModelIds(modelIds),
      modelIds,
    });
  }

  const modelIds = familyProbe.families.has("openai")
    ? await fetchGatewayModelIds(baseUrl, authToken, fetchImpl)
    : [];

  return buildCapabilityCatalog({
    configuredFamilies: familyProbe.families,
    modelIds,
  });
}
