import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyActualPricing, pricingUpdate, readNewApiPricing } from "./pricing";
import { modelPriceLines } from "@/lib/catalog/plaza-display";

const model = { model_name: "deepseek-v4-flash", quota_type: 0, model_ratio: .5, completion_ratio: 4, model_price: 0, enable_groups: ["domestic"] };

describe("readNewApiPricing", () => {
  const token = "test-private-admin-token";
  const failureMessage = "读取实际费率失败，请稍后重试。";
  const pricingBody = { success: true, data: [model], group_ratio: { domestic: .3 } };
  const statusBody = { success: true, data: { quota_per_unit: 500000 } };
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("NEW_API_URL", " https://billing.example/// ");
    vi.stubEnv("NEW_API_ADMIN_TOKEN", ` ${token} `);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads private pricing using only bearer auth and keeps status unauthenticated", async () => {
    fetchMock.mockImplementation(async (url, init) => {
      const headers = new Headers(init?.headers);
      expect(init?.cache).toBe("no-store");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      if (url === "https://billing.example/api/pricing") {
        expect([...headers.entries()]).toEqual([["authorization", `Bearer ${token}`]]);
        return headers.get("authorization") === `Bearer ${token}`
          ? Response.json(pricingBody)
          : Response.json({ error: "AUTH_UNAUTHORIZED" }, { status: 401 });
      }
      expect(url).toBe("https://billing.example/api/status");
      expect([...headers.entries()]).toEqual([]);
      return Response.json(statusBody);
    });

    const result = await readNewApiPricing();
    expect(result).toEqual({ models: [model], groups: { domestic: .3 }, quotaPerUnit: 500000 });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, "", "   "])("preserves public pricing when token is %s", async missingToken => {
    vi.stubEnv("NEW_API_ADMIN_TOKEN", missingToken);
    fetchMock.mockImplementation(async (url, init) => {
      expect([...new Headers(init?.headers).entries()]).toEqual([]);
      return Response.json(String(url).endsWith("/pricing") ? pricingBody : statusBody);
    });
    await expect(readNewApiPricing()).resolves.toEqual({ models: [model], groups: { domestic: .3 }, quotaPerUnit: 500000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["pricing", "status"])("sanitizes %s HTTP errors without exposing response headers or body", async endpoint => {
    fetchMock.mockImplementation(async url => String(url).endsWith(`/${endpoint}`)
      ? Response.json({ error: `AUTH_UNAUTHORIZED Bearer ${token}` }, {
        status: 401, headers: { "x-debug-auth": token },
      })
      : Response.json(String(url).endsWith("/pricing") ? pricingBody : statusBody));
    await expect(readNewApiPricing()).rejects.toThrow(new Error(failureMessage));
  });

  it.each(["pricing", "status"])("sanitizes %s transport errors and drops their cause", async endpoint => {
    fetchMock.mockImplementation(async url => {
      if (String(url).endsWith(`/${endpoint}`)) {
        throw new Error(`Authorization: Bearer ${token}`, { cause: { headers: { Authorization: token } } });
      }
      return Response.json(String(url).endsWith("/pricing") ? pricingBody : statusBody);
    });
    const error = await readNewApiPricing().catch(error => error);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(failureMessage);
    expect(error.cause).toBeUndefined();
    expect(String(error.stack)).not.toContain(token);
  });

  it("sanitizes JSON parsing errors", async () => {
    fetchMock.mockImplementation(async url => String(url).endsWith("/pricing")
      ? new Response(`Authorization: Bearer ${token}`)
      : Response.json(statusBody));
    await expect(readNewApiPricing()).rejects.toThrow(new Error(failureMessage));
  });

  it.each([null, { success: false, message: token }, { success: true, data: {} }])("rejects invalid pricing payloads without upstream details", async body => {
    fetchMock.mockImplementation(async url => Response.json(String(url).endsWith("/pricing") ? body : statusBody));
    await expect(readNewApiPricing()).rejects.toThrow(new Error("计费服务返回的费率无效。"));
  });
});
describe("actual billing prices", () => {
  it("converts input/output USD amounts into the billing engine's ratios", () => {
    expect(pricingUpdate({ mode:"tokens", input:1, output:4 },500000)).toEqual({quota_type:0,model_ratio:.5,completion_ratio:4});
    expect(pricingUpdate({ mode:"fixed", price:.08 },500000)).toEqual({quota_type:1,model_price:.08});
    expect(()=>pricingUpdate({mode:"tokens",input:0,output:4},500000)).toThrow();
    for(const price of [-1,Infinity,NaN,"",null]) expect(()=>pricingUpdate({mode:"fixed",price},500000)).toThrow();
  });
  it("uses actual group pricing, currency and zero prices instead of defaults", () => {
    const catalog = {models:[model],groups:{domestic:.3},quotaPerUnit:500000};
    const result = applyActualPricing([model],catalog)[0];
    expect(modelPriceLines(result)).toEqual({kind:"ratio",input:"输入：$0.300 /1M tokens",output:"输出：$1.20 /1M tokens"});
    expect(modelPriceLines({...result,group_ratio:0})).toEqual({kind:"ratio",input:"输入：$0 /1M tokens",output:"输出：$0 /1M tokens"});
    expect(modelPriceLines({...result,quota_type:1,model_price:1})).toEqual({kind:"fixed",text:"价格：$0.300 /次"});
    expect(applyActualPricing([{...model,model_name:"unknown"}],catalog)[0].pricing_unavailable).toBe(true);
  });
});
