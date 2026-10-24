import type { Outcome } from "./showcase-scenes";

export const SHOWCASE_PLAYBACK_RATE = 1.3;
export const SHOWCASE_COMPLETION_HOLD = 3000 / SHOWCASE_PLAYBACK_RATE;

export function getShowcaseTimeline(files: Pick<Outcome, "kind">[], rate = SHOWCASE_PLAYBACK_RATE) {
  let start = 900 / rate;
  return files.map(file => {
    const duration = (file.kind === "gallery" ? 7600 : file.kind === "image" ? 3200 : 4600) / rate;
    const item = { start, end: start + duration, duration };
    start = item.end + 500 / rate;
    return item;
  });
}

export function artifactProgress(elapsed: number, item: { start: number; duration: number }) {
  if (elapsed >= item.start + item.duration) return 1;
  return Math.max(0, Math.min(1, (elapsed - item.start) / item.duration));
}
