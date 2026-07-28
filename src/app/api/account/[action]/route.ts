import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

const gatewayUrl = (process.env.NEW_API_URL ?? "https://v2api.top").replace(/\/+$/, "");

function jsonBody(response: Response, body: string) {
  return new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}

async function register(request: NextRequest) {
  if (request.method !== "POST") {
    return NextResponse.json({ success: false, message: "Method not allowed" }, { status: 405 });
  }
  try {
    const upstream = await fetch(`${gatewayUrl}/api/user/register`, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
      body: await request.text(),
      cache: "no-store",
    });
    return jsonBody(upstream, await upstream.text());
  } catch {
    return NextResponse.json({ success: false, message: "账户网关暂时不可访问，请稍后重试。" }, { status: 502 });
  }
}

export async function GET(_request: NextRequest, context: RouteContext<"/api/account/[action]">) {
  const { action } = await context.params;
  if (action !== "self") {
    return NextResponse.json({ success: false, message: "Unknown account action" }, { status: 404 });
  }

  const session = await getCurrentUser();
  const user = session?.user;
  if (!user?.id) {
    return NextResponse.json({ success: false, message: "请先登录。" }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    data: {
      id: Number(user.id),
      username: user.name || user.id,
      display_name: user.name || user.id,
      email: user.email ?? "",
    },
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest, context: RouteContext<"/api/account/[action]">) {
  const { action } = await context.params;
  if (action === "register") return register(request);
  return NextResponse.json({ success: false, message: "Unknown account action" }, { status: 404 });
}
