import { getGatewayBaseUrl } from "@/lib/agent/provider/gateway";
import {
  buildCapabilityCatalog,
  type CapabilityCatalog,
} from "./capabilities";

type LoadCapabilityCatalogDeps = {
  fetchImpl?: typeof fetch;
  /** Test-only override; production reads the server environment. */
  baseUrl?: string;
  /** Test-only override; production reads the server environment. */
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

function joinGatewayPath(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
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
    });
    if (!response.ok) return { reachable: false, families: new Set() };

    const payload = (await safeJson(response)) as GatewayCapabilitiesPayload | null;
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
  internalToken: string,
  fetchImpl: typeof fetch,
): Promise<string[]> {
  if (!internalToken) return [];

  try {
    const response = await fetchImpl(joinGatewayPath(baseUrl, "/v1/models"), {
      headers: { "x-reizo-internal-token": internalToken },
      cache: "no-store",
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
 * Read gateway configuration only on the server and reduce it to public facts.
 * Deliberately swallow transport details so callers never receive endpoint or
 * credential-shaped error text.
 */
export async function loadCapabilityCatalog(
  deps: LoadCapabilityCatalogDeps = {},
): Promise<CapabilityCatalog> {
  const baseUrl = deps.baseUrl ?? getGatewayBaseUrl();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const familyProbe = await fetchConfiguredFamilies(baseUrl, fetchImpl);

  if (!familyProbe.reachable) {
    return buildCapabilityCatalog({
      configuredFamilies: [],
      modelIds: [],
      gatewayReachable: false,
    });
  }

  const internalToken =
    deps.internalToken ?? process.env.REIZO_GATEWAY_INTERNAL_TOKEN?.trim() ?? "";
  const modelIds = familyProbe.families.has("openai")
    ? await fetchGatewayModelIds(baseUrl, internalToken, fetchImpl)
    : [];

  return buildCapabilityCatalog({
    configuredFamilies: familyProbe.families,
    modelIds,
  });
}
