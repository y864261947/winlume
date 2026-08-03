import { timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

export const MEDIA_WORKER_AUTH_HEADER = "x-winlume-media-worker-token";

export function hasValidWorkerToken(
  headers: IncomingHttpHeaders,
  expected: string,
): boolean {
  const received = headers[MEDIA_WORKER_AUTH_HEADER];
  const value = Array.isArray(received) ? received[0] : received;
  if (!expected || !value) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(value.trim(), "utf8");
  return (
    expectedBytes.length === receivedBytes.length &&
    timingSafeEqual(expectedBytes, receivedBytes)
  );
}
