import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

const MEDIA_WORKER_TOKEN_HEADER = "x-reizo-media-worker-token";

export function mediaWorkerToken(): string {
  return process.env.REIZO_MEDIA_WORKER_TOKEN?.trim() ?? "";
}

export function isTrustedMediaWorker(request: NextRequest): boolean {
  const expected = mediaWorkerToken();
  const received = request.headers.get(MEDIA_WORKER_TOKEN_HEADER)?.trim() ?? "";
  if (!expected || !received) return false;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return (
    expectedBytes.length === receivedBytes.length &&
    timingSafeEqual(expectedBytes, receivedBytes)
  );
}

export const MEDIA_WORKER_AUTH_HEADER = MEDIA_WORKER_TOKEN_HEADER;
