import { NextResponse } from "next/server";
import { getPlatformRepositories } from "@/lib/platform";
import { decryptSecret } from "@/lib/newapi/crypto";

function bearerKey(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

function newApiBaseUrl(): string {
  const configured = process.env.NEW_API_URL?.trim();
  if (!configured) throw new Error("NEW_API_URL is not configured.");
  return configured.replace(/\/+$/, "");
}

export async function proxyRequest(request: Request, path: string[]): Promise<Response> {
  const plaintext = bearerKey(request);
  if (!plaintext) {
    return NextResponse.json({ error: { message: "Missing bearer API key" } }, { status: 401 });
  }

  const repositories = getPlatformRepositories();
  if (!repositories) {
    return NextResponse.json({ error: { message: "Platform database is not configured" } }, { status: 503 });
  }

  const record = await repositories.apiKeys.findActiveByPlaintext(plaintext);
  if (!record || !record.newApiKeyCiphertext) {
    return NextResponse.json({ error: { message: "Invalid API key" } }, { status: 401 });
  }

  const newApiKey = decryptSecret(record.newApiKeyCiphertext);
  const targetUrl = `${newApiBaseUrl()}/v1/${path.join("/")}`;

  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.set("Authorization", `Bearer ${newApiKey}`);
  forwardHeaders.delete("host");

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers: forwardHeaders,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    // @ts-expect-error -- required by undici when streaming a Request body through fetch
    duplex: request.method === "GET" || request.method === "HEAD" ? undefined : "half",
    cache: "no-store",
  });

  void repositories.apiKeys.touchLastUsed(record.id).catch((error) => {
    console.error("Failed to update api_keys.last_used_at", { keyId: record.id, error });
  });

  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
}
