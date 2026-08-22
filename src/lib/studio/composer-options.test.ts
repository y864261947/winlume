import { describe, expect, it } from "vitest";
import {
  composerOptionsReminder,
  normalizeComposerOptions,
  toolNamesForComposerMode,
} from "./composer-options";

describe("composer options", () => {
  it("normalizes image settings and drops unsupported fields", () => {
    expect(
      normalizeComposerOptions({
        mode: "image",
        size: "1536x1024",
        count: 3,
        toolId: "background-removal",
        toolParams: { subject: "product" },
        style: "ignored",
      }),
    ).toEqual({
      mode: "image",
      size: "1536x1024",
      count: 3,
      toolId: "background-removal",
      toolParams: { subject: "product" },
    });
    expect(normalizeComposerOptions({ mode: "unknown" })).toBeNull();
  });

  it("limits a turn to the selected artifact family", () => {
    expect(toolNamesForComposerMode("canvas")).toContain("generate_canvas");
    expect(toolNamesForComposerMode("canvas")).not.toContain("generate_image");
    expect(toolNamesForComposerMode("chat")).toBeUndefined();
  });

  it("renders the selected image parameters as runtime context", () => {
    expect(composerOptionsReminder({ mode: "image", size: "1024x1536", count: 2 })).toContain(
      "1024x1536",
    );
    expect(composerOptionsReminder({ mode: "video" })).toContain("尚未接入");
  });
});
