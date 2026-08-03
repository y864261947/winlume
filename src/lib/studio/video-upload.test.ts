import { describe, expect, it } from "vitest";
import {
  isReferenceVideoFile,
  isSupportedReferenceVideoMime,
  referenceVideoMimeType,
} from "./video-upload";

describe("reference video upload policy", () => {
  it("accepts the MVP media formats by MIME type or file extension", () => {
    expect(isSupportedReferenceVideoMime("VIDEO/MP4")).toBe(true);
    expect(isSupportedReferenceVideoMime("video/x-matroska")).toBe(false);
    expect(isReferenceVideoFile({ name: "reference.MOV", type: "" })).toBe(true);
    expect(isReferenceVideoFile({ name: "reference.mp4.exe", type: "" })).toBe(false);
  });

  it("normalizes a browser-unknown extension to a safe upload MIME type", () => {
    expect(referenceVideoMimeType({ name: "reference.webm", type: "" })).toBe(
      "video/webm",
    );
    expect(referenceVideoMimeType({ name: "reference.mov", type: "application/octet-stream" })).toBe(
      "video/quicktime",
    );
  });
});
