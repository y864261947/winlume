import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_IMAGE_BYTES } from "@/lib/studio/composer-attachments";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  write: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));

vi.mock("@/lib/host/web/store-singleton", () => ({
  webStore: { artifacts: { write: mocks.write } },
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ toolId: "background-removal" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUserId.mockResolvedValue("user-1");
  mocks.write.mockImplementation(async (meta) => meta);
});

describe("POST /api/tools/[toolId]/upload", () => {
  it("requires authentication before parsing or persisting input", async () => {
    mocks.getCurrentUserId.mockResolvedValueOnce(null);
    const response = await POST(
      new NextRequest("http://localhost/api/tools/background-removal/upload", {
        method: "POST",
        body: JSON.stringify({ name: "shoe.png", dataUrl: "data:image/png;base64,eA==" }),
      }),
      context,
    );

    expect(response.status).toBe(401);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("stores a validated tool upload in the synthetic tool scope", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/tools/background-removal/upload", {
        method: "POST",
        body: JSON.stringify({ name: " shoe.png ", dataUrl: "data:image/png;base64,eA==" }),
      }),
      context,
    );

    expect(response.status).toBe(201);
    expect(mocks.write).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        sessionId: "tool:background-removal",
        name: "shoe.png",
        kind: "image",
        mimeType: "image/png",
        status: "ready",
      }),
      Buffer.from("x"),
    );
  });

  it("rejects image formats outside the tool contract", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/tools/background-removal/upload", {
        method: "POST",
        body: JSON.stringify({ name: "shoe.gif", dataUrl: "data:image/gif;base64,eA==" }),
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("enforces the same image-size limit as Composer uploads", async () => {
    const tooLarge = Buffer.alloc(MAX_IMAGE_BYTES + 1, 1).toString("base64");
    const response = await POST(
      new NextRequest("http://localhost/api/tools/background-removal/upload", {
        method: "POST",
        body: JSON.stringify({
          name: "large.png",
          dataUrl: `data:image/png;base64,${tooLarge}`,
        }),
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "图片不能超过 2 MB" });
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
