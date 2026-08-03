import {
  isAvailable,
  type CapabilityCatalog,
  type CapabilityId,
} from "./capabilities";

export type CapabilityPresetId =
  | "chat-default"
  | "image-default"
  | "canvas-default"
  | "video-default";

export type CapabilityPreset = {
  id: CapabilityPresetId;
  label: string;
  capability: CapabilityId;
  /** Studio always needs a real chat model to execute a workflow. */
  selectsFirstAvailableModel: true;
};

export type ResolvedCapabilityPreset = CapabilityPreset & {
  model: string;
};

/**
 * The browser may name a preset but never attach arbitrary model or tool ids.
 * Model selection is resolved from the live server-backed catalog.
 */
export const CAPABILITY_PRESETS: readonly CapabilityPreset[] = [
  {
    id: "chat-default",
    label: "对话与文档",
    capability: "chat",
    selectsFirstAvailableModel: true,
  },
  {
    id: "image-default",
    label: "图像创作",
    capability: "image.generate",
    selectsFirstAvailableModel: true,
  },
  {
    id: "canvas-default",
    label: "画布与图解",
    capability: "canvas.generate",
    selectsFirstAvailableModel: true,
  },
  {
    id: "video-default",
    label: "视频创作",
    capability: "video.generate",
    selectsFirstAvailableModel: true,
  },
] as const;

export function getCapabilityPreset(
  raw: string | null | undefined,
): CapabilityPreset | null {
  const id = raw?.trim() ?? "";
  return CAPABILITY_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function resolveCapabilityPreset(
  raw: string | null | undefined,
  catalog: CapabilityCatalog,
): ResolvedCapabilityPreset | null {
  const preset = getCapabilityPreset(raw);
  if (!preset || !isAvailable(catalog, preset.capability)) return null;

  const model = catalog.models.find((candidate) => candidate.trim().length > 0);
  if (!model) return null;

  return { ...preset, model };
}
