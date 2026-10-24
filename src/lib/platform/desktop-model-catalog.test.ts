import { expect, it } from "vitest";
import { desktopModelCatalog } from "./desktop-model-catalog";

it("separates multimodal catalogs despite channel-level video flags and preserves routed IDs", () => {
  const model = (id: string, ...supported_endpoint_types: string[]) => ({ id, supported_endpoint_types });
  const result = desktopModelCatalog([
    model("gpt-6-astra", "openai", "openai-video"), model("gpt-image-2", "openai", "image-generation", "openai-video"),
    model("[满血G]gemini-3.1-flash-image", "openai", "openai-video"), model("nano-banana-2.1", "openai"),
    model("sd-fast-720p", "openai-video"), model("MiniMaxH3-720p", "openai-video"), model("wan3.0-video", "openai-video"),
    model("grok-imagine-video", "openai", "openai-video"), model("suno-v6", "openai", "openai-video"),
    model("mj_imagine", "openai", "openai-video"), model("native-claude", "anthropic"), model("wan3.0-video", "openai-video"), null,
  ], [null, { id: "not-in-account", known: true }]);
  expect(result.text.map(item => item.id)).toEqual(["gpt-6-astra"]);
  expect(result.image).toHaveLength(3);
  expect(result.image.find(item => item.id.startsWith("[满血G]"))?.protocol).toBe("openai-chat-image");
  expect(result.video).toHaveLength(4);
  expect(result.video.every(item => item.video?.startFrame === false && item.video?.camera === false)).toBe(true);
});

it("only exposes confirmed video fields and bounded parameter metadata", () => {
  const catalog = desktopModelCatalog([{ id: "sora-2", supported_endpoint_types: ["openai-video"] }], [{ id: "sora-2", known: true, profile_id: "fixture", profile: { operations: [{ id: "videos.create", path: "/v1/videos", method: "POST", encoding: "json", fields: ["model", "prompt", "seconds", "aspect_ratio"], limits: { min_seconds: 4, max_seconds: 12, aspect_ratios: ["16:9", "not-ratio"] } }] } }]);
  expect(catalog.video[0].video).toMatchObject({ minSeconds: 4, maxSeconds: 12, aspectRatios: ["16:9"], startFrame: false, profileId: "fixture" });
});
