import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { parseSheetContent } from "@/lib/agent/sheet-content";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  getSession: vi.fn(),
  write: vi.fn(),
  publishArtifactEvent: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));

vi.mock("@/lib/host/web/store-singleton", () => ({
  webStore: {
    sessions: { getSession: mocks.getSession },
    artifacts: { write: mocks.write },
  },
}));

vi.mock("@/lib/agent/artifact-events", () => ({
  publishArtifactEvent: mocks.publishArtifactEvent,
}));

import { POST } from "./route";

async function xlsxBytes(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("OE");
  sheet.getCell("A1").value = "OE号";
  sheet.getCell("B1").value = "价格";
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUserId.mockResolvedValue("user-1");
  mocks.getSession.mockResolvedValue({
    id: "s1",
    userId: "user-1",
    projectId: "p1",
  });
  mocks.write.mockImplementation(async (meta, content) => ({
    ...meta,
    content,
  }));
});

describe("POST /api/artifacts/upload-sheet", () => {
  it("requires authentication", async () => {
    mocks.getCurrentUserId.mockResolvedValueOnce(null);
    const response = await POST(
      new NextRequest("http://localhost/api/artifacts/upload-sheet", {
        method: "POST",
        headers: {
          "x-reizo-session-id": "s1",
          "x-reizo-artifact-name": encodeURIComponent("a.xlsx"),
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        body: new Uint8Array(await xlsxBytes()),
      }),
    );
    expect(response.status).toBe(401);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("imports an xlsx workbook as a ready sheet artifact", async () => {
    const bytes = await xlsxBytes();
    const response = await POST(
      new NextRequest("http://localhost/api/artifacts/upload-sheet", {
        method: "POST",
        headers: {
          "x-reizo-session-id": "s1",
          "x-reizo-artifact-name": encodeURIComponent("明泰克斯.xlsx"),
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        body: new Uint8Array(bytes),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.write).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        sessionId: "s1",
        projectId: "p1",
        name: "明泰克斯",
        kind: "sheet",
        status: "ready",
      }),
      expect.any(String),
    );
    const serialized = mocks.write.mock.calls[0]?.[1] as string;
    const content = parseSheetContent(serialized);
    expect(content?.sheets[0]?.name).toBe("OE");
    expect(mocks.publishArtifactEvent).toHaveBeenCalled();
  });

  it("rejects legacy .xls", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/artifacts/upload-sheet", {
        method: "POST",
        headers: {
          "x-reizo-session-id": "s1",
          "x-reizo-artifact-name": encodeURIComponent("old.xls"),
          "content-type": "application/vnd.ms-excel",
        },
        body: new Uint8Array(Buffer.from("x")),
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
