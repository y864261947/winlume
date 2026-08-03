import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  canTransitionVideoJob,
  createVideoJobStore,
} from "./video-job-store";

describe("video job store", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const directory of dirs) rmSync(directory, { recursive: true, force: true });
  });

  it("persists jobs across store instances and clears transient errors", async () => {
    const root = mkdtempSync(join(tmpdir(), "wl-video-jobs-"));
    dirs.push(root);
    const store = createVideoJobStore(root);
    await store.create({
      id: "job-1",
      userId: "user-1",
      sessionId: "session-1",
      sourceArtifactId: "source-1",
      analysisArtifactId: "analysis-1",
      goal: "both",
      stage: "queued",
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
    });
    await store.update("job-1", { stage: "probing", error: "worker unavailable" });
    const reloaded = await createVideoJobStore(root).get("job-1");
    expect(reloaded).toMatchObject({ stage: "probing", error: "worker unavailable" });

    const cleared = await store.update("job-1", { stage: "detecting_scenes", error: "" });
    expect(cleared.error).toBeUndefined();
  });

  it("permits forward work and terminal failures only", () => {
    expect(canTransitionVideoJob("queued", "probing")).toBe(true);
    expect(canTransitionVideoJob("interpreting", "ready")).toBe(true);
    expect(canTransitionVideoJob("ready", "probing")).toBe(false);
    expect(canTransitionVideoJob("ready", "ready")).toBe(false);
    expect(canTransitionVideoJob("failed", "ready")).toBe(false);
    expect(canTransitionVideoJob("detecting_scenes", "failed")).toBe(true);
  });
});
