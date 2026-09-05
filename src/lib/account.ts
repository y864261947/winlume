import { signIn, signOut } from "next-auth/react";
import { DEFAULT_QUOTA_PER_UNIT } from "@/lib/catalog/plaza-display";

export interface BalanceConfig {
  quota_per_unit?: number;
  quota_display_type?: string;
  display_in_currency?: boolean;
  custom_currency_symbol?: string;
  custom_currency_exchange_rate?: number;
  usd_exchange_rate?: number;
  /** Present in native mode when AUTH_GOOGLE_ID/SECRET are configured. */
  google_oauth_enabled?: boolean;
  /** Present in native mode when AUTH_GITHUB_ID/SECRET are configured. */
  github_oauth_enabled?: boolean;
}

export interface Account {
  id: string;
  username: string;
  display_name?: string;
  email?: string;
  quota?: number;
  used_quota?: number;
  request_count?: number;
  group?: string;
  platform_role?: "user" | "admin";
}

interface ApiResponse<T> { success: boolean; message?: string; data?: T; }

async function responsePayload<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();
  if (!text) throw new Error("账户服务没有返回内容，请稍后重试。");
  try { return JSON.parse(text) as ApiResponse<T>; }
  catch { throw new Error("账户服务返回了无法识别的数据，请稍后重试。"); }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    // Auth/account responses must always reflect the current session cookie.
    cache: "no-store",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
  });
  const payload = await responsePayload<T>(response);
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.message || "请求未完成，请稍后重试。");
  }
  return payload.data;
}

export async function getAccount() { return api<Account>("/api/account/self"); }
export async function getBalanceConfig() { return api<BalanceConfig>("/api/account/config"); }
export async function login(username: string, password: string) {
  const result = await signIn("credentials", { username, password, redirect: false });
  if (!result?.ok) throw new Error("用户名或密码错误，或账户暂时不可用。");
  return getAccount();
}

function oauthCallbackUrl(callbackUrl?: string) {
  return callbackUrl
    || (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/studio")
    || "/studio";
}

/** Starts the Google OAuth redirect (full navigation). */
export async function loginWithGoogle(callbackUrl?: string) {
  await signIn("google", { callbackUrl: oauthCallbackUrl(callbackUrl) });
}

/** Starts the GitHub OAuth redirect (full navigation). */
export async function loginWithGitHub(callbackUrl?: string) {
  await signIn("github", { callbackUrl: oauthCallbackUrl(callbackUrl) });
}
export async function register(input: { username: string; password: string; email: string; display_name: string }) {
  const response = await fetch("/api/account/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    credentials: "same-origin",
  });
  const payload = await responsePayload<unknown>(response);
  if (!response.ok || !payload.success) throw new Error(payload.message || "注册未完成，请稍后重试。");
}

export type IdentifyStatus = "password" | "oauth" | "register" | "unknown_username";

export interface IdentifyResult {
  status: IdentifyStatus;
  identifierType: "email" | "username";
  identifier: string;
  maskedEmail?: string;
}

export interface SignupStartResult {
  status: "needs_verification" | "created";
  debugCode?: string;
}

export interface RecoveryStartResult {
  status: "sent";
  maskedEmail?: string;
  debugCode?: string;
}

export async function identifyAccount(identifier: string) {
  return api<IdentifyResult>("/api/account/identify", {
    method: "POST",
    body: JSON.stringify({ identifier }),
  });
}

export async function startSignup(input: { email: string; username: string; password: string }) {
  return api<SignupStartResult>("/api/account/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function verifySignup(input: { email: string; code: string }) {
  return api<{ username: string }>("/api/account/signup-verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function resendSignupCode(email: string) {
  return api<{ debugCode?: string }>("/api/account/signup-resend", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function startRecovery(identifier: string) {
  return api<RecoveryStartResult>("/api/account/recover", {
    method: "POST",
    body: JSON.stringify({ identifier }),
  });
}

export async function completeRecovery(input: { identifier: string; code: string; password: string }) {
  return api<{ reset: boolean }>("/api/account/recover-complete", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export async function changePassword(input: { currentPassword: string; nextPassword: string }) {
  return api<{ changed: boolean }>("/api/account/password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export async function logout() {
  await signOut({ redirect: false });
}

export function formatBalance(quota: number | undefined, config: BalanceConfig | null) {
  if (typeof quota !== "number") return "余额同步中";
  const isCredits = config?.quota_display_type === "custom" && config.custom_currency_symbol === "credits";
  const perUnit = isCredits ? DEFAULT_QUOTA_PER_UNIT : config?.quota_per_unit;
  if (!perUnit || perUnit <= 0) return "余额同步中";
  const multiplier = config?.quota_display_type === "custom"
    ? (config.custom_currency_exchange_rate || 1)
    : 1;
  const amount = (quota / perUnit) * multiplier;
  const configuredSymbol = config?.quota_display_type === "custom"
    ? (config.custom_currency_symbol || "¥")
    : "$";
  const symbol = configuredSymbol === "credits" ? "¥" : configuredSymbol;
  return `${symbol}${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(amount)}`;
}
