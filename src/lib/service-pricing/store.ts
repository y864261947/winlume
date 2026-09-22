import { eq } from "drizzle-orm";
import { getPlatformDb } from "@/lib/platform/db/client";
import { portalContentSettings } from "@/lib/platform/db/schema";
import { emptyPrice, PRICE_REFERENCES, type PriceDraft, type PriceId } from "./catalog";
import { PricingError, updatePrice } from "./config";
// Separate private settings keys; public portal only reads public-portal.
const keyFor = (id: PriceId) => `service-price:${id}`;
function database() { const db = getPlatformDb(); if (!db) throw new PricingError("平台数据库尚未配置。", 503); return db; }
export async function readPrices(): Promise<PriceDraft[]> {
  return Promise.all(PRICE_REFERENCES.map(async ({id}) => {
    const [row] = await database().select().from(portalContentSettings).where(eq(portalContentSettings.key, keyFor(id))).limit(1);
    return row ? row.value as unknown as PriceDraft : emptyPrice(id);
  }));
}
export async function savePrice(id: PriceId, raw: unknown): Promise<PriceDraft> {
  return database().transaction(async tx => {
    const key = keyFor(id);
    await tx.insert(portalContentSettings).values({ key, value: { ...emptyPrice(id) } }).onConflictDoNothing();
    const [row] = await tx.select().from(portalContentSettings).where(eq(portalContentSettings.key, key)).for("update");
    const next = updatePrice(row.value as unknown as PriceDraft, raw);
    await tx.update(portalContentSettings).set({ value: { ...next }, updatedAt: new Date() }).where(eq(portalContentSettings.key, key));
    return next;
  });
}
