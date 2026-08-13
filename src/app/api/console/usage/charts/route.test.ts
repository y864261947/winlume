import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  getPlatformRepositories: vi.fn(),
  getUserQuotaDates: vi.fn(),
  decryptSecret: vi.fn((value: string) => value.replace(/^enc\(|\)$/g, "")),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));

vi.mock("@/lib/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform")>();
  return {
    ...actual,
    getPlatformRepositories: mocks.getPlatformRepositories,
  };
});

vi.mock("@/lib/newapi/team-client", () => ({
  getUserQuotaDates: mocks.getUserQuotaDates,
}));

vi.mock("@/lib/newapi/crypto", () => ({
  decryptSecret: mocks.decryptSecret,
}));

import { GET } from "./route";

describe("GET /api/console/usage/charts", () => {
  beforeEach(() => {
    mocks.getCurrentUserId.mockReset();
    mocks.getPlatformRepositories.mockReset();
    mocks.getUserQuotaDates.mockReset();
    mocks.decryptSecret.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns sanitized daily and model series for a workspace", async () => {
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    mocks.getUserQuotaDates.mockResolvedValue([
      {
        model_name: "gpt-4o",
        created_at: Math.floor(today.getTime() / 1000),
        count: 2,
        quota: 500_000,
        username: "team-hidden",
        use_group: "gpt-pro",
        channel_id: 9,
      },
    ]);
    mocks.getPlatformRepositories.mockReturnValue({
      users: {
        findById: vi.fn().mockResolvedValue({
          id: "user-1",
          status: "active",
          currentOrganizationId: "org-1",
        }),
      },
      organizations: {
        listMembershipsForUser: vi.fn().mockResolvedValue([
          { organizationId: "org-1", role: "owner" },
        ]),
        findById: vi.fn().mockResolvedValue({ id: "org-1", name: "Acme", slug: "acme" }),
      },
      teamNewApiMapping: {
        findByOrganizationId: vi.fn().mockResolvedValue({
          organizationId: "org-1",
          newApiPatCiphertext: "enc(pat-xyz)",
        }),
      },
    });

    const response = await GET(new Request("https://reizo.example/api/console/usage/charts?organizationId=org-1"));
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      organizationId: string;
      daily: Array<{ date: string; credits: number; requests: number }>;
      byModel: Array<{ model: string; credits: number; requests: number }>;
    };
    expect(payload.organizationId).toBe("org-1");
    expect(payload.daily).toHaveLength(14);
    expect(payload.daily.at(-1)?.credits).toBe(1);
    expect(payload.daily.at(-1)?.requests).toBe(2);
    expect(payload.byModel).toEqual([{ model: "gpt-4o", credits: 1, requests: 2 }]);
    expect(JSON.stringify(payload)).not.toMatch(/gpt-pro|team-hidden|channel/i);
    expect(mocks.getUserQuotaDates).toHaveBeenCalledWith("pat-xyz", expect.objectContaining({
      startTimestamp: expect.any(Number),
      endTimestamp: expect.any(Number),
    }));
  });
});
