import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rows: [] as unknown[][], role: "owner", order: vi.fn(), list: vi.fn(), create: vi.fn(), cashier: vi.fn(), balance: vi.fn() }));
vi.mock("./auth", () => ({ getAuthMode: () => "reizo" }));
vi.mock("./db/client", () => ({ getPlatformDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => mocks.rows.shift() ?? [] }) }) }) }) }));
vi.mock("./repositories", () => ({ getPlatformRepositories: () => ({}) }));
vi.mock("../console/server", () => ({
  ConsoleRequestError: class extends Error { constructor(message: string, public status: number, public code: string) { super(message); } },
  ensureOrganizationKeyManager: (role: string) => { if (!["owner", "admin"].includes(role)) throw new Error("forbidden"); },
  getConsoleWalletDetails: mocks.balance,
}));
vi.mock("../console/workspace", () => ({ requireConsoleOrganization: async () => ({ organization: { id: "33333333-3333-4333-8333-333333333333", name: "充值工作区" }, membership: { role: mocks.role } }) }));
vi.mock("../console/topup", () => ({
  getEpayConfig: () => ({ key: "test-merchant-secret" }),
  getConsoleTopupConfig: () => ({ enabled: true, minTopup: 1, maxTopup: 1000 }),
  getConsolePaymentOrder: mocks.order, listConsolePaymentOrders: mocks.list, createConsoleTopupOrder: mocks.create, getConsoleTopupCashier: mocks.cashier,
}));
import { createCashierTicket, parseCashierTicket, createDesktopTopup, readDesktopWallet, desktopCashier } from "./desktop-wallet";
import { resetRateLimitForTests } from "./rate-limit";

const org = "33333333-3333-4333-8333-333333333333";
const sessionId = "11111111-1111-4111-8111-111111111111"; const userId = "22222222-2222-4222-8222-222222222222";
const token = "t".repeat(43); const tradeNo = "RZD1234567890123456789012345678901234567890";
const grant = () => ({ id: sessionId, userId, expiresAt: new Date(Date.now() + 3600_000), authVersion: 1 });
const user = { id: userId, status: "active", authVersion: 1, currentOrganizationId: org };
const input = { organizationId: org, requestId: "44444444-4444-4444-8444-444444444444", amount: 20, paymentMethod: "alipay" };
function request(body?: unknown, query = "") {
  return new Request(`https://reizo.example/api/desktop-auth/wallet${query}`, { method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
beforeEach(() => {
  resetRateLimitForTests();
  vi.clearAllMocks(); mocks.role = "owner"; mocks.rows = [[grant()], [user]];
  mocks.balance.mockResolvedValue({ wallet: { availableCredits: 20, currency: "CNY", syncStatus: "ready" } });
  mocks.list.mockResolvedValue([]); mocks.order.mockResolvedValue({ reference: tradeNo, status: "pending" });
  mocks.create.mockResolvedValue({ tradeNo });
  mocks.cashier.mockResolvedValue({ url: "https://pay.example/submit.php", params: { pid: "merchant", name: '<script>alert("unsafe")</script>', money: "20.00" } });
});

it("rejects forged and expired checkout tickets and never embeds the account credential", () => {
  const value = { sessionId, userId, organizationId: org, order: tradeNo, expires: Date.now() + 60_000 };
  const ticket = createCashierTicket(value, "test-merchant-secret");
  expect(parseCashierTicket(ticket, "test-merchant-secret")).toEqual(value);
  expect(ticket).not.toContain(token);
  expect(() => parseCashierTicket(ticket, "wrong-key")).toThrow();
  expect(() => parseCashierTicket(ticket, "test-merchant-secret", Date.now() + 120_000)).toThrow("过期");
});

it("requires a desktop grant and current auth version before returning wallet data", async () => {
  await expect(readDesktopWallet(new Request("https://reizo.example/api/desktop-auth/wallet"))).rejects.toMatchObject({ status: 401 });
  mocks.rows = [[grant()], [{ ...user, authVersion: 2 }]];
  await expect(readDesktopWallet(request())).rejects.toMatchObject({ status: 401 });
  expect(mocks.balance).not.toHaveBeenCalled();
});

it("pins reads to the authorized workspace and exposes permission separately from balance availability", async () => {
  mocks.role = "viewer";
  const result = await readDesktopWallet(request());
  expect(result).toMatchObject({ organization: { id: org }, canTopup: false, balance: { availableCredits: 20 } });
  expect(mocks.balance).toHaveBeenCalledWith(expect.objectContaining({ userId }), org);
});

it("rejects a workspace switch or insufficient role before creating an order", async () => {
  await expect(createDesktopTopup(request({ ...input, organizationId: sessionId }))).rejects.toMatchObject({ status: 409 });
  mocks.rows = [[grant()], [user]]; mocks.role = "viewer";
  await expect(createDesktopTopup(request(input))).rejects.toMatchObject({ status: 403 });
  expect(mocks.create).not.toHaveBeenCalled();
});

it("scopes creation identity to the device and returns only an order-specific cashier ticket", async () => {
  const result = await createDesktopTopup(request(input));
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ userId }), expect.objectContaining({ organizationId: org, amount: 20, idempotencyKey: `${sessionId}:${input.requestId}` }));
  expect(result.order.reference).toBe(tradeNo);
  const url = new URL(result.cashierUrl ?? "");
  expect(url.pathname).toBe("/api/desktop-auth/cashier");
  expect(parseCashierTicket(url.searchParams.get("ticket") ?? "", "test-merchant-secret").organizationId).toBe(org);
  expect(JSON.stringify(result)).not.toContain(token);
});

it("rejects an unrelated order instead of minting a checkout URL", async () => {
  mocks.order.mockResolvedValue(null);
  await expect(readDesktopWallet(request(undefined, `?order=${tradeNo}`))).rejects.toMatchObject({ status: 404 });
});

it("allows an explicit payment after repeated read-only wallet polling", async () => {
  for (let index = 0; index < 20; index++) {
    mocks.rows = [[grant()], [user]];
    await readDesktopWallet(request());
  }
  mocks.rows = [[grant()], [user]];
  await expect(createDesktopTopup(request(input))).resolves.toMatchObject({ order: { reference: tradeNo } });
  expect(mocks.create).toHaveBeenCalledOnce();
});

it("revalidates checkout authorization and emits an escaped POST form with restrictive browser headers", async () => {
  const ticket = createCashierTicket({ sessionId, userId, organizationId: org, order: tradeNo, expires: Date.now() + 60_000 }, "test-merchant-secret");
  const response = await desktopCashier(new Request(`https://reizo.example/api/desktop-auth/cashier?ticket=${ticket}`));
  const html = await response.text();
  expect(html).toContain('method="POST"'); expect(html).toContain('action="https://pay.example/submit.php"');
  expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain('<script>alert("unsafe")');
  expect(response.headers.get("content-security-policy")).toContain("form-action https://pay.example");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(html).not.toContain("test-merchant-secret"); expect(html).not.toContain(token);
  mocks.rows = [[{ ...grant(), expiresAt: new Date(0) }], [user]];
  await expect(desktopCashier(new Request(`https://reizo.example/api/desktop-auth/cashier?ticket=${ticket}`))).rejects.toMatchObject({ status: 401 });
  expect(mocks.cashier).toHaveBeenCalledOnce();
});

it("returns the same signed purchase as JSON for a native cashier without creating another order", async () => {
  const ticket = createCashierTicket({ sessionId, userId, organizationId: org, order: tradeNo, expires: Date.now() + 60_000 }, "test-merchant-secret");
  const response = await desktopCashier(new Request(`https://reizo.example/api/desktop-auth/cashier?ticket=${ticket}`, { headers: { Accept: "application/json" } }));
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(await response.json()).toEqual({ url: "https://pay.example/submit.php", params: { pid: "merchant", name: '<script>alert("unsafe")</script>', money: "20.00" } });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.create).not.toHaveBeenCalled();
});
