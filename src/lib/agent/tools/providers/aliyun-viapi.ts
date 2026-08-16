import { randomUUID } from "node:crypto";
import ImageSegClient, {
  SegmentBodyRequest,
  SegmentClothRequest,
  SegmentCommodityRequest,
  SegmentCommonImageRequest,
} from "@alicloud/imageseg20191230";
import { $OpenApiUtil } from "@alicloud/openapi-core";
import OSS from "ali-oss";
import {
  parseBackgroundRemovalSubject,
  type BackgroundRemovalSubject,
} from "@/lib/studio/background-removal";
import { isStudioToolImageMimeType } from "@/lib/studio/tool-catalog";
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
      "商品抠图服务尚未配置，请联系管理员完成服务接入。",
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
      "商品抠图服务的 OSS 区域必须配置为上海。",
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
      "商品抠图服务无法生成可用的图片访问地址。",
    );
  }
  return signedUrl;
}

function outputMimeType(response: Response): string {
  const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mimeType !== "image/png") {
    throw new ToolProviderError("invalid_result", "商品抠图服务返回了无效图片。");
  }
  return mimeType;
}

export type SegmentResultBody = {
  data?: {
    imageURL?: string;
    elements?: Array<{ imageURL?: string }>;
  };
};

export function providerImageUrlFromSegmentResult(
  subject: BackgroundRemovalSubject,
  body: SegmentResultBody | undefined,
): string | undefined {
  if (subject === "garment") return body?.data?.elements?.[0]?.imageURL;
  return body?.data?.imageURL;
}

async function segmentBySubject(
  client: ImageSegClient,
  subject: BackgroundRemovalSubject,
  imageURL: string,
): Promise<SegmentResultBody | undefined> {
  switch (subject) {
    case "person":
      return (await client.segmentBody(new SegmentBodyRequest({ imageURL }))).body;
    case "garment":
      return (await client.segmentCloth(new SegmentClothRequest({ imageURL }))).body;
    case "general":
      return (await client.segmentCommonImage(new SegmentCommonImageRequest({ imageURL }))).body;
    case "product":
    default:
      return (await client.segmentCommodity(new SegmentCommodityRequest({ imageURL }))).body;
  }
}

async function downloadProviderOutput(url: string): Promise<ToolAsset> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new ToolProviderError("unavailable", "商品抠图服务暂时不可用，请稍后重试。");
  }
  if (!response.ok) {
    throw new ToolProviderError("unavailable", "商品抠图服务暂时不可用，请稍后重试。");
  }
  const mimeType = outputMimeType(response);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_PROVIDER_OUTPUT_BYTES) {
    throw new ToolProviderError("invalid_result", "商品抠图服务返回了无效图片。");
  }
  return { bytes, mimeType };
}

/** Official VIAPI adapter. Each invocation stages one private OSS object. */
export class AliyunViapiProvider implements ToolProvider {
  readonly id = "aliyun-viapi";
  readonly capabilities = ["image.background_removal"] as const;

  async invoke(
    capability: ToolCapabilityId,
    input: ToolInvocationInput,
  ): Promise<ToolInvocationResult> {
    if (capability !== "image.background_removal") {
      throw new ToolProviderError("configuration", "该图片工具尚未配置服务。");
    }
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
      const subject = parseBackgroundRemovalSubject(input.params?.subject);
      const client = new ImageSegClient(
        new $OpenApiUtil.Config({
          accessKeyId: config.accessKeyId,
          accessKeySecret: config.accessKeySecret,
          endpoint: "imageseg.cn-shanghai.aliyuncs.com",
        }),
      );
      const providerUrl = providerImageUrlFromSegmentResult(
        subject,
        await segmentBySubject(client, subject, imageURL),
      );
      if (!providerUrl) {
        throw new ToolProviderError("invalid_result", "商品抠图服务没有返回图片结果。");
      }
      return { status: "completed", outputs: [await downloadProviderOutput(providerUrl)] };
    } catch (error) {
      if (error instanceof ToolProviderError) throw error;
      throw new ToolProviderError("unavailable", "商品抠图服务暂时不可用，请稍后重试。");
    } finally {
      await oss.delete(objectName).catch(() => {
        // A bucket lifecycle rule is the backstop if a transient cleanup fails.
      });
    }
  }
}
