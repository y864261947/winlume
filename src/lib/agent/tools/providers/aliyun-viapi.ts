import { randomUUID } from "node:crypto";
import ImageSegClient, {
  SegmentClothRequest,
  SegmentCommodityRequest,
  SegmentHDBodyRequest,
  SegmentHDCommonImageRequest,
  SegmentHairRequest,
} from "@alicloud/imageseg20191230";
import ImageEnhanClient, {
  GenerateSuperResolutionImageRequest,
  MakeSuperResolutionImageRequest,
  RemoveImageSubtitlesRequest,
  RemoveImageWatermarkRequest,
} from "@alicloud/imageenhan20190930";
import { $OpenApiUtil } from "@alicloud/openapi-core";
import OSS from "ali-oss";
import {
  isBackgroundRemovalSubject,
  isStudioToolImageMimeType,
} from "@/lib/studio/tool-catalog";
import {
  ToolProviderError,
  type ToolAsset,
  type ToolCapabilityId,
  type ToolInvocationInput,
  type ToolInvocationResult,
  type ToolProvider,
} from "./types";

const INPUT_URL_TTL_SECONDS = 10 * 60;
const MAX_PROVIDER_OUTPUT_BYTES = 12 * 1024 * 1024;

export type AliyunViapiConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: "oss-cn-shanghai";
};

function requiredEnv(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ToolProviderError(
      "configuration",
      "图片编辑服务尚未配置，请联系管理员完成服务接入。",
    );
  }
  return value;
}

/**
 * Reads only the production service identity. This deliberately does not
 * consult local Aliyun CLI profiles, OAuth sessions, or any developer config.
 */
export function readAliyunViapiConfig(
  env: Record<string, string | undefined> = process.env,
): AliyunViapiConfig {
  const region = (env.ALIYUN_VIAPI_OSS_REGION ?? "oss-cn-shanghai").trim();
  if (region !== "oss-cn-shanghai") {
    throw new ToolProviderError(
      "configuration",
      "图片编辑服务的 OSS 区域必须配置为上海。",
    );
  }
  return {
    accessKeyId: requiredEnv(env, "ALIYUN_VIAPI_ACCESS_KEY_ID"),
    accessKeySecret: requiredEnv(env, "ALIYUN_VIAPI_ACCESS_KEY_SECRET"),
    bucket: requiredEnv(env, "ALIYUN_VIAPI_OSS_BUCKET"),
    region,
  };
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/png":
    default:
      return "png";
  }
}

function inputUrlFor(
  oss: OSS,
  config: AliyunViapiConfig,
  objectName: string,
): string {
  const signedUrl = oss.signatureUrl(objectName, {
    expires: INPUT_URL_TTL_SECONDS,
    method: "GET",
  });
  const url = new URL(signedUrl);
  const expectedHost = `${config.bucket}.${config.region}.aliyuncs.com`;
  if (url.protocol !== "https:" || url.hostname !== expectedHost) {
    throw new ToolProviderError(
      "configuration",
      "图片编辑服务无法生成可用的图片访问地址。",
    );
  }
  return signedUrl;
}

function outputMimeType(response: Response): string {
  const rawMimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const mimeType = rawMimeType === "image/jpg" ? "image/jpeg" : rawMimeType;
  if (!mimeType || !isStudioToolImageMimeType(mimeType)) {
    throw new ToolProviderError("invalid_result", "图片编辑服务返回了无效图片。");
  }
  return mimeType;
}

async function downloadProviderOutput(url: string): Promise<ToolAsset> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new ToolProviderError("unavailable", "图片编辑服务暂时不可用，请稍后重试。");
  }
  if (!response.ok) {
    throw new ToolProviderError("unavailable", "图片编辑服务暂时不可用，请稍后重试。");
  }
  const mimeType = outputMimeType(response);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_PROVIDER_OUTPUT_BYTES) {
    throw new ToolProviderError("invalid_result", "图片编辑服务返回了无效图片。");
  }
  return { bytes, mimeType };
}

function createImageSegClient(config: AliyunViapiConfig): ImageSegClient {
  return new ImageSegClient(
    new $OpenApiUtil.Config({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      endpoint: "imageseg.cn-shanghai.aliyuncs.com",
    }),
  );
}

function createImageEnhanClient(config: AliyunViapiConfig): ImageEnhanClient {
  return new ImageEnhanClient(
    new $OpenApiUtil.Config({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      endpoint: "imageenhan.cn-shanghai.aliyuncs.com",
    }),
  );
}

function outputUrl(value: string | undefined, capability: ToolCapabilityId): string {
  if (!value) {
    throw new ToolProviderError(
      "invalid_result",
      `${capability} 服务没有返回图片结果。`,
    );
  }
  return value;
}

function outputElementUrl(
  elements: readonly { imageURL?: string }[] | undefined,
  capability: ToolCapabilityId,
): string {
  return outputUrl(elements?.find((element) => element.imageURL)?.imageURL, capability);
}

async function invokeAliyunCapability(
  capability: ToolCapabilityId,
  input: ToolInvocationInput,
  config: AliyunViapiConfig,
  imageUrl: string,
): Promise<string> {
  if (capability === "image.background_removal") {
    const client = createImageSegClient(config);
    const subject = isBackgroundRemovalSubject(input.params?.subject)
      ? input.params.subject
      : "auto";

    switch (subject) {
      case "person": {
        const response = await client.segmentHDBody(
          new SegmentHDBodyRequest({ imageURL: imageUrl }),
        );
        return outputUrl(response.body?.data?.imageURL, capability);
      }
      case "garment": {
        const response = await client.segmentCloth(
          new SegmentClothRequest({ imageURL: imageUrl }),
        );
        return outputElementUrl(response.body?.data?.elements, capability);
      }
      case "hair": {
        const response = await client.segmentHair(
          new SegmentHairRequest({ imageURL: imageUrl }),
        );
        return outputElementUrl(response.body?.data?.elements, capability);
      }
      case "auto":
      case "general_hd": {
        const response = await client.segmentHDCommonImage(
          new SegmentHDCommonImageRequest({ imageUrl }),
        );
        return outputUrl(response.body?.data?.imageUrl, capability);
      }
      case "product": {
        const response = await client.segmentCommodity(
          new SegmentCommodityRequest({ imageURL: imageUrl }),
        );
        return outputUrl(response.body?.data?.imageURL, capability);
      }
    }
  }

  const client = createImageEnhanClient(config);
  if (capability === "image.watermark_text_removal") {
    const target = input.params?.target === "subtitles" ? "subtitles" : "watermark";
    if (target === "subtitles") {
      const response = await client.removeImageSubtitles(
        new RemoveImageSubtitlesRequest({ imageURL: imageUrl }),
      );
      return outputUrl(response.body?.data?.imageURL, capability);
    }
    const response = await client.removeImageWatermark(
      new RemoveImageWatermarkRequest({ imageURL: imageUrl }),
    );
    return outputUrl(response.body?.data?.imageURL, capability);
  }

  if (capability === "image.upscale") {
    if (input.params?.mode === "generative") {
      const response = await client.generateSuperResolutionImage(
        new GenerateSuperResolutionImageRequest({
          imageUrl,
          outputFormat: "jpg",
          outputQuality: 95,
          scale: 2,
        }),
      );
      return outputUrl(response.body?.data?.resultUrl, capability);
    }
    const response = await client.makeSuperResolutionImage(
      new MakeSuperResolutionImageRequest({
        url: imageUrl,
        mode: "base",
        outputFormat: "jpg",
        outputQuality: 95,
        upscaleFactor: 2,
      }),
    );
    return outputUrl(response.body?.data?.url, capability);
  }

  throw new ToolProviderError("configuration", "该图片工具尚未配置服务。");
}

/** Official VIAPI adapter. Each invocation stages one private OSS object. */
export class AliyunViapiProvider implements ToolProvider {
  readonly id = "aliyun-viapi";
  readonly capabilities = [
    "image.background_removal",
    "image.upscale",
    "image.watermark_text_removal",
  ] as const;

  async invoke(
    capability: ToolCapabilityId,
    input: ToolInvocationInput,
  ): Promise<ToolInvocationResult> {
    const source = input.images[0];
    if (!source?.bytes.length || !isStudioToolImageMimeType(source.mimeType)) {
      throw new ToolProviderError("invalid_result", "请选择一张有效的图片。");
    }

    const config = readAliyunViapiConfig();
    const oss = new OSS({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      bucket: config.bucket,
      region: config.region,
      secure: true,
      timeout: 30_000,
    });
    const objectName = `reizo/studio-tools/${randomUUID()}.${extensionForMimeType(source.mimeType)}`;

    try {
      await oss.put(objectName, source.bytes, {
        headers: { "Content-Type": source.mimeType },
      });
      const imageURL = inputUrlFor(oss, config, objectName);
      const providerUrl = await invokeAliyunCapability(capability, input, config, imageURL);
      return { status: "completed", outputs: [await downloadProviderOutput(providerUrl)] };
    } catch (error) {
      if (error instanceof ToolProviderError) throw error;
      throw new ToolProviderError("unavailable", "图片编辑服务暂时不可用，请稍后重试。");
    } finally {
      await oss.delete(objectName).catch(() => {
        // A bucket lifecycle rule is the backstop if a transient cleanup fails.
      });
    }
  }
}
