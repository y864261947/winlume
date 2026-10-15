/**
 * Classify a model as text / image / video / audio.
 *
 * Signal quality differs sharply between the three upstreams, so this is
 * layered rather than a single heuristic:
 *
 *   小安/卡藏 declare `supported_endpoint_types` ("openai-video",
 *   "image-generation") and 卡藏 adds `tags` — both authoritative.
 *   云飞 declares neither: all 13 of its models report only "openai"/"gemini",
 *   so `veo-3.1-fast` and `gpt-image-2` are indistinguishable from a chat
 *   model at the schema level.
 *
 * Because of that gap, a name-based fallback is unavoidable. What is avoidable
 * is pretending it is as reliable as a declaration — every result carries a
 * confidence, and "guessed" results are surfaced for review instead of being
 * silently mixed in with declared ones.
 *
 * Pure module.
 */

import type { PricingRow } from "./pricing-pull";

export type ModelCategory = "text" | "image" | "video" | "audio" | "unknown";

export type CategoryConfidence = "declared" | "inferred" | "guessed";

export type Classification = {
  category: ModelCategory;
  confidence: CategoryConfidence;
  /** Which signal decided it, shown in the report so a wrong call is traceable. */
  reason: string;
};

const CATEGORY_LABEL: Record<ModelCategory, string> = {
  text: "文本",
  image: "图片",
  video: "视频",
  audio: "音频",
  unknown: "未分类",
};

export function categoryLabel(category: ModelCategory): string {
  return CATEGORY_LABEL[category];
}

/** Endpoint types that unambiguously name a modality. */
function fromEndpointTypes(types: string[]): Classification | null {
  const set = new Set(types.map((type) => type.toLowerCase()));
  if (set.has("openai-video")) {
    return { category: "video", confidence: "declared", reason: "endpoint_types 含 openai-video" };
  }
  if (set.has("image-generation")) {
    return { category: "image", confidence: "declared", reason: "endpoint_types 含 image-generation" };
  }
  if (set.has("openai-audio") || set.has("audio")) {
    return { category: "audio", confidence: "declared", reason: "endpoint_types 含 audio" };
  }
  // "openai" / "gemini" / "anthropic" are transport shapes, not modalities.
  return null;
}

/** Kacang publishes a tag list; the modality tags are reliable. */
function fromTags(tagsRaw: string | undefined): Classification | null {
  if (!tagsRaw) return null;
  const tags = new Set(
    tagsRaw
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
  );
  if (tags.has("video") || tags.has("sd-video")) {
    return { category: "video", confidence: "declared", reason: "tags 含 video" };
  }
  if (tags.has("image") || tags.has("per-image") || tags.has("image-reference")) {
    return { category: "image", confidence: "declared", reason: "tags 含 image" };
  }
  if (tags.has("audio") || tags.has("music") || tags.has("tts") || tags.has("speech")) {
    return { category: "audio", confidence: "declared", reason: "tags 含 audio/music" };
  }
  if (tags.has("chat") || tags.has("text")) {
    return { category: "text", confidence: "declared", reason: "tags 含 chat/text" };
  }
  return null;
}

/**
 * Billing shape as a modality hint.
 *
 * `video_price` keyed by resolution only exists for video; `image_price` and
 * `unit: "image"` only for images. This is upstream-authored data about the
 * model, so it ranks above the model name but below an explicit declaration.
 */
function fromBillingShape(row: PricingRow): Classification | null {
  if (row.video_price && Object.keys(row.video_price).length > 0) {
    return { category: "video", confidence: "inferred", reason: "存在 video_price 字段" };
  }
  if (row.image_price && Object.keys(row.image_price).length > 0) {
    return { category: "image", confidence: "inferred", reason: "存在 image_price 字段" };
  }
  const blocks = [row.price, ...Object.values(row.group_prices ?? {})].filter(Boolean);
  for (const block of blocks) {
    const unit = block?.unit?.toLowerCase();
    if (unit === "image") return { category: "image", confidence: "inferred", reason: 'price.unit = "image"' };
    if (unit === "second") return { category: "video", confidence: "inferred", reason: 'price.unit = "second"' };
  }
  return null;
}

/**
 * Name patterns, ordered most-specific first.
 *
 * Only reached when the upstream says nothing useful — chiefly 云飞, whose
 * entire catalog is undeclared. Patterns are anchored on family names actually
 * present in the three catalogs rather than generic words, because a substring
 * like "image" also appears in "grok-imagine-video".
 */
const NAME_RULES: Array<{ pattern: RegExp; category: ModelCategory; note: string }> = [
  // Video first: "grok-imagine-video" contains "imagine" AND "video".
  { pattern: /(^|[-_])veo[-_.]?\d/i, category: "video", note: "veo 系列" },
  { pattern: /sora/i, category: "video", note: "sora 系列" },
  { pattern: /kling/i, category: "video", note: "kling 系列" },
  { pattern: /minimaxh3|minimax[-_]?h3/i, category: "video", note: "MiniMax H3 视频" },
  { pattern: /^wan[-_.]?\d/i, category: "video", note: "Wan 系列视频" },
  { pattern: /(^|[-_])sd[-_](mini|fast|\d)/i, category: "video", note: "sd-* 视频系列" },
  { pattern: /video/i, category: "video", note: "名称含 video" },
  { pattern: /runway|pika|hailuo|vidu|seedance/i, category: "video", note: "已知视频厂商" },

  // Audio before image: "suno" and "mureka" carry no other signal.
  { pattern: /^suno|^mureka|^udio/i, category: "audio", note: "已知音乐模型" },
  { pattern: /(^|[-_])(tts|whisper|speech|audio|music)([-_]|$)/i, category: "audio", note: "名称含 tts/audio" },

  { pattern: /gpt[-_]?image/i, category: "image", note: "gpt-image 系列" },
  { pattern: /nano[-_]?banana|banana/i, category: "image", note: "nano-banana 生图" },
  { pattern: /flux|imagen|seedream|midjourney|^mj[-_]|dall[-_]?e|stable[-_]?diffusion/i, category: "image", note: "已知生图模型" },
  { pattern: /[-_]image([-_]|$)|imagine/i, category: "image", note: "名称含 image/imagine" },
  { pattern: /image/i, category: "image", note: "名称含 image" },

  { pattern: /embedding|rerank/i, category: "text", note: "嵌入/重排模型" },
];

function fromName(modelName: string): Classification | null {
  for (const rule of NAME_RULES) {
    if (rule.pattern.test(modelName)) {
      return { category: rule.category, confidence: "guessed", reason: `按名称推断（${rule.note}）` };
    }
  }
  return null;
}

/**
 * Classify one model row.
 *
 * Order matters: an explicit declaration always beats a billing-shape hint,
 * which always beats the model name.
 */
export function classifyModel(row: PricingRow): Classification {
  const name = row.model_name ?? "";

  const declared = fromEndpointTypes(row.supported_endpoint_types ?? []) ?? fromTags(row.tags);
  if (declared) {
    // A declaration of "text" is weaker than a name that clearly says video:
    // Kacang tags some video models chat/text as well. Let a specific name
    // rule override a generic text declaration, but never a specific one.
    if (declared.category === "text") {
      const byName = fromName(name);
      if (byName && byName.category !== "text") {
        return {
          category: byName.category,
          confidence: "inferred",
          reason: `${declared.reason}，但名称显示为${CATEGORY_LABEL[byName.category]}（${byName.reason}），以名称为准`,
        };
      }
    }
    return declared;
  }

  const shape = fromBillingShape(row);
  if (shape) return shape;

  const byName = fromName(name);
  if (byName) return byName;

  // Everything left is a chat-style model on a generic endpoint. Saying "text"
  // here is itself a guess, and it is labelled as one.
  const types = row.supported_endpoint_types ?? [];
  if (types.some((type) => ["openai", "gemini", "anthropic", "openai-response"].includes(type.toLowerCase()))) {
    return { category: "text", confidence: "guessed", reason: "无模态信号，按通用对话端点归为文本" };
  }
  return { category: "unknown", confidence: "guessed", reason: "无任何可用分类信号" };
}
