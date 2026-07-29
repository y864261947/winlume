import { describe, expect, it } from "vitest";
import { detectAtMention } from "./ArtifactMentionMenu";
import {
  filterMentionCandidates,
  type MentionCandidate,
} from "@/lib/studio/image-mentions";

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

describe("filterMentionCandidates", () => {
  const candidates: MentionCandidate[] = [
    {
      key: "1",
      name: "Red Fox",
      thumbSrc: "",
      source: "artifact",
      artifactId: "1",
    },
    {
      key: "2",
      name: "Blue Sky",
      thumbSrc: "",
      source: "artifact",
      artifactId: "2",
    },
  ];

  it("returns all candidates for an empty query", () => {
    expect(filterMentionCandidates(candidates, "")).toHaveLength(2);
  });

  it("filters case-insensitively by name substring", () => {
    expect(filterMentionCandidates(candidates, "fox").map((a) => a.key)).toEqual([
      "1",
    ]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterMentionCandidates(candidates, "zzz")).toEqual([]);
  });
});
