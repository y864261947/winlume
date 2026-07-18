import { NextRequest, NextResponse } from "next/server";

const gatewayUrl = process.env.NEW_API_URL ?? "https://v2api.top";
const supported = new Set(["login", "register", "self", "logout"]);

function cookieHeader(request: NextRequest) {
  return request.headers.get("cookie") ?? "";
}

function forwardCookies(response: NextResponse, upstream: Response) {
  const getSetCookie = upstream.headers.getSetCookie?.bind(upstream.headers);
  const cookies = getSetCookie ? getSetCookie() : [];
  for (const value of cookies) {
    response.headers.append("set-cookie", value.replace(/;\s*Domain=[^;]+/gi, ""));
  }
}

async function proxy(request: NextRequest, action: string) {
  if (!supported.has(action)) return NextResponse.json({ success: false, message: "Unknown auth action" }, { status: 404 });
  const path = action === "logout" ? "/api/user/logout" : `/api/user/${action === "self" ? "self" : action}`;
  try {
    const upstream = await fetch(`${gatewayUrl}${path}`, {
      method: request.method,
      headers: {
        accept: "application/json",
        "content-type": request.headers.get("content-type") ?? "application/json",
        cookie: cookieHeader(request),
        "New-Api-User": request.headers.get("x-winlume-user") ?? "",
      },
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store",
    });
    const body = await upstream.text();
    if (!body) {
      return NextResponse.json({ success: false, message: "账户网关返回了空响应，请稍后重试。" }, { status: 502 });
    }
    const response = new NextResponse(body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" } });
    forwardCookies(response, upstream);
    return response;
  } catch {
    return NextResponse.json({ success: false, message: "账户网关暂时不可访问，请稍后重试。" }, { status: 502 });
  }
}

export async function GET(request: NextRequest, context: RouteContext<"/api/auth/[action]">) {
  const { action } = await context.params;
  return proxy(request, action);
}

export async function POST(request: NextRequest, context: RouteContext<"/api/auth/[action]">) {
  const { action } = await context.params;
  return proxy(request, action);
}