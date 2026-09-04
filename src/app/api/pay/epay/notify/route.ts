import { applyEpayNotification } from "@/lib/console/topup";

// Public server-to-server callback from the 易支付 gateway. No session, no
// CSRF — the only trust anchor is the MD5 signature checked in
// applyEpayNotification. Must never be cached or statically rendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function textResponse(body: "success" | "fail") {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

async function readParams(request: Request): Promise<Record<string, string>> {
  const params: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    params[key] = value;
  }
  if (request.method === "POST") {
    try {
      const form = await request.formData();
      for (const [key, value] of form) {
        if (typeof value === "string") params[key] = value;
      }
    } catch {
      // Not form-encoded — the query string (if any) is all we have.
    }
  }
  return params;
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function handle(request: Request): Promise<Response> {
  const params = await readParams(request);
  const ip = clientIp(request);

  if (Object.keys(params).length === 0) {
    console.warn(`[epay:notify] empty callback ip=${ip} method=${request.method}`);
    return textResponse("fail");
  }

  try {
    const { body, log } = await applyEpayNotification(params);
    const line = `[epay:notify] ${body} ip=${ip} method=${request.method} ${log}`;
    if (body === "success") console.info(line);
    else console.error(line);
    return textResponse(body);
  } catch (error) {
    console.error(`[epay:notify] handler_error ip=${ip}`, error);
    return textResponse("fail");
  }
}

export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  return handle(request);
}
