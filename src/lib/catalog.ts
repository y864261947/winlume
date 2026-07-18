import {
  filterProducts,
  getProduct,
  products,
  relatedProducts,
  type Product,
  type ProductFilter,
} from "@/data/products";

export interface CatalogService {
  list(filter?: ProductFilter): Promise<Product[]>;
  byId(id: string): Promise<Product | undefined>;
  related(product: Product, count?: number): Promise<Product[]>;
}

/** Interactive frontend features use this adapter instead of mock-data imports. */
export const catalog: CatalogService = {
  async list(filter = {}) { return filterProducts(filter); },
  async byId(id) { return getProduct(id); },
  async related(product, count) { return relatedProducts(product, count); },
};

export async function searchCatalog(query: string, limit = 8): Promise<Product[]> {
  const normalized = query.trim().toLowerCase();
  const source = normalized ? products : products.filter((product) => product.isNew);
  return source
    .filter((product) => {
      if (!normalized) return true;
      return `${product.name} ${product.brand} ${product.tagline}`.toLowerCase().includes(normalized);
    })
    .slice(0, limit);
}

/* ── 公开模型广场 ───────────────────────────────────────────── */

export interface PlazaModel {
  model_name: string;
  vendor_id?: number;
  quota_type: number;
  model_price: number;
  model_ratio: number;
  completion_ratio?: number;
  enable_groups?: string[];
  supported_endpoint_types?: string[];
}

export interface PlazaData {
  models: PlazaModel[];
  total: number;
  vendors: Record<number, string>;
}

interface PlazaResponse {
  success: boolean;
  message?: string;
  data?: PlazaModel[];
  vendors?: { id: number; name: string }[];
}

const PLAZA_CACHE_TTL = 60_000;
let plazaCache: { data: PlazaData; expires: number } | null = null;
let plazaInFlight: Promise<PlazaData> | null = null;

/**
 * 同页多个组件需要广场数据时共享同一次请求，
 * 成功后短缓存 60s；失败不缓存，下次调用自然重试。
 */
export function fetchPlaza(): Promise<PlazaData> {
  if (plazaCache && plazaCache.expires > Date.now()) return Promise.resolve(plazaCache.data);
  if (plazaInFlight) return plazaInFlight;
  plazaInFlight = (async () => {
    try {
      const response = await fetch("/api/catalog/plaza");
      const payload = (await response.json()) as PlazaResponse;
      if (!response.ok || !payload.success) throw new Error(payload.message || "模型广场暂时不可访问。");
      const models = payload.data ?? [];
      const data: PlazaData = {
        models,
        total: models.length,
        vendors: Object.fromEntries((payload.vendors ?? []).map((vendor) => [vendor.id, vendor.name])),
      };
      plazaCache = { data, expires: Date.now() + PLAZA_CACHE_TTL };
      return data;
    } finally {
      plazaInFlight = null;
    }
  })();
  return plazaInFlight;
}