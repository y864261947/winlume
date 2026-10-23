type Model = { id: string; name: string; protocol: "openai" | "openai-image" | "openai-chat-image" | "openai-video"; video?: VideoSupport };
type VideoSupport = { startFrame: boolean; endFrame: boolean; camera: boolean; reference: boolean; fields?: string[]; minSeconds?: number; maxSeconds?: number; aspectRatios?: string[]; encoding?: "json"; profileId?: string };
type UpstreamModel = { id?: unknown; supported_endpoint_types?: unknown };
type Capability = { id?: string; known?: boolean; profile_id?: string; profile?: { operations?: { id?: string; path?: string; method?: string; encoding?: string; fields?: string[]; limits?: { min_seconds?: number; max_seconds?: number; max_images?: number; aspect_ratios?: string[] } }[] } };

/** Endpoint flags describe channel surfaces too: a GPT model can incorrectly advertise video. */
export function desktopModelCatalog(data: unknown, capabilities: unknown = []) {
  const catalog: { text: Model[]; image: Model[]; video: Model[] } = { text: [], image: [], video: [] };
  const profiles = new Map((Array.isArray(capabilities) ? capabilities as Capability[] : []).filter(item => item && typeof item.id === "string").map(item => [item.id, item]));
  const seen = new Set<string>();
  for (const item of Array.isArray(data) ? data as UpstreamModel[] : []) {
    if (typeof item?.id !== "string" || !item.id || seen.has(item.id) || !Array.isArray(item.supported_endpoint_types)) continue;
    seen.add(item.id);
    const endpoints = item.supported_endpoint_types;
    const id = (item.id.toLowerCase().split("/").pop() ?? "").replace(/^(?:(?:\[[^\]]*\]|【[^】]*】)\s*)+/, "");
    const model = { id: item.id, name: item.id };
    const imageChat = /^(?:gemini.*(?:image|nano-banana)|nano-banana)/.test(id) && endpoints.includes("openai");
    const videoName = /^(?:sora|veo|wan\d|kling|luma|ray-|seedance|doubao-seedance|firefly-seedance|sd(?:2-5-|-(?:\d|fast-|mini-))|minimaxh\d|hailuo|(?:kc-)?grok-imagine-video)/.test(id);
    const videoOnly = endpoints.includes("openai-video") && !endpoints.some(value => ["openai", "anthropic", "gemini", "image-generation"].includes(value));
    if (endpoints.includes("openai-video") && (videoName || videoOnly)) {
      const support: VideoSupport = { startFrame: false, endFrame: false, camera: false, reference: false };
      const profile = profiles.get(item.id);
      const operations = profile?.profile?.operations;
      const operation = profile?.known && Array.isArray(operations) && operations.find(operation => operation && operation.id === "videos.create" && operation.path === "/v1/videos" && operation.method === "POST" && ["json", "json_or_multipart"].includes(operation.encoding ?? ""));
      if (operation) {
        const fields = (Array.isArray(operation.fields) ? operation.fields : []).filter(field => typeof field === "string");
        support.fields = fields; support.encoding = "json";
        support.startFrame = fields.some(field => ["image", "images", "input_reference"].includes(field)) && (operation.limits?.max_images ?? 0) > 0;
        support.reference = fields.includes("images") && (operation.limits?.max_images ?? 0) > 1;
        for (const [input, output] of [["min_seconds", "minSeconds"], ["max_seconds", "maxSeconds"]] as const) {
          const value = operation.limits?.[input];
          if (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 3600) support[output] = value;
        }
        if (fields.includes("aspect_ratio")) support.aspectRatios = (Array.isArray(operation.limits?.aspect_ratios) ? operation.limits.aspect_ratios : []).filter(value => ["16:9", "9:16", "1:1"].includes(value));
        if (typeof profile.profile_id === "string") support.profileId = profile.profile_id;
      }
      catalog.video.push({ ...model, protocol: "openai-video", video: support });
    } else if (imageChat || endpoints.includes("image-generation")) {
      catalog.image.push({ ...model, protocol: imageChat ? "openai-chat-image" : "openai-image" });
    } else if (endpoints.includes("openai") && !/^(?:mj_|midjourney|suno|.*(?:image|nano-banana))/.test(id)) {
      catalog.text.push({ ...model, protocol: "openai" });
    }
  }
  for (const models of Object.values(catalog)) models.sort((a, b) => a.id.localeCompare(b.id));
  return catalog;
}
