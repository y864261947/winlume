import { describe, expect, it } from "vitest";
import { artifactProgress, getShowcaseTimeline } from "./showcase-timeline";
import { showcaseScenes } from "./showcase-scenes";

describe("showcase artifact playback", () => {
  it("speeds every scene and its step gaps up by 30 percent without changing file order", () => {
    for (const scene of showcaseScenes) {
      const baseline = getShowcaseTimeline(scene.files, 1);
      const faster = getShowcaseTimeline(scene.files);
      faster.forEach((item, i) => {
        expect(item.start * 1.3).toBeCloseTo(baseline[i].start);
        expect(item.duration * 1.3).toBeCloseTo(baseline[i].duration);
        expect(item.end * 1.3).toBeCloseTo(baseline[i].end);
        expect(artifactProgress(item.end, item)).toBe(1);
      });
    }
  });
  it("reads the product image and finishes the script before revealing the final video", () => {
    const scene = showcaseScenes.find(scene => scene.id === "video")!;
    expect(scene.files.map(file => file.kind)).toEqual(["image", "document", "video"]);
    expect(scene.files.map(file => file.href?.split(".").at(-1))).toEqual(["jpg", "md", "mp4"]);
    const timeline = getShowcaseTimeline(scene.files);
    expect(artifactProgress(timeline[1].end, timeline[2])).toBe(0);
    expect(timeline[2].start).toBeGreaterThan(timeline[1].end);
    expect(scene.files[scene.completedFileIndex!].kind).toBe("video");
    expect(timeline[2].end).toBeLessThan(26000);
  });
  it("finishes the image set before starting the spreadsheet and document", () => {
    const timeline = getShowcaseTimeline([{kind:"gallery"}, {kind:"sheet"}, {kind:"document"}]);
    expect(timeline[0].duration).toBeGreaterThan(timeline[1].duration);
    for (let i = 1; i < timeline.length; i++) expect(timeline[i].start).toBeGreaterThan(timeline[i - 1].end);
    expect(artifactProgress(timeline[0].end, timeline[0])).toBe(1);
    expect(artifactProgress(timeline[0].end, timeline[1])).toBe(0);
    expect(timeline.at(-1)!.end).toBeLessThan(26000);
  });
  it("clamps waiting and completed files and preserves partial progress", () => {
    const [item] = getShowcaseTimeline([{kind:"document"}]);
    expect(artifactProgress(0, item)).toBe(0);
    expect(artifactProgress(item.start + item.duration / 2, item)).toBeCloseTo(.5);
    expect(artifactProgress(item.end + 5000, item)).toBe(1);
  });
});
