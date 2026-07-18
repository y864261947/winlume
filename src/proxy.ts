import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 已选择企业版的访客访问首页时，服务端直接重定向到企业版，避免客户端跳转闪烁。
// cookie 由 providers.tsx 的 selectAudience 写入，改动 key 时需两边同步。
export function proxy(request: NextRequest) {
  if (request.cookies.get("winlume_audience")?.value === "business") {
    return NextResponse.redirect(new URL("/business", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: "/" };
