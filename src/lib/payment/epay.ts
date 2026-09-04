import { createHash } from "node:crypto";

/**
 * 易支付 (彩虹易支付 / kyren / 启润) client — page-jump mode (`/submit.php`).
 *
 * Ported 1:1 from `github.com/Calcium-Ion/go-epay@v0.0.4` (epay/util.go,
 * epay/order.go), which is the exact implementation v2api runs in production
 * against `https://api.kyren.top/epay`. Do not "improve" the signing rules —
 * they must byte-match what the gateway expects.
 *
 * Signing (GenerateParams): drop `sign` / `sign_type` and any empty value,
 * sort remaining keys ASCII-ascending, join as `k1=v1&k2=v2` WITHOUT URL
 * encoding, append the merchant key, then lowercase-hex MD5.
 */

export type EpayDevice = "pc" | "mobile";

export interface EpayConfig {
  /** Gateway origin incl. any path prefix, e.g. `https://api.kyren.top/epay` */
  baseUrl: string;
  /** Merchant id (`pid`), e.g. `merch_xxx` */
  pid: string;
  /** Merchant key — secret, used as the MD5 salt */
  key: string;
}

export const EPAY_TRADE_SUCCESS = "TRADE_SUCCESS";

function md5Hex(input: string): string {
  return createHash("md5").update(input, "utf8").digest("hex");
}

/** go-epay `GenerateParams`: returns the lowercase-hex MD5 signature for `params`. */
export function epaySign(params: Record<string, string>, key: string): string {
  const base = Object.entries(params)
    .filter(([k, v]) => k !== "sign" && k !== "sign_type" && v !== "" && v != null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return md5Hex(base + key);
}

export interface EpayPurchaseArgs {
  /** payment channel: `alipay` | `wxpay` | ... */
  type: string;
  /** merchant order number (our `epay_orders.trade_no`) */
  outTradeNo: string;
  /** product name shown on the cashier */
  name: string;
  /** amount in yuan, two decimals, e.g. `"20.00"` */
  money: string;
  device: EpayDevice;
  /** absolute server-to-server callback URL */
  notifyUrl: string;
  /** absolute browser redirect-back URL */
  returnUrl: string;
}

export interface EpayPurchase {
  /** `${baseUrl}/submit.php` — POST the params here as a form */
  url: string;
  /** signed form fields (includes `sign` + `sign_type`) */
  params: Record<string, string>;
}

export function buildEpayPurchase(config: EpayConfig, args: EpayPurchaseArgs): EpayPurchase {
  const params: Record<string, string> = {
    pid: config.pid,
    type: args.type,
    out_trade_no: args.outTradeNo,
    notify_url: args.notifyUrl,
    return_url: args.returnUrl,
    name: args.name,
    money: args.money,
    device: args.device,
    sign_type: "MD5",
  };
  params.sign = epaySign(params, config.key);
  const origin = config.baseUrl.replace(/\/+$/, "");
  return { url: `${origin}/submit.php`, params };
}

export interface EpayNotification {
  /** signature check passed */
  verified: boolean;
  /** merchant order number */
  outTradeNo: string;
  /** gateway order id */
  epayTradeNo: string;
  /** payment channel actually used */
  type: string;
  /** amount reported by the gateway, yuan string */
  money: string;
  /** `TRADE_SUCCESS` on a paid order */
  tradeStatus: string;
}

/**
 * Verify an async notify (or return) callback. `params` must be the FULL set of
 * received fields — go-epay signs over every non-empty field except
 * `sign` / `sign_type`, so cherry-picking would break the check.
 */
export function verifyEpayNotification(
  params: Record<string, string>,
  key: string,
): EpayNotification {
  const sign = (params.sign ?? "").toLowerCase();
  const expected = epaySign(params, key).toLowerCase();
  return {
    verified: sign.length === 32 && sign === expected,
    outTradeNo: params.out_trade_no ?? "",
    epayTradeNo: params.trade_no ?? "",
    type: params.type ?? "",
    money: params.money ?? "",
    tradeStatus: params.trade_status ?? "",
  };
}

/** Heuristic device detection for choosing the cashier layout. */
export function epayDeviceFromUserAgent(userAgent: string | null | undefined): EpayDevice {
  const ua = (userAgent ?? "").toLowerCase();
  if (!ua) return "pc";
  const mobile = [
    "mobile",
    "android",
    "iphone",
    "ipad",
    "ipod",
    "windows phone",
    "micromessenger",
    "alipayclient",
    "harmonyos",
    "openharmony",
  ];
  return mobile.some((token) => ua.includes(token)) ? "mobile" : "pc";
}
