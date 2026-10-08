import { afterEach, describe, expect, it, vi } from "vitest";
import { generateImage, type GenerateImageParams } from "./gateway";

const models = [
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image",
  "gemini-3-pro-image-preview",
];
const imagePart = (value = "image", mimeType = "image/png") => ({
  inlineData: { mimeType, data: Buffer.from(value).toString("base64") },
});
const payload = (...parts: unknown[]) => ({ candidates: [{ content: { parts } }] });
const response = (...parts: unknown[]) => Response.json(payload(...parts));
const params = (fetchImpl: typeof fetch, overrides: Partial<GenerateImageParams> = {}): GenerateImageParams => ({
  prompt: "a red fox", size: "1024x1024", n: 1, model: models[0],
  baseUrl: "https://gateway.test/", token: "test-team-token", fetchImpl, ...overrides,
});

afterEach(() => vi.unstubAllEnvs());

describe("Gemini Banana native image generation", () => {
  it.each(models)("routes precisely %s through native generateContent", async (model) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ text: "done" }, imagePart()));
    expect(await generateImage(params(fetchImpl, { model }))).toEqual([
      { bytes: Buffer.from("image"), mimeType: "image/png" },
    ]);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://gateway.test/v1beta/models/${model}:generateContent`);
    expect(init).toMatchObject({ method: "POST", cache: "no-store", headers: {
      Authorization: "Bearer test-team-token", "Content-Type": "application/json",
    } });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({
      contents: [{ role: "user", parts: [{ text: "a red fox" }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "1:1" } },
    });
  });

  it("uses the existing gateway and service token fallback with environment-selected model", async () => {
    vi.stubEnv("REIZO_GATEWAY_URL", "https://configured.test/");
    vi.stubEnv("REIZO_SERVICE_KEY", "test-service-token");
    vi.stubEnv("REIZO_IMAGE_MODEL", models[1]);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(imagePart()));
    await generateImage(params(fetchImpl, { baseUrl: undefined, token: undefined, model: undefined }));
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://configured.test/v1beta/models/${models[1]}:generateContent`);
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer test-service-token" });
  });

  it.each([
    ["1024x1024", "1:1"], ["1024x1536", "2:3"], ["1536x1024", "3:2"],
  ] as const)("maps %s to aspect ratio %s", async (size, aspectRatio) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(imagePart()));
    await generateImage(params(fetchImpl, { size }));
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)).generationConfig.imageConfig).toEqual({ aspectRatio });
  });

  it("sends all reference images in order as inlineData", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(imagePart()));
    await generateImage(params(fetchImpl, { sourceImages: [
      { bytes: Buffer.from("first"), mimeType: "image/png" },
      { bytes: Buffer.from("second"), mimeType: "image/jpeg" },
    ] }));
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)).contents[0].parts).toEqual([
      { text: "a red fox" }, imagePart("first"), imagePart("second", "image/jpeg"),
    ]);
  });

  it("serializes requests to produce exactly n images", async () => {
    let active = 0;
    let peak = 0;
    let calls = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      calls++;
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return response(imagePart(`image-${calls}`));
    });
    const images = await generateImage(params(fetchImpl, { n: 4 }));
    expect(images.map((image) => image.bytes.toString())).toEqual(["image-1", "image-2", "image-3", "image-4"]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(peak).toBe(1);
  });

  it("extracts images across candidates and parts, preserving MIME and capping to n", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ candidates: [
      { content: { parts: [{ text: "not an image" }, imagePart("one", "image/jpeg")] } },
      { content: { parts: [imagePart("two", "image/webp"), imagePart("three")] } },
    ] }));
    expect(await generateImage(params(fetchImpl, { n: 2 }))).toEqual([
      { bytes: Buffer.from("one"), mimeType: "image/jpeg" },
      { bytes: Buffer.from("two"), mimeType: "image/webp" },
    ]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([0, -1, 1.5, 5, NaN, Infinity])("rejects invalid n=%s before any request", async (n) => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(generateImage(params(fetchImpl, { n }))).rejects.toThrow("integer between 1 and 4");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(["auto", "512x512", "__proto__", "toString"])("rejects unsupported size %s", async (size) => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(generateImage(params(fetchImpl, { size: size as GenerateImageParams["size"] }))).rejects.toThrow("Unsupported Gemini image size");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    { bytes: Buffer.from("<svg/>"), mimeType: "image/svg+xml" },
    { bytes: Buffer.alloc(0), mimeType: "image/png" },
  ])("rejects unsupported or empty source images", async (source) => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(generateImage(params(fetchImpl, { sourceImages: [source] }))).rejects.toThrow("Gemini source images");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    { mimeType: "text/html", data: "aGVsbG8=" },
    { mimeType: "image/svg+xml", data: "aGVsbG8=" },
    { mimeType: "image/png; charset=utf-8", data: "aGVsbG8=" },
    { mimeType: "image/png", data: "%%%" },
    { mimeType: "image/png", data: "a" },
    { mimeType: "image/png", data: "aGVsbG8==" },
    { mimeType: "image/png", data: "" },
    { mimeType: "image/png", data: 42 },
  ])("ignores invalid inline data %# while retaining valid images", async (inlineData) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ inlineData }, imagePart("ok")));
    expect(await generateImage(params(fetchImpl))).toEqual([{ bytes: Buffer.from("ok"), mimeType: "image/png" }]);
  });

  it("accepts valid unpadded base64", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ inlineData: { mimeType: "image/png", data: "aGVsbG8" } }));
    expect((await generateImage(params(fetchImpl)))[0].bytes.toString()).toBe("hello");
  });

  it.each([null, {}, { candidates: {} }, payload({ text: "private prompt echoed" }), { promptFeedback: { blockReason: "SAFETY" } }])(
    "fails safely on malformed or image-less success %#", async (body) => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
      await expect(generateImage(params(fetchImpl))).rejects.toThrow(/Gemini image (generation failed|API returned no valid inline images)/);
      expect(fetchImpl).toHaveBeenCalledOnce();
    },
  );

  it.each([
    [429, JSON.stringify({ error: { message: "private-token aGVsbG8=" } }), "Gemini image request failed (HTTP 429)"],
    [200, JSON.stringify({ error: { message: "private-token aGVsbG8=" } }), "Gemini image generation failed"],
    [200, "private-token <html>aGVsbG8=</html>", "Gemini image API returned invalid JSON"],
  ])("does not expose response data on failure %#", async (status, body, error) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status }));
    await expect(generateImage(params(fetchImpl))).rejects.toThrow(error);
  });

  it("does not expose transport errors and stops on the first failed request", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(imagePart()))
      .mockRejectedValueOnce(new Error("private-token request body"));
    await expect(generateImage(params(fetchImpl, { n: 4 }))).rejects.toThrow("Gemini image request failed or timed out");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each(["gpt-image-2", "gemini-3.1-flash-image-other", "gemini-2.5-flash-image"])(
    "leaves the OpenAI request path unchanged for %s", async (model) => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: [{ b64_json: "aGVsbG8=" }] }));
      await generateImage(params(fetchImpl, { model }));
      expect(fetchImpl.mock.calls[0][0]).toBe("https://gateway.test/v1/images/generations");
    },
  );
});
