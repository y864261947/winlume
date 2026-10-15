import { createHash, randomBytes, randomUUID } from "node:crypto";

export const DESKTOP_REQUEST_MS = 10 * 60_000;
export const DESKTOP_SESSION_MS = 30 * 24 * 60 * 60_000;
export const hashDesktopSecret = (value: string) => createHash("sha256").update(value).digest("hex");
export const desktopRequestId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function createDesktopGrant(now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const code = randomBytes(4).toString("hex").toUpperCase();
  const id = randomUUID();
  return {
    token, code: `${code.slice(0, 4)}-${code.slice(4)}`,
    row: { id, tokenHash: hashDesktopSecret(token), codeHash: hashDesktopSecret(code), expiresAt: new Date(now.getTime() + DESKTOP_REQUEST_MS) },
  };
}

export function desktopBearer(request: Request): string | null {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "");
  return match?.[1] ?? null;
}

export function desktopCodeHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().replace(/-/g, "").toUpperCase();
  return /^[0-9A-F]{8}$/.test(code) ? hashDesktopSecret(code) : null;
}

export function desktopWebOrigin(request: Request): string {
  const url = new URL(process.env.NEXTAUTH_URL || process.env.AUTH_URL || request.url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) throw new Error("Invalid desktop auth origin");
  return url.origin;
}

export function desktopUserIsValid(grant: { authVersion: number | null; expiresAt: Date }, user: { authVersion: number; status: string } | null, now = new Date()) {
  return grant.expiresAt > now && user?.status === "active" && user.authVersion === grant.authVersion;
}
