import type {
  ConsoleApiErrorPayload,
  ConsoleApiKey,
  ConsoleOrganization,
  ConsoleOverview,
  ConsolePresetKind,
  ConsolePersonalityPreset,
  ConsolePresets,
  ConsoleTeam,
  ConsoleTeamMember,
  ConsoleToolPreset,
  ConsoleWalletDetails,
} from "./types";

export class ConsoleClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function json<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) throw new ConsoleClientError("服务没有返回内容", response.status);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ConsoleClientError("服务返回了无法识别的数据", response.status);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  if (!response.ok) {
    const error = await json<ConsoleApiErrorPayload>(response).catch(
      () => undefined,
    );
    throw new ConsoleClientError(
      error?.error || "请求未完成，请稍后重试。",
      response.status,
      error?.code,
    );
  }
  return json<T>(response);
}

export function getConsoleOverview() {
  return request<ConsoleOverview>("/api/console/overview", { cache: "no-store" });
}

export function getConsoleWallet() {
  return request<ConsoleWalletDetails>("/api/console/wallet", { cache: "no-store" });
}

export function listConsoleKeys(organizationId?: string | null) {
  return request<{ keys: ConsoleApiKey[]; organizations: ConsoleOrganization[] }>(
    `/api/console/keys${organizationQuery(organizationId)}`,
    { cache: "no-store" },
  );
}

export function createConsoleKey(input: {
  name: string;
  organizationId?: string | null;
  expiresAt?: string | null;
  quotaLimit?: number | null;
  modelScopes?: string[];
  ipAllowList?: string[];
}) {
  return request<{ key: ConsoleApiKey; secret: string }>("/api/console/keys", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function revokeConsoleKey(id: string) {
  return request<{ key: ConsoleApiKey }>(`/api/console/keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

function organizationQuery(organizationId?: string | null): string {
  return organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
}

export function getConsoleTeam(organizationId?: string | null) {
  return request<ConsoleTeam>(`/api/console/team${organizationQuery(organizationId)}`, { cache: "no-store" });
}

export function addConsoleTeamMember(input: {
  organizationId?: string | null;
  identifier: string;
  role: ConsoleTeamMember["role"];
}) {
  return request<{ member: ConsoleTeamMember }>("/api/console/team", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateConsoleTeamMember(
  userId: string,
  input: { organizationId?: string | null; role: ConsoleTeamMember["role"] },
) {
  return request<{ member: ConsoleTeamMember }>(`/api/console/team/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function removeConsoleTeamMember(userId: string, organizationId?: string | null) {
  return request<{ ok: true }>(`/api/console/team/${encodeURIComponent(userId)}${organizationQuery(organizationId)}`, {
    method: "DELETE",
  });
}

export function getConsolePresets(organizationId?: string | null) {
  return request<ConsolePresets>(`/api/console/presets${organizationQuery(organizationId)}`, { cache: "no-store" });
}

export function createConsolePreset(input: {
  kind: ConsolePresetKind;
  scope: "personal" | "organization";
  organizationId?: string | null;
  name: string;
  description?: string | null;
  instructions?: string;
  toolConfiguration?: Record<string, unknown>;
  isDefault?: boolean;
}) {
  return request<{ kind: ConsolePresetKind; preset: ConsolePersonalityPreset | ConsoleToolPreset }>("/api/console/presets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateConsolePreset(
  kind: ConsolePresetKind,
  id: string,
  input: {
    name?: string;
    description?: string | null;
    instructions?: string;
    toolConfiguration?: Record<string, unknown>;
    isDefault?: boolean;
  },
) {
  return request<{ preset: ConsolePersonalityPreset | ConsoleToolPreset }>(
    `/api/console/presets/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function setConsolePresetDefault(kind: ConsolePresetKind, id: string) {
  return request<{ preset: ConsolePersonalityPreset | ConsoleToolPreset }>(
    `/api/console/presets/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/default`,
    { method: "POST" },
  );
}

export function removeConsolePreset(kind: ConsolePresetKind, id: string) {
  return request<{ ok: true }>(`/api/console/presets/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
