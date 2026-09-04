import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { epaySign } from "@/lib/payment/epay";

const mocks = vi.hoisted(() => ({
  getPlatformDb: vi.fn(),
  addNewApiUserQuota: vi.fn(),
}));

vi.mock("@/lib/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform")>();
  return { ...actual, getPlatformDb: mocks.getPlatformDb };
});

vi.mock("@/lib/newapi/admin-client", () => ({
  addNewApiUserQuota: mocks.addNewApiUserQuota,
  NewApiAdminError: class extends Error {},
}));

import { applyEpayNotification } from "./topup";

const KEY = "kyren_live_testkey";
const BASE_ORDER = {
  id: "order-uuid",
  tradeNo: "RZ1788000000abcd1234",
  organizationId: "org-1",
  userId: "user-1",
  newApiUserId: 538,
  provider: "epay",
  paymentMethod: "alipay",
  amountCredits: 20,
  payMoney: "20.00",
  currency: "CNY",
  status: "pending" as string,
  epayTradeNo: null as string | null,
  quotaGranted: null as number | null,
  notifyPayload: null as unknown,
  paidAt: null as Date | null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** Minimal drizzle stand-in: one row for select, a configurable claim result. */
function fakeDb(order: typeof BASE_ORDER, claimRows: unknown[]) {
  const sets: Record<string, unknown>[] = [];
  const db = {
    sets,
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(order ? [order] : []) }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        sets.push(values);
        const done = Promise.resolve(undefined) as Promise<undefined> & {
          returning: () => Promise<unknown[]>;
        };
        done.returning = () => Promise.resolve(claimRows);
        return { where: () => done };
      },
    }),
  };
  return db;
}

function signedNotify(overrides: Record<string, string> = {}) {
  const params: Record<string, string> = {
    pid: "merch_x",
    trade_no: "order_gateway_1",
    out_trade_no: BASE_ORDER.tradeNo,
    type: "alipay",
    name: "Reizo 充值 20 积分",
    money: "20.00",
    trade_status: "TRADE_SUCCESS",
    sign_type: "MD5",
    ...overrides,
  };
  params.sign = epaySign(params, KEY);
  return params;
}

beforeEach(() => {
  process.env.EPAY_BASE_URL = "https://api.kyren.top/epay";
  process.env.EPAY_PID = "merch_x";
  process.env.EPAY_KEY = KEY;
  mocks.getPlatformDb.mockReset();
  mocks.addNewApiUserQuota.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.EPAY_BASE_URL;
  delete process.env.EPAY_PID;
  delete process.env.EPAY_KEY;
});

describe("applyEpayNotification", () => {
  it("credits a pending order and marks it success", async () => {
    const db = fakeDb({ ...BASE_ORDER }, [{ ...BASE_ORDER, status: "crediting" }]);
    mocks.getPlatformDb.mockReturnValue(db);

    const { body } = await applyEpayNotification(signedNotify());

    expect(body).toBe("success");
    // 20 credits * 500_000 quota per credit
    expect(mocks.addNewApiUserQuota).toHaveBeenCalledWith(538, 10_000_000);
    expect(db.sets.some((s) => s.status === "crediting")).toBe(true);
    expect(db.sets.some((s) => s.status === "success" && s.quotaGranted === 10_000_000)).toBe(true);
  });

  it("rejects a bad signature without crediting", async () => {
    mocks.getPlatformDb.mockReturnValue(fakeDb({ ...BASE_ORDER }, []));
    const { body } = await applyEpayNotification({ ...signedNotify(), sign: "deadbeef" });
    expect(body).toBe("fail");
    expect(mocks.addNewApiUserQuota).not.toHaveBeenCalled();
  });

  it("acks a non-success trade status as a no-op", async () => {
    mocks.getPlatformDb.mockReturnValue(fakeDb({ ...BASE_ORDER }, []));
    const { body } = await applyEpayNotification(signedNotify({ trade_status: "WAIT_BUYER_PAY" }));
    expect(body).toBe("success");
    expect(mocks.addNewApiUserQuota).not.toHaveBeenCalled();
  });

  it("is idempotent: an already-successful order is not re-credited", async () => {
    // Nothing claimed (WHERE status='pending' matched zero rows).
    mocks.getPlatformDb.mockReturnValue(fakeDb({ ...BASE_ORDER, status: "success" }, []));
    const { body } = await applyEpayNotification(signedNotify());
    expect(body).toBe("success");
    expect(mocks.addNewApiUserQuota).not.toHaveBeenCalled();
  });

  it("reverts to pending and fails when the quota credit throws", async () => {
    const db = fakeDb({ ...BASE_ORDER }, [{ ...BASE_ORDER, status: "crediting" }]);
    mocks.getPlatformDb.mockReturnValue(db);
    mocks.addNewApiUserQuota.mockRejectedValue(new Error("new-api down"));

    const { body } = await applyEpayNotification(signedNotify());

    expect(body).toBe("fail");
    expect(db.sets.some((s) => s.status === "pending")).toBe(true);
    expect(db.sets.some((s) => s.status === "success")).toBe(false);
  });

  it("acks an unknown order without crediting", async () => {
    mocks.getPlatformDb.mockReturnValue(fakeDb(null as never, []));
    const { body } = await applyEpayNotification(signedNotify());
    expect(body).toBe("success");
    expect(mocks.addNewApiUserQuota).not.toHaveBeenCalled();
  });

  it("marks an underpaid order failed without crediting", async () => {
    const db = fakeDb({ ...BASE_ORDER }, []);
    mocks.getPlatformDb.mockReturnValue(db);
    const { body } = await applyEpayNotification(signedNotify({ money: "1.00" }));
    expect(body).toBe("success");
    expect(mocks.addNewApiUserQuota).not.toHaveBeenCalled();
    expect(db.sets.some((s) => s.status === "failed")).toBe(true);
  });
});
