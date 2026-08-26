import { getPlatformRepositories } from "@/lib/platform/repositories";

export const PORTAL_CONTENT_KEY = "public-portal";
export const PORTAL_MODEL_CATEGORIES = ["llm", "image", "audio", "video", "embed", "other"] as const;
export type PortalModelCategory = (typeof PORTAL_MODEL_CATEGORIES)[number];

export type PortalCarouselSlide = { id: string; imageUrl: string; alt: string; href: string; enabled: boolean };
export type PortalNotification = { id: string; title: string; body: string; href: string; enabled: boolean; createdAt: string };
export type PortalVendorModel = { name: string; endpointTypes: string[]; description?: string };
export type PortalModelVendor = { id: string; name: string; key: string; logoUrl: string; category: PortalModelCategory; enabled: boolean; models: PortalVendorModel[] };
export type PortalContentConfig = { carousel: PortalCarouselSlide[]; notifications: PortalNotification[]; modelVendors: PortalModelVendor[] };

export const defaultPortalContent: PortalContentConfig = {
  carousel: [
    { id: "claude-fable-5", imageUrl: "/figma-home/featured/slide-claude-fable-5.png", alt: "Model Review · Claude Fable 5", href: "/products?cate=api", enabled: true },
    { id: "gpt-5-6-sol", imageUrl: "/figma-home/featured/slide-gpt-5-6-sol.png", alt: "Model Review · GPT-5.6 Sol", href: "/products?cate=api", enabled: true },
  ],
  notifications: [
    { id: "welcome", title: "Reizo 门户已更新", body: "热门应用工具、API 模型与智能体入口已完成升级。", href: "/", enabled: true, createdAt: "2026-08-26T00:00:00.000Z" },
  ],
  modelVendors: [],
};

function string(value: unknown, max = 500) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function id(value: unknown, fallback: string) { return string(value, 80).replace(/[^a-zA-Z0-9_-]/g, "-") || fallback; }
function category(value: unknown): PortalModelCategory { return PORTAL_MODEL_CATEGORIES.includes(value as PortalModelCategory) ? value as PortalModelCategory : "llm"; }

export function normalizePortalContent(input: unknown): PortalContentConfig {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const carousel = Array.isArray(raw.carousel) ? raw.carousel.slice(0, 12).flatMap((item, index) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const imageUrl = string(row.imageUrl, 200_000); const alt = string(row.alt, 120); const href = string(row.href, 500) || "/";
    return imageUrl && alt ? [{ id: id(row.id, `slide-${index + 1}`), imageUrl, alt, href, enabled: row.enabled !== false }] : [];
  }) : defaultPortalContent.carousel;
  const notifications = Array.isArray(raw.notifications) ? raw.notifications.slice(0, 30).flatMap((item, index) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const title = string(row.title, 120); const body = string(row.body, 500);
    return title && body ? [{ id: id(row.id, `notice-${index + 1}`), title, body, href: string(row.href, 500) || "/", enabled: row.enabled !== false, createdAt: string(row.createdAt, 64) || new Date().toISOString() }] : [];
  }) : defaultPortalContent.notifications;
  const modelVendors = Array.isArray(raw.modelVendors) ? raw.modelVendors.slice(0, 80).flatMap((item, index) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const name = string(row.name, 100); const key = id(row.key, `vendor-${index + 1}`).toLowerCase();
    const models = Array.isArray(row.models) ? row.models.slice(0, 40).flatMap((model) => {
      const data = model && typeof model === "object" ? model as Record<string, unknown> : {};
      const modelName = string(data.name, 120);
      return modelName ? [{ name: modelName, endpointTypes: Array.isArray(data.endpointTypes) ? data.endpointTypes.map((value) => string(value, 40)).filter(Boolean).slice(0, 8) : ["chat"], description: string(data.description, 300) || undefined }] : [];
    }) : [];
    return name && models.length ? [{ id: id(row.id, `vendor-${index + 1}`), name, key, logoUrl: string(row.logoUrl, 200_000) || "/vendors/other.svg", category: category(row.category), enabled: row.enabled !== false, models }] : [];
  }) : [];
  return { carousel: carousel.length ? carousel : defaultPortalContent.carousel, notifications, modelVendors };
}

export async function getPortalContent(): Promise<PortalContentConfig> {
  const repositories = getPlatformRepositories();
  if (!repositories) return defaultPortalContent;
  try { return normalizePortalContent(await repositories.portalContent.get(PORTAL_CONTENT_KEY)); }
  catch { return defaultPortalContent; }
}
