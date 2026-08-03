import { describe, expect, it } from "vitest";
import { getApiMenuOptions } from "./ModelMarket";
import type { CapabilityCatalog } from "@/lib/studio/capabilities";

const availableCatalog = {
  models: ["gpt-5 mini", "ops/model"],
  capabilities: [
    { id: "chat", availability: "available", supportedTools: [] },
    { id: "image.generate", availability: "available", supportedTools: [] },
    { id: "canvas.generate", availability: "available", supportedTools: [] },
    { id: "video.generate", availability: "needs_setup", supportedTools: [] },
  ],
} satisfies CapabilityCatalog;

describe("homepage API menu options", () => {
  it("sends every live chat model to Studio with the selected model", () => {
    expect(getApiMenuOptions({
      id: "chat",
      label: "语言模型",
      icon: "/chat.svg",
      capability: "chat",
      presetId: "chat-default",
    }, availableCatalog)).toEqual([
      {
        id: "gpt-5 mini",
        label: "gpt-5 mini",
        href: "/studio?preset=chat-default&model=gpt-5%20mini",
      },
      {
        id: "ops/model",
        label: "ops/model",
        href: "/studio?preset=chat-default&model=ops%2Fmodel",
      },
    ]);
  });

  it("exposes fixed creation presets only when their capability is available", () => {
    expect(getApiMenuOptions({
      id: "image",
      label: "图片生成",
      icon: "/image.svg",
      capability: "image.generate",
      presetId: "image-default",
      launchLabel: "打开图像创作",
    }, availableCatalog)).toEqual([
      {
        id: "image-default",
        label: "打开图像创作",
        href: "/studio?preset=image-default",
      },
    ]);

    expect(getApiMenuOptions({
      id: "video",
      label: "视频生成",
      icon: "/video.svg",
      capability: "video.generate",
      presetId: "video-default",
      launchLabel: "打开视频创作",
    }, availableCatalog)).toEqual([]);
  });
});
