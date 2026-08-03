import { describe, expect, it } from "vitest";
import {
  createPendingVideoAnalysis,
  formatVideoTime,
  parseVideoAnalysisContent,
  serializeVideoAnalysisContent,
  stageLabel,
} from "./video-analysis";

describe("video analysis artifact contract", () => {
  it("creates a stable pending envelope", () => {
    const pending = createPendingVideoAnalysis({
      sourceArtifactId: "source-1",
      jobId: "job-1",
      goal: "storyboard",
      now: new Date("2026-08-03T00:00:00.000Z"),
    });
    expect(pending).toMatchObject({
      version: 1,
      sourceArtifactId: "source-1",
      jobId: "job-1",
      goal: "storyboard",
      stage: "queued",
      scenes: [],
    });
    expect(parseVideoAnalysisContent(serializeVideoAnalysisContent(pending))).toEqual(
      pending,
    );
  });

  it("drops malformed scenes without rejecting an otherwise usable worker payload", () => {
    const parsed = parseVideoAnalysisContent({
      version: 1,
      sourceArtifactId: "source-1",
      jobId: "job-1",
      goal: "both",
      stage: "ready",
      updatedAt: "2026-08-03T00:00:00.000Z",
      scenes: [
        {
          id: "valid",
          startMs: 0,
          endMs: 1200,
          purpose: "hook",
          visual: "product close-up",
          narration: "hello",
          screenText: ["first", 3, " second "],
          shot: "close",
          edit: "cut",
          recreation: "rewrite the hook",
        },
        { id: "invalid", startMs: 900, endMs: 900 },
      ],
    });
    expect(parsed?.scenes).toEqual([
      expect.objectContaining({
        id: "valid",
        screenText: ["first", "second"],
      }),
    ]);
  });

  it("rejects invalid envelopes and formats visible time/status values", () => {
    expect(parseVideoAnalysisContent("not json")).toBeNull();
    expect(parseVideoAnalysisContent({ version: 1 })).toBeNull();
    expect(formatVideoTime(61_900)).toBe("1:01");
    expect(stageLabel("detecting_scenes")).toBe("识别镜头");
  });
});
