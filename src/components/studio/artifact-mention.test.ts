import { describe, expect, it } from "vitest";
import { detectAtMention, filterMentionArtifacts } from "./ArtifactMentionMenu";
import type { Artifact } from "@/lib/agent/types";

describe("detectAtMention", () => {
  it("detects @ at the start of text", () => {
    expect(detectAtMention("@fox", 4)).toEqual({ start: 0, end: 4, query: "fox" });
  });

  it("detects @ after whitespace", () => {
    expect(detectAtMention("edit @fox please", 9)).toEqual({
      start: 5,
      end: 9,
      query: "fox",
    });
  });

  it("returns null when there is no trailing @ token at the cursor", () => {
    expect(detectAtMention("hello world", 11)).toBeNull();
  });

  it("returns null once a space follows the @ token", () => {
    expect(detectAtMention("@fox is done, then more", 8)).toBeNull();
  });

  it("does not trigger on an email-like mid-word @", () => {
    expect(detectAtMention("contact a@b.com", 15)).toBeNull();
  });
});

describe("filterMentionArtifacts", () => {
  const artifacts: Artifact[] = [
    {
      id: "1",
      userId: "u",
      sessionId: "s",
      name: "Red Fox",
      kind: "image",
      mimeType: "image/png",
      storageKey: "",
      createdAt: "t",
    },
    {
      id: "2",
      userId: "u",
      sessionId: "s",
      name: "Blue Sky",
      kind: "image",
      mimeType: "image/png",
      storageKey: "",
      createdAt: "t",
    },
  ];

  it("returns all artifacts for an empty query", () => {
    expect(filterMentionArtifacts(artifacts, "")).toHaveLength(2);
  });

  it("filters case-insensitively by name substring", () => {
    expect(filterMentionArtifacts(artifacts, "fox").map((a) => a.id)).toEqual(["1"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterMentionArtifacts(artifacts, "zzz")).toEqual([]);
  });
});
