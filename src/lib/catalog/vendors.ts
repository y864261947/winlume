/**
 * Vendor metadata for the public model plaza.
 * Brand marks are served from /public so the homepage, catalog and Studio use
 * the same deterministic assets without a third-party request at render time.
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

const LOCAL_VENDOR_ICON_ALIASES: Record<string, string> = {
  gemini: "google",
  grok: "xai",
  qwen: "alibaba",
  ai360: "360",
  doubao: "bytedance",
  baiducloud: "baidu",
  hunyuan: "tencent",
  flux: "black-forest",
};

const brandIcon = (name: string) => `/vendors/${LOCAL_VENDOR_ICON_ALIASES[name] ?? name}.svg`;

export const PLAZA_VENDORS: PlazaVendor[] = [
  {
    id: 1,
    key: "openai",
    name: "OpenAI",
    brandLabel: "OpenAI",
    logo: brandIcon("openai"),
    color: "#10a37f",
    heroGradient: "linear-gradient(145deg, #d1fae5 0%, #a7f3d0 45%, #6ee7b7 100%)",
  },
  {
    id: 2,
    key: "anthropic",
    name: "Anthropic",
    brandLabel: "ANTHROPIC",
    logo: brandIcon("anthropic"),
    color: "#d4a27f",
    heroGradient: "linear-gradient(145deg, #f5f0e8 0%, #ebe4d8 50%, #e8dcc8 100%)",
  },
  {
    id: 3,
    key: "google",
    name: "Google",
    brandLabel: "Gemini",
    logo: brandIcon("gemini"),
    color: "#4285f4",
    heroGradient: "linear-gradient(145deg, #e0f2fe 0%, #bae6fd 45%, #7dd3fc 100%)",
  },
  {
    id: 4,
    key: "xai",
    name: "xAI",
    brandLabel: "Grok",
    logo: brandIcon("grok"),
    color: "#111111",
    heroGradient: "linear-gradient(145deg, #3f3f46 0%, #18181b 55%, #09090b 100%)",
    heroDark: true,
  },
  {
    id: 5,
    key: "deepseek",
    name: "DeepSeek",
    brandLabel: "deepseek",
    logo: brandIcon("deepseek"),
    color: "#4d6bfe",
    heroGradient: "linear-gradient(145deg, #dbeafe 0%, #bfdbfe 45%, #93c5fd 100%)",
  },
  {
    id: 6,
    key: "meta",
    name: "Meta",
    brandLabel: "Meta",
    logo: brandIcon("meta"),
    color: "#0668e1",
    heroGradient: "linear-gradient(145deg, #dbeafe 0%, #93c5fd 50%, #60a5fa 100%)",
  },
  {
    id: 7,
    key: "mistral",
    name: "Mistral",
    brandLabel: "Mistral",
    logo: brandIcon("mistral"),
    color: "#ff7000",
    heroGradient: "linear-gradient(145deg, #ffedd5 0%, #fed7aa 45%, #fdba74 100%)",
  },
  {
    id: 8,
    key: "alibaba",
    name: "通义千问",
    brandLabel: "通义千问",
    logo: brandIcon("qwen"),
    color: "#7c3aed",
    heroGradient: "linear-gradient(145deg, #ede9fe 0%, #ddd6fe 40%, #c4b5fd 100%)",
  },
  {
    id: 9,
    key: "zhipu",
    name: "智谱",
    brandLabel: "智谱清言",
    logo: brandIcon("zhipu"),
    color: "#3859ff",
    heroGradient: "linear-gradient(145deg, #e0e7ff 0%, #c7d2fe 50%, #a5b4fc 100%)",
  },
  {
    id: 10,
    key: "moonshot",
    name: "Moonshot",
    brandLabel: "Moonshot AI",
    logo: brandIcon("moonshot"),
    color: "#16161a",
    heroGradient: "linear-gradient(145deg, #3f3f46 0%, #18181b 55%, #09090b 100%)",
    heroDark: true,
  },
  {
    id: 11,
    key: "360",
    name: "360",
    brandLabel: "360智脑",
    logo: brandIcon("ai360"),
    color: "#00a854",
    heroGradient: "linear-gradient(145deg, #dcfce7 0%, #bbf7d0 50%, #86efac 100%)",
  },
  {
    id: 12,
    key: "minimax",
    name: "MiniMax",
    brandLabel: "MiniMax",
    logo: brandIcon("minimax"),
    color: "#e11d48",
    heroGradient: "linear-gradient(145deg, #fb7185 0%, #f43f5e 45%, #e11d48 100%)",
    heroDark: true,
  },
  {
    id: 13,
    key: "baidu",
    name: "百度智能云",
    brandLabel: "ERNIE 文心",
    logo: brandIcon("baiducloud"),
    color: "#2f6bff",
    heroGradient: "linear-gradient(145deg, #e6efff 0%, #c9dbff 50%, #9fbeff 100%)",
  },
  {
    id: 14,
    key: "bytedance",
    name: "字节跳动",
    brandLabel: "豆包",
    logo: brandIcon("doubao"),
    color: "#00a6ff",
    heroGradient: "linear-gradient(145deg, #e0f5ff 0%, #b9eaff 50%, #8ddcff 100%)",
  },
  {
    id: 15,
    key: "tencent",
    name: "腾讯混元",
    brandLabel: "腾讯混元",
    logo: brandIcon("hunyuan"),
    color: "#0874e8",
    heroGradient: "linear-gradient(145deg, #e7f2ff 0%, #c6e1ff 50%, #9fcbff 100%)",
  },
  {
    id: 16,
    key: "baichuan",
    name: "百川智能",
    brandLabel: "Baichuan",
    logo: brandIcon("baichuan"),
    color: "#f05a28",
    heroGradient: "linear-gradient(145deg, #fff0e9 0%, #ffd9c8 50%, #ffc0a5 100%)",
  },
  {
    id: 17,
    key: "stepfun",
    name: "阶跃星辰",
    brandLabel: "StepFun",
    logo: brandIcon("stepfun"),
    color: "#516dff",
    heroGradient: "linear-gradient(145deg, #e8ebff 0%, #d0d8ff 50%, #b8c5ff 100%)",
  },
  {
    id: 18,
    key: "microsoft",
    name: "Microsoft",
    brandLabel: "Microsoft",
    logo: brandIcon("microsoft"),
    color: "#1473e6",
    heroGradient: "linear-gradient(145deg, #eaf4ff 0%, #cfe7ff 50%, #afd6ff 100%)",
  },
  {
    id: 19,
    key: "cohere",
    name: "Cohere",
    brandLabel: "Cohere",
    logo: brandIcon("cohere"),
    color: "#39594d",
    heroGradient: "linear-gradient(145deg, #edf6ef 0%, #d3ead8 50%, #b7dcbf 100%)",
  },
  {
    id: 20,
    key: "jina",
    name: "Jina AI",
    brandLabel: "Jina AI",
    logo: brandIcon("jina"),
    color: "#ef4444",
    heroGradient: "linear-gradient(145deg, #fff0f0 0%, #ffd7d7 50%, #ffbcbc 100%)",
  },
  {
    id: 21,
    key: "black-forest",
    name: "Black Forest Labs",
    brandLabel: "FLUX",
    logo: brandIcon("flux"),
    color: "#0d1117",
    heroGradient: "linear-gradient(145deg, #f1f3f5 0%, #dfe4ea 50%, #cbd3dd 100%)",
  },
  {
    id: 22,
    key: "stability",
    name: "Stability AI",
    brandLabel: "Stability AI",
    logo: brandIcon("stability"),
    color: "#6146ff",
    heroGradient: "linear-gradient(145deg, #eeeaff 0%, #ddd5ff 50%, #c9bdff 100%)",
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

  if (name.includes("ernie") || name.includes("baidu") || name.includes("wenxin")) return getVendorByKey("baidu");
  if (name.includes("doubao") || name.includes("byte")) return getVendorByKey("bytedance");
  if (name.includes("hunyuan") || name.includes("tencent")) return getVendorByKey("tencent");
  if (name.includes("baichuan")) return getVendorByKey("baichuan");
  if (name.includes("step") || name.includes("stepfun")) return getVendorByKey("stepfun");
  if (name.includes("copilot") || name.includes("azure")) return getVendorByKey("microsoft");
  if (name.includes("cohere") || name.includes("command-r")) return getVendorByKey("cohere");
  if (name.includes("jina") || name.includes("rerank")) return getVendorByKey("jina");
  if (name.includes("flux")) return getVendorByKey("black-forest");
  if (name.includes("stable-diffusion") || name.includes("stability")) return getVendorByKey("stability");

  return getVendorByKey("other");
}
