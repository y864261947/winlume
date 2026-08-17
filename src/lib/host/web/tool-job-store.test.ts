import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEcommerceImageSetJob } from "@/lib/studio/tool-jobs";
import { createToolJobStore } from "./tool-job-store";

describe("ToolJobStore", () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  });

  it("persists and updates an e-commerce image-set job without leaking mutable state", async () => {
    const root = mkdtempSync(join(tmpdir(), "reizo-tool-jobs-"));
    directories.push(root);
    const jobs = createToolJobStore(root);
    const job = createEcommerceImageSetJob({
      userId: "user-1",
      sessionId: "tool:ecommerce-image-set",
      sourceArtifactId: "product-1",
      template: "product",
      size: "1024x1024",
      prompt: "保持标签和材质",
      now: new Date("2026-08-17T00:00:00.000Z"),
    });

    const created = await jobs.create(job);
    created.outputArtifactIds.push("mutated-in-memory");
    expect((await jobs.get(job.id))?.outputArtifactIds).toEqual([]);

    const updated = await jobs.update(job.id, {
      stage: "generating",
      cutoutArtifactId: "cutout-1",
      outputArtifactIds: ["hero-1", "lifestyle-1", "detail-1"],
    });
    expect(updated).toMatchObject({
      stage: "generating",
      cutoutArtifactId: "cutout-1",
      outputArtifactIds: ["hero-1", "lifestyle-1", "detail-1"],
    });

    const reopened = createToolJobStore(root);
    expect(await reopened.get(job.id)).toMatchObject({
      id: job.id,
      sourceArtifactId: "product-1",
      stage: "generating",
    });
  });
});
