import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  getCurrentUserId: vi.fn(),
  getProject: vi.fn(),
  loadCapabilityCatalog: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));

vi.mock("@/lib/host/web/store-singleton", () => ({
  webStore: {
    sessions: { createSession: mocks.createSession },
    projects: { getProject: mocks.getProject },
  },
}));

vi.mock("@/lib/studio/capabilities.server", () => ({
  loadCapabilityCatalog: mocks.loadCapabilityCatalog,
}));

import { POST } from "./route";

const availableCatalog = {
  models: ["gpt-test"],
  capabilities: [
    { id: "chat", availability: "available", supportedTools: [] },
    { id: "image.generate", availability: "needs_setup", supportedTools: [] },
    { id: "canvas.generate", availability: "needs_setup", supportedTools: [] },
    { id: "sheet.generate", availability: "needs_setup", supportedTools: [] },
    { id: "video.generate", availability: "needs_setup", supportedTools: [] },
  ],
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUserId.mockResolvedValue("user-1");
  mocks.getProject.mockResolvedValue(null);
  mocks.loadCapabilityCatalog.mockResolvedValue(availableCatalog);
  mocks.createSession.mockImplementation(async (input) => ({
    ...input,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
  }));
});

describe("POST /api/sessions", () => {
  it("rejects an unknown or unavailable capability preset", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/sessions", {
        method: "POST",
        body: JSON.stringify({ capabilityPresetId: "not-a-preset" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Capability preset is unavailable",
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("persists only the allowlisted preset and its resolved model", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          title: "从首页进入",
          model: "caller-supplied-model",
          capabilityPresetId: "chat-default",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.loadCapabilityCatalog).toHaveBeenCalledOnce();
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        title: "从首页进入",
        model: "gpt-test",
        capabilityPresetId: "chat-default",
      }),
    );
    expect(await response.json()).toEqual(
      expect.objectContaining({
        model: "gpt-test",
        capabilityPresetId: "chat-default",
      }),
    );
  });
});
