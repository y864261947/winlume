export class NewApiTeamError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "NewApiTeamError";
  }
}

function baseUrl(): string {
  const configured = process.env.NEW_API_URL?.trim();
  if (!configured) throw new Error("NEW_API_URL is not configured.");
  return configured.replace(/\/+$/, "");
}

interface NewApiEnvelope<T> {
  success?: boolean;
  code?: boolean;
  message?: string;
  data?: T;
}

/**
 * Parse a new-api JSON envelope.
 * Success-only responses (no `data`) are allowed; callers that need a payload
 * must check for undefined (login / token create / revoke return success only).
 */
async function parseEnvelope<T>(response: Response): Promise<T | undefined> {
  const text = await response.text();
  let payload: NewApiEnvelope<T>;
  try {
    payload = JSON.parse(text) as NewApiEnvelope<T>;
  } catch {
    throw new NewApiTeamError(`new-api returned non-JSON response (${response.status})`, response.status);
  }
  const ok = payload.success ?? payload.code ?? false;
  if (!response.ok || !ok) {
    throw new NewApiTeamError(payload.message || `new-api request failed (${response.status})`, response.status);
  }
  return payload.data;
}

function requireData<T>(data: T | undefined, status: number): T {
  if (data === undefined) throw new NewApiTeamError("new-api returned no data", status);
  return data;
}

/** Logs in as the team's new-api user, then mints and returns a fresh PAT for it. */
export async function loginAndMintPat(username: string, password: string): Promise<string> {
  const loginResponse = await fetch(`${baseUrl()}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  });
  const setCookie = loginResponse.headers.get("set-cookie");
  await parseEnvelope(loginResponse);
  if (!setCookie) throw new NewApiTeamError("new-api login did not return a session cookie", loginResponse.status);
  const sessionCookie = setCookie.split(";")[0];

  const patResponse = await fetch(`${baseUrl()}/api/user/self/token`, {
    method: "GET",
    headers: { Cookie: sessionCookie },
    cache: "no-store",
  });
  return requireData(await parseEnvelope<string>(patResponse), patResponse.status);
}

function teamHeaders(pat: string): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${pat}` };
}

export async function createTeamToken(pat: string, name: string): Promise<void> {
  const response = await fetch(`${baseUrl()}/api/token/`, {
    method: "POST",
    headers: teamHeaders(pat),
    body: JSON.stringify({
      name,
      group: "default",
      remain_quota: 0,
      unlimited_quota: true,
      expired_time: -1,
    }),
    cache: "no-store",
  });
  await parseEnvelope(response);
}

export async function findTeamTokenIdByName(pat: string, name: string): Promise<number | null> {
  const response = await fetch(`${baseUrl()}/api/token/search?keyword=${encodeURIComponent(name)}`, {
    method: "GET",
    headers: teamHeaders(pat),
    cache: "no-store",
  });
  const data = requireData(
    await parseEnvelope<{ items: { id: number; name: string }[] }>(response),
    response.status,
  );
  return data.items.find((item) => item.name === name)?.id ?? null;
}

export async function fetchTeamTokenKey(pat: string, tokenId: number): Promise<string> {
  const response = await fetch(`${baseUrl()}/api/token/${tokenId}/key`, {
    method: "POST",
    headers: teamHeaders(pat),
    cache: "no-store",
  });
  const data = requireData(await parseEnvelope<{ key: string }>(response), response.status);
  return `sk-${data.key}`;
}

export async function revokeTeamToken(pat: string, tokenId: number): Promise<void> {
  const response = await fetch(`${baseUrl()}/api/token/${tokenId}`, {
    method: "DELETE",
    headers: teamHeaders(pat),
    cache: "no-store",
  });
  await parseEnvelope(response);
}

export async function getTokenUsage(
  tokenSk: string,
): Promise<{ totalGranted: number; totalUsed: number; totalAvailable: number }> {
  const response = await fetch(`${baseUrl()}/api/usage/token/`, {
    method: "GET",
    headers: { Authorization: `Bearer ${tokenSk}` },
    cache: "no-store",
  });
  const data = requireData(
    await parseEnvelope<{ total_granted: number; total_used: number; total_available: number }>(response),
    response.status,
  );
  return {
    totalGranted: data.total_granted,
    totalUsed: data.total_used,
    totalAvailable: data.total_available,
  };
}
