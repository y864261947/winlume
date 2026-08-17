import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  getJob: vi.fn(),
  reconcileEcommerceImageSetJob: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));

vi.mock("@/lib/host/web/store-singleton", () => ({
  webStore: { artifacts: {}, toolJobs: { get: mocks.getJob } },
}));

vi.mock("@/lib/agent/tools/execute", () => ({
  reconcileEcommerceImageSetJob: mocks.reconcileEcommerceImageSetJob,
}));

import { GET } from "./route";

const job = {
  id: "job-1",
  userId: "user-1",
  sessionId: "tool:ecommerce-image-set",
  toolId: "ecommerce-image-set" as const,
  pipelineVersion: "ecommerce-image-set@v1" as const,
  sourceArtifactId: "product-1",
  template: "product" as const,
  size: "1024x1024" as const,
  prompt: "",
  stage: "review" as const,
  outputArtifactIds: ["hero-1", "lifestyle-1", "detail-1"],
  usage: [],
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:01.000Z",
};

describe("GET /api/tool-jobs/[jobId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.getJob.mockResolvedValue(job);
    mocks.reconcileEcommerceImageSetJob.mockResolvedValue(job);
  });

  it("returns a reconciled job without the owner id", async () => {
    const response = await GET(
      new Request("http://localhost/api/tool-jobs/job-1"),
      { params: Promise.resolve({ jobId: "job-1" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      job: expect.not.objectContaining({ userId: expect.anything() }),
    });
    expect(mocks.reconcileEcommerceImageSetJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ toolJobs: expect.any(Object) }),
    );
  });

  it("does not disclose another user's job", async () => {
    mocks.getJob.mockResolvedValue({ ...job, userId: "user-2" });

    const response = await GET(
      new Request("http://localhost/api/tool-jobs/job-1"),
      { params: Promise.resolve({ jobId: "job-1" }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.reconcileEcommerceImageSetJob).not.toHaveBeenCalled();
  });
});
