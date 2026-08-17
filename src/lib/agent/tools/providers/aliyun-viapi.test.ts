import { describe, expect, it } from "vitest";
import { ToolProviderError } from "./types";
import { AliyunViapiProvider, readAliyunViapiConfig } from "./aliyun-viapi";

describe("readAliyunViapiConfig", () => {
  it("requires a dedicated service identity rather than inferring CLI credentials", () => {
    expect(() => readAliyunViapiConfig({})).toThrow(ToolProviderError);
  });

  it("accepts the constrained private Shanghai OSS configuration", () => {
    expect(
      readAliyunViapiConfig({
        ALIYUN_VIAPI_ACCESS_KEY_ID: "ram-key",
        ALIYUN_VIAPI_ACCESS_KEY_SECRET: "ram-secret",
        ALIYUN_VIAPI_OSS_BUCKET: "private-staging-bucket",
        ALIYUN_VIAPI_OSS_REGION: "oss-cn-shanghai",
      }),
    ).toEqual({
      accessKeyId: "ram-key",
      accessKeySecret: "ram-secret",
      bucket: "private-staging-bucket",
      region: "oss-cn-shanghai",
    });
  });

  it("keeps all segmentation modes behind the existing background-removal capability", () => {
    expect(new AliyunViapiProvider().capabilities).toEqual([
      "image.background_removal",
      "image.upscale",
      "image.watermark_text_removal",
    ]);
  });
});
