import { eq } from "drizzle-orm";
import { getPlatformDb } from "@/lib/platform/db/client";
import { serviceIntegrations } from "@/lib/platform/db/schema";
import { emptyConfig, ServiceConfigError, type StoredServiceConfig } from "./config";
import type { ServiceId } from "./catalog";

function database() {
  const db = getPlatformDb();
  if (!db) throw new ServiceConfigError("平台数据库尚未配置。", 503);
  return db;
}
export async function readService(id: ServiceId): Promise<StoredServiceConfig> {
  const [row] = await database().select().from(serviceIntegrations).where(eq(serviceIntegrations.id, id)).limit(1);
  return row ? row.value as StoredServiceConfig : emptyConfig(id);
}
/** Serialize edits and probe reservations across app instances. */
export async function changeService(id: ServiceId, change: (current: StoredServiceConfig) => StoredServiceConfig): Promise<StoredServiceConfig> {
  return database().transaction(async (tx) => {
    await tx.insert(serviceIntegrations).values({ id, value: emptyConfig(id) }).onConflictDoNothing();
    const [row] = await tx.select().from(serviceIntegrations).where(eq(serviceIntegrations.id, id)).for("update");
    const next = change(row.value as StoredServiceConfig);
    await tx.update(serviceIntegrations).set({ value: next, updatedAt: new Date() }).where(eq(serviceIntegrations.id, id));
    return next;
  });
}
