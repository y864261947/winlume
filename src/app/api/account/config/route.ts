import { NextResponse } from "next/server";

const gatewayUrl = process.env.NEW_API_URL ?? "https://v2api.top";

export async function GET() {
  try {
    const upstream = await fetch(`${gatewayUrl}/api/status`, { cache: "no-store" });
    const payload = await upstream.json() as { success?: boolean; data?: Record<string, unknown> };
    const data = payload.data ?? {};
    return NextResponse.json({
      success: Boolean(payload.success),
      data: {
        quota_per_unit: data.quota_per_unit,
        quota_display_type: data.quota_display_type,
        display_in_currency: data.display_in_currency,
        custom_currency_symbol: data.custom_currency_symbol,
        custom_currency_exchange_rate: data.custom_currency_exchange_rate,
        usd_exchange_rate: data.usd_exchange_rate,
      },
    });
  } catch {
    return NextResponse.json({ success: false, message: "余额配置暂时不可访问。" }, { status: 502 });
  }
}