import { z } from "zod";
import type { PriceDraft } from "./catalog";
export class PricingError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
const amount = z.string().regex(/^(0|[1-9]\d{0,6})(\.\d{1,6})?$/).refine(v => Number(v) <= 1_000_000).nullable();
export const priceInput = z.object({ revision: z.number().int().nonnegative(), cost: amount, sale: amount, costCurrency: z.enum(["USD", "CNY"]), saleCurrency: z.enum(["USD", "CNY"]), notes: z.string().trim().max(1000) }).strict();
export function updatePrice(current: PriceDraft, raw: unknown): PriceDraft {
  const input = priceInput.safeParse(raw);
  if (!input.success) throw new PricingError("请填写有效价格：0 至 1,000,000，最多 6 位小数；留空表示未定价。");
  if (input.data.revision !== current.revision) throw new PricingError("价格已被其他操作更新，请刷新后重试。", 409);
  return { ...current, ...input.data, revision: current.revision + 1, updatedAt: new Date().toISOString() };
}
