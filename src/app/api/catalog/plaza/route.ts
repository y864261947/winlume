import { NextResponse } from "next/server";

const gatewayUrl = process.env.NEW_API_URL ?? "https://v2api.top";

export async function GET() {
  try {
    const upstream = await fetch(`${gatewayUrl}/api/pricing`, { cache: "no-store" });
    const body = await upstream.text();
    return new NextResponse(body || JSON.stringify({ success: false, message: "模型广场暂时没有返回数据。" }), {
      status: body ? upstream.status : 502,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ success: false, message: "模型广场暂时不可访问。" }, { status: 502 });
  }
}