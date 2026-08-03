export const CAPABILITY_IDS = [
  "chat",
  "image.generate",
  "canvas.generate",
  "video.generate",
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export type CapabilityAvailability =
  | "available"
  | "degraded"
  | "needs_setup"
  | "unavailable";

export type CapabilityRecord = {
  id: CapabilityId;
  availability: CapabilityAvailability;
  supportedTools: readonly string[];
  effectiveModel?: string;
  reason?: string;
};

export type CapabilityCatalog = {
  models: readonly string[];
  capabilities: readonly CapabilityRecord[];
};

export type CapabilityCatalogInput = {
  configuredFamilies: Iterable<string>;
  modelIds: Iterable<string>;
  /** False only when a safe server-side probe could not reach the gateway. */
  gatewayReachable?: boolean;
};

const CHAT_TOOLS = [
  "todo_write",
  "write_artifact",
  "read_artifact",
  "list_artifacts",
] as const;

function normalizedUnique(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || normalized.length > 160 || /[\u0000-\u001f]/.test(normalized)) {
      continue;
    }
    seen.add(normalized);
  }
  return [...seen];
}

function unavailableRecord(
  id: CapabilityId,
  availability: Exclude<CapabilityAvailability, "available">,
  reason: string,
): CapabilityRecord {
  return { id, availability, supportedTools: [], reason };
}

/**
 * Convert only public gateway facts into a browser-safe capability catalog.
 * This function deliberately never accepts, retains, or returns gateway errors.
 */
export function buildCapabilityCatalog(
  input: CapabilityCatalogInput,
): CapabilityCatalog {
  const configuredFamilies = new Set(normalizedUnique(input.configuredFamilies));
  const models = normalizedUnique(input.modelIds);
  const gatewayReachable = input.gatewayReachable ?? true;
  const hasChatFamily = configuredFamilies.has("openai");
  const hasImageFamily = configuredFamilies.has("images");
  const effectiveModel = models[0];

  const chat = !gatewayReachable
    ? unavailableRecord("chat", "degraded", "模型服务暂时不可用")
    : !hasChatFamily
      ? unavailableRecord("chat", "needs_setup", "尚未配置对话模型")
      : !effectiveModel
        ? unavailableRecord("chat", "degraded", "暂无可用对话模型")
        : {
            id: "chat" as const,
            availability: "available" as const,
            supportedTools: CHAT_TOOLS,
            effectiveModel,
          };

  const image = !gatewayReachable
    ? unavailableRecord("image.generate", "degraded", "图像服务状态暂不可用")
    : !hasImageFamily
      ? unavailableRecord("image.generate", "needs_setup", "尚未配置图像生成服务")
      : {
          id: "image.generate" as const,
          availability: "available" as const,
          supportedTools: ["generate_image"],
        };

  const canvas = chat.availability === "available"
    ? {
        id: "canvas.generate" as const,
        availability: "available" as const,
        supportedTools: ["generate_canvas"],
        effectiveModel: chat.effectiveModel,
      }
    : unavailableRecord(
        "canvas.generate",
        chat.availability === "degraded" ? "degraded" : "needs_setup",
        chat.reason ?? "需要可用的对话模型",
      );

  const video = unavailableRecord(
    "video.generate",
    gatewayReachable ? "needs_setup" : "degraded",
    gatewayReachable ? "视频生成服务尚未接入" : "视频服务状态暂不可用",
  );

  return {
    models,
    capabilities: [chat, image, canvas, video],
  };
}

export function isAvailable(
  catalog: CapabilityCatalog,
  id: CapabilityId,
): boolean {
  return catalog.capabilities.some(
    (entry) => entry.id === id && entry.availability === "available",
  );
}
