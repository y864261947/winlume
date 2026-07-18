export interface BalanceConfig {
  quota_per_unit?: number;
  quota_display_type?: string;
  display_in_currency?: boolean;
  custom_currency_symbol?: string;
  custom_currency_exchange_rate?: number;
  usd_exchange_rate?: number;
}

export interface Account {
  id: number;
  username: string;
  display_name?: string;
  email?: string;
  quota: number;
  used_quota: number;
  request_count: number;
  group?: string;
}

interface ApiResponse<T> { success: boolean; message?: string; data?: T; }

const userStorageKey = "winlume:gateway-user-id";

function currentUserId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(userStorageKey);
}

function withUserHeader(headers?: HeadersInit) {
  const nextHeaders = new Headers(headers);
  const userId = currentUserId();
  if (userId) nextHeaders.set("x-winlume-user", userId);
  return nextHeaders;
}

function persistUserId(userId: number) {
  window.localStorage.setItem(userStorageKey, String(userId));
}

function clearUserId() {
  window.localStorage.removeItem(userStorageKey);
}

async function responsePayload<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();
  if (!text) throw new Error("账户服务没有返回内容，请稍后重试。");
  try { return JSON.parse(text) as ApiResponse<T>; }
  catch { throw new Error("账户服务返回了无法识别的数据，请稍后重试。"); }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: withUserHeader({ "content-type": "application/json", ...(init?.headers ?? {}) }),
    credentials: "same-origin",
  });
  const payload = await responsePayload<T>(response);
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.message || "请求未完成，请稍后重试。");
  }
  return payload.data;
}

export async function getAccount() { return api<Account>("/api/auth/self"); }
export async function getBalanceConfig() { return api<BalanceConfig>("/api/account/config"); }
export async function login(username: string, password: string) {
  const account = await api<Account>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
  persistUserId(account.id);
  return account;
}
export async function register(input: { username: string; password: string; email: string; display_name: string }) {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: withUserHeader({ "content-type": "application/json" }),
    body: JSON.stringify(input),
    credentials: "same-origin",
  });
  const payload = await responsePayload<unknown>(response);
  if (!response.ok || !payload.success) throw new Error(payload.message || "注册未完成，请稍后重试。");
}
export async function logout() {
  const response = await fetch("/api/auth/logout", { headers: withUserHeader(), credentials: "same-origin" });
  const payload = await responsePayload<unknown>(response);
  if (!response.ok || !payload.success) throw new Error(payload.message || "退出失败，请重试。");
  clearUserId();
}

export function formatBalance(quota: number, config: BalanceConfig | null) {
  const perUnit = config?.quota_per_unit;
  if (!perUnit || perUnit <= 0) return "余额同步中";
  const multiplier = config?.quota_display_type === "custom"
    ? (config.custom_currency_exchange_rate || 1)
    : 1;
  const amount = (quota / perUnit) * multiplier;
  const symbol = config?.quota_display_type === "custom"
    ? (config.custom_currency_symbol || "¥")
    : "$";
  return `${symbol}${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(amount)}`;
}