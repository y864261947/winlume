import { describe, expect, it } from "vitest";
import { readCloudflareR2ArtifactConfig } from "./r2-artifact-blob-store";

describe("Cloudflare R2 artifact configuration", () => {
  it("keeps local artifact storage when R2 is entirely unset", () => {
    expect(readCloudflareR2ArtifactConfig({})).toBeNull();
  });

  it("rejects a partial R2 configuration", () => {
    expect(() => readCloudflareR2ArtifactConfig({
      CLOUDFLARE_R2_ACCOUNT_ID: "account",
      CLOUDFLARE_R2_BUCKET: "bucket",
    })).toThrow(/requires all CLOUDFLARE_R2/);
  });

  it("accepts complete server-only R2 credentials", () => {
    expect(readCloudflareR2ArtifactConfig({
      CLOUDFLARE_R2_ACCOUNT_ID: "account",
      CLOUDFLARE_R2_BUCKET: "reizo-artifacts",
      CLOUDFLARE_R2_ACCESS_KEY_ID: "access-key",
      CLOUDFLARE_R2_SECRET_ACCESS_KEY: "secret-key",
    })).toEqual({
      accountId: "account",
      bucket: "reizo-artifacts",
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
    });
  });
});
