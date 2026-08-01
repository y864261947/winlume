import { describe, expect, it } from "vitest";
import { matchPublicRoute } from "./routes";

describe("public protocol route catalog", () => {
  it.each([
    ["openai", "/v1/chat/completions"],
    ["claude", "/v1/messages"],
    ["gemini", "/v1beta/models/gemini-2.5-pro:generateContent"],
    ["images", "/v1/images/generations"],
    ["audio", "/v1/audio/speech"],
    ["embeddings", "/v1/embeddings"],
    ["realtime", "/v1/realtime"],
    ["task", "/api/task/123"],
    ["midjourney", "/mj/submit/imagine"],
    ["suno", "/suno/submit/music"],
    ["video", "/v1/videos/generations"],
  ])("classifies %s routes", (family, path) => {
    expect(matchPublicRoute(path, "POST")?.family).toBe(family);
  });
});
