import { describe, expect, it } from "vitest";
import { imageArtifactExtension } from "./artifact-download";

describe("imageArtifactExtension", () => {
  it("maps supported image MIME types to download extensions", () => {
    expect(imageArtifactExtension("image/jpeg")).toBe(".jpg");
    expect(imageArtifactExtension("image/webp")).toBe(".webp");
    expect(imageArtifactExtension("image/png")).toBe(".png");
  });

  it("defaults an absent MIME type to PNG", () => {
    expect(imageArtifactExtension()).toBe(".png");
  });
});
