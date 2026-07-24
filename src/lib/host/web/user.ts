import { cookies, headers } from "next/headers";

/** Gateway user id for storage partitioning. Returns null if logged out. */
export async function requireUserId(): Promise<string | null> {
  const h = await headers();
  const fromHeader = h.get("x-winlume-user")?.trim();
  if (fromHeader) return fromHeader;
  // Client should send x-winlume-user; also accept cookie if you store it server-side later.
  const jar = await cookies();
  const fromCookie = jar.get("winlume_uid")?.value;
  return fromCookie ?? null;
}
