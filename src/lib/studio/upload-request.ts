import type { NextRequest } from "next/server";

/** Decodes and validates the `x-reizo-artifact-name` header shared by artifact upload routes. */
export function parseArtifactName(value: string | null): string | null {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value).trim();
    if (!decoded || decoded.length > 200 || /[\r\n]/.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

/** Parses the `content-length` header of an artifact upload request, if present and valid. */
export function requestContentLength(request: NextRequest): number | null {
  const raw = request.headers.get("content-length");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
