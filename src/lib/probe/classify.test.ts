import { describe, expect, it } from "vitest";
import { categoryLabel, classifyModel, type ModelCategory } from "./classify";
import { scaleTextPrice } from "./cost-ledger";
import type { PricingRow } from "./pricing-pull";

const cat = (row: PricingRow): ModelCategory => classifyModel(row).category;

describe("classification from declared endpoint types", () => {
  it("treats openai-video as authoritative for video", () => {
    const result = classifyModel({ model_name: "x", supported_endpoint_types: ["openai-video"] });
    expect(result.category).toBe("video");
    expect(result.confidence).toBe("declared");
  });

  it("treats image-generation as authoritative for image", () => {
    expect(cat({ model_name: "x", supported_endpoint_types: ["image-generation"] })).toBe("image");
  });

  // "openai"/"gemini"/"anthropic" describe the request shape, not the modality.
  // 云飞 labels veo-3.1-fast and gpt-image-2 both as plain "openai".
  it("does not treat a transport endpoint as a modality", () => {
    const result = classifyModel({ model_name: "veo-3.1-fast", supported_endpoint_types: ["openai"] });
    expect(result.category).toBe("video");
    expect(result.confidence).toBe("guessed");
  });
});

describe("classification from tags", () => {
  it("reads modality tags", () => {
    expect(cat({ model_name: "a", tags: "image,banana,per-image,1k" })).toBe("image");
    expect(cat({ model_name: "b", tags: "video,sd-video,720p" })).toBe("video");
    expect(cat({ model_name: "c", tags: "chat,text,coding" })).toBe("text");
  });

  // Kacang tags some video models with chat/text as well; a specific name
  // must win over a generic text declaration.
  it("lets a specific name override a generic text tag", () => {
    const result = classifyModel({ model_name: "sd-mini-720p", tags: "chat,text" });
    expect(result.category).toBe("video");
    expect(result.confidence).toBe("inferred");
    expect(result.reason).toContain("以名称为准");
  });

  it("does not let a name override a specific declaration", () => {
    const result = classifyModel({
      model_name: "grok-imagine-video",
      supported_endpoint_types: ["image-generation"],
    });
    expect(result.category).toBe("image");
    expect(result.confidence).toBe("declared");
  });
});

describe("classification from billing shape", () => {
  it("infers video from video_price and image from image_price", () => {
    expect(classifyModel({ model_name: "q", video_price: { "720p": 0.08 } })).toMatchObject({
      category: "video",
      confidence: "inferred",
    });
    expect(classifyModel({ model_name: "q", image_price: { "1k": 0.1 } })).toMatchObject({
      category: "image",
      confidence: "inferred",
    });
  });

  it("infers from the price block unit", () => {
    expect(cat({ model_name: "q", price: { unit: "image", request: 0.06 } })).toBe("image");
    expect(cat({ model_name: "q", price: { unit: "second", second: 0.08 } })).toBe("video");
  });
});

describe("name fallback for undeclared catalogs", () => {
  // 云飞 declares nothing useful for any of its 13 models.
  it("classifies the real 云飞 catalog correctly", () => {
    const expected: Array<[string, ModelCategory]> = [
      ["veo-3.1-fast", "video"],
      ["veo-3.1-lite", "video"],
      ["veo-3.1-quality", "video"],
      ["gpt-image-2", "image"],
      ["gpt-image-2.5", "image"],
      ["gpt-image-2.5-flare", "image"],
      ["gpt-image-2.5-sunburst", "image"],
      ["gemini-3-pro-image", "image"],
      ["gemini-3-pro-image-preview", "image"],
      ["gemini-3.1-flash-image", "image"],
      ["gemini-3.1-flash-image-preview", "image"],
      ["grok-imagine-image", "image"],
      ["omni-flash", "text"],
    ];
    for (const [name, want] of expected) {
      expect(cat({ model_name: name, supported_endpoint_types: ["openai"] }), name).toBe(want);
    }
  });

  // "grok-imagine-video" contains both "imagine" and "video"; video must win.
  it("prefers video over image when a name contains both", () => {
    expect(cat({ model_name: "grok-imagine-video" })).toBe("video");
    expect(cat({ model_name: "grok-imagine-video-1.5" })).toBe("video");
    expect(cat({ model_name: "grok-imagine-image" })).toBe("image");
  });

  it("recognises the video families by name", () => {
    for (const name of ["MiniMaxH3-720p-sec", "wan3.0-t2v", "sd-mini-480p", "sora-2", "kling-v2"]) {
      expect(cat({ model_name: name }), name).toBe("video");
    }
  });

  it("recognises music models that carry no other signal", () => {
    expect(cat({ model_name: "suno" })).toBe("audio");
    expect(cat({ model_name: "mureka-v7" })).toBe("audio");
  });

  it("falls back to text for a generic chat endpoint and says it guessed", () => {
    const result = classifyModel({ model_name: "gpt-5.6", supported_endpoint_types: ["openai"] });
    expect(result.category).toBe("text");
    expect(result.confidence).toBe("guessed");
  });

  it("reports unknown rather than guessing text with no signal at all", () => {
    expect(classifyModel({ model_name: "mystery-9000" }).category).toBe("unknown");
  });
});

describe("category labels", () => {
  it("names every category in Chinese", () => {
    expect(categoryLabel("text")).toBe("文本");
    expect(categoryLabel("image")).toBe("图片");
    expect(categoryLabel("video")).toBe("视频");
    expect(categoryLabel("audio")).toBe("音频");
  });
});

describe("text model markup", () => {
  // Input, output and cache all scale by the same multiplier.
  it("scales all three components by one markup", () => {
    const result = scaleTextPrice({ input: 2.4, output: 12, cache: 0.24 }, 1.5);
    expect(result.input).toBeCloseTo(3.6, 10);
    expect(result.output).toBeCloseTo(18, 10);
    expect(result.cache).toBeCloseTo(0.36, 10);
  });

  // The upstream's own cache discount must survive: measured cache/input
  // ratios range from 0.02 to 0.29, so imposing one rate would misprice.
  it("preserves the upstream cache discount ratio", () => {
    const cost = { input: 2.4, output: 12, cache: 0.24 };
    const before = cost.cache / cost.input;
    const after = scaleTextPrice(cost, 2.3);
    expect(after.cache! / after.input!).toBeCloseTo(before, 10);
  });

  it("leaves absent components null instead of zero", () => {
    const result = scaleTextPrice({ input: 1, output: null, cache: null }, 2);
    expect(result.input).toBe(2);
    expect(result.output).toBeNull();
    expect(result.cache).toBeNull();
  });
});
