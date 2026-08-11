import type { PlazaModel } from "@/lib/catalog";

/**
 * Former source: active pricing catalog tables in Postgres.
 * Those tables were dropped with the Go gateway / billing-engine cutover
 * (design §3.5 / Task 3). Plaza now lists models from new-api directly
 * (`src/app/api/catalog/plaza/route.ts`); this helper remains as a null
 * stub so any residual callers fall through cleanly.
 */
export async function loadPlazaFromPricingCatalog(): Promise<{
  models: PlazaModel[];
  vendors: Array<{ id: number; name: string; key: string; logo: string }>;
} | null> {
  return null;
}
