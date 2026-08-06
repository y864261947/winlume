/**
 * Vendor metadata for the public model plaza.
 * Logos under /public/vendors are placeholders until brand assets are supplied.
 */

export type PlazaVendor = {
  id: number;
  key: string;
  name: string;
  /** Short brand mark shown in the card header pill */
  brandLabel: string;
  /** Public path under /public */
  logo: string;
  /** Tailwind-friendly hex used by SVG placeholders */
  color: string;
  /**
   * CSS linear-gradient for the card hero.
   * Prefer soft pastels / brand washes matching marketplace-style plazas.
   */
  heroGradient: string;
  /** Whether the hero logo pill sits on a dark wash (use light text/logo) */
  heroDark?: boolean;
};

export const PLAZA_VENDORS: PlazaVendor[] = [
  {
    id: 1,
    key: "openai",
    name: "OpenAI",
    brandLabel: "OpenAI",
    logo: "/vendors/openai.svg",
    color: "#10a37f",
    heroGradient: "linear-gradient(145deg, #d1fae5 0%, #a7f3d0 45%, #6ee7b7 100%)",
  },
  {
    id: 2,
    key: "anthropic",
    name: "Anthropic",
    brandLabel: "ANTHROPIC",
    logo: "/vendors/anthropic.svg",
    color: "#d4a27f",
    heroGradient: "linear-gradient(145deg, #f5f0e8 0%, #ebe4d8 50%, #e8dcc8 100%)",
  },
  {
    id: 3,
    key: "google",
    name: "Google",
    brandLabel: "Gemini",
    logo: "/vendors/google.svg",
    color: "#4285f4",
    heroGradient: "linear-gradient(145deg, #e0f2fe 0%, #bae6fd 45%, #7dd3fc 100%)",
  },
  {
    id: 4,
    key: "xai",
    name: "xAI",
    brandLabel: "Grok",
    logo: "/vendors/xai.svg",
    color: "#111111",
    heroGradient: "linear-gradient(145deg, #3f3f46 0%, #18181b 55%, #09090b 100%)",
    heroDark: true,
  },
  {
    id: 5,
    key: "deepseek",
    name: "DeepSeek",
    brandLabel: "deepseek",
    logo: "/vendors/deepseek.svg",
    color: "#4d6bfe",
    heroGradient: "linear-gradient(145deg, #dbeafe 0%, #bfdbfe 45%, #93c5fd 100%)",
  },
  {
    id: 6,
    key: "meta",
    name: "Meta",
    brandLabel: "Meta",
    logo: "/vendors/meta.svg",
    color: "#0668e1",
    heroGradient: "linear-gradient(145deg, #dbeafe 0%, #93c5fd 50%, #60a5fa 100%)",
  },
  {
    id: 7,
    key: "mistral",
    name: "Mistral",
    brandLabel: "Mistral",
    logo: "/vendors/mistral.svg",
    color: "#ff7000",
    heroGradient: "linear-gradient(145deg, #ffedd5 0%, #fed7aa 45%, #fdba74 100%)",
  },
  {
    id: 8,
    key: "alibaba",
    name: "通义千问",
    brandLabel: "通义千问",
    logo: "/vendors/alibaba.svg",
    color: "#7c3aed",
    heroGradient: "linear-gradient(145deg, #ede9fe 0%, #ddd6fe 40%, #c4b5fd 100%)",
  },
  {
    id: 9,
    key: "zhipu",
    name: "智谱",
    brandLabel: "智谱清言",
    logo: "/vendors/zhipu.svg",
    color: "#3859ff",
    heroGradient: "linear-gradient(145deg, #e0e7ff 0%, #c7d2fe 50%, #a5b4fc 100%)",
  },
  {
    id: 10,
    key: "moonshot",
    name: "Moonshot",
    brandLabel: "Moonshot AI",
    logo: "/vendors/moonshot.svg",
    color: "#16161a",
    heroGradient: "linear-gradient(145deg, #3f3f46 0%, #18181b 55%, #09090b 100%)",
    heroDark: true,
  },
  {
    id: 11,
    key: "360",
    name: "360",
    brandLabel: "360智脑",
    logo: "/vendors/360.svg",
    color: "#00a854",
    heroGradient: "linear-gradient(145deg, #dcfce7 0%, #bbf7d0 50%, #86efac 100%)",
  },
  {
    id: 12,
    key: "minimax",
    name: "MiniMax",
    brandLabel: "MiniMax",
    logo: "/vendors/minimax.svg",
    color: "#e11d48",
    heroGradient: "linear-gradient(145deg, #fb7185 0%, #f43f5e 45%, #e11d48 100%)",
    heroDark: true,
  },
  {
    id: 99,
    key: "other",
    name: "Other",
    brandLabel: "Model",
    logo: "/vendors/other.svg",
    color: "#64748b",
    heroGradient: "linear-gradient(145deg, #f1f5f9 0%, #e2e8f0 50%, #cbd5e1 100%)",
  },
];

const byKey = new Map(PLAZA_VENDORS.map((vendor) => [vendor.key, vendor]));
const byId = new Map(PLAZA_VENDORS.map((vendor) => [vendor.id, vendor]));

export function getVendorByKey(key: string): PlazaVendor {
  return byKey.get(key) ?? byKey.get("other")!;
}

export function getVendorById(id: number): PlazaVendor {
  return byId.get(id) ?? byId.get(99)!;
}

/**
 * Infer vendor from a model id using common naming conventions.
 * Kept intentionally simple and deterministic for plaza display.
 */
export function inferVendorFromModel(modelName: string): PlazaVendor {
  const name = modelName.trim().toLowerCase();

  if (
    name.startsWith("gpt-") ||
    name.startsWith("chatgpt-") ||
    name.startsWith("o1") ||
    name.startsWith("o3") ||
    name.startsWith("o4") ||
    name.startsWith("text-embedding") ||
    name.startsWith("dall-e") ||
    name.startsWith("tts-") ||
    name.startsWith("whisper") ||
    name.includes("openai")
  ) {
    return getVendorByKey("openai");
  }

  if (name.startsWith("claude") || name.includes("anthropic")) {
    return getVendorByKey("anthropic");
  }

  if (
    name.startsWith("gemini") ||
    name.startsWith("gemma") ||
    name.startsWith("palm") ||
    name.startsWith("imagen") ||
    name.includes("google")
  ) {
    return getVendorByKey("google");
  }

  if (name.startsWith("grok") || name.includes("xai") || name.includes("x-ai")) {
    return getVendorByKey("xai");
  }

  if (name.includes("deepseek")) {
    return getVendorByKey("deepseek");
  }

  if (name.includes("minimax") || name.startsWith("abab") || name.includes("speech-")) {
    return getVendorByKey("minimax");
  }

  if (name.includes("llama") || name.startsWith("meta-") || name.includes("meta/")) {
    return getVendorByKey("meta");
  }

  if (name.includes("mistral") || name.includes("mixtral") || name.includes("codestral")) {
    return getVendorByKey("mistral");
  }

  if (name.includes("qwen") || name.includes("tongyi") || name.includes("qwen2")) {
    return getVendorByKey("alibaba");
  }

  if (name.includes("chatglm") || name.startsWith("glm-") || name.includes("zhipu")) {
    return getVendorByKey("zhipu");
  }

  if (name.includes("moonshot") || name.includes("kimi")) {
    return getVendorByKey("moonshot");
  }

  if (name.includes("360gpt") || name.startsWith("360")) {
    return getVendorByKey("360");
  }

  return getVendorByKey("other");
}
