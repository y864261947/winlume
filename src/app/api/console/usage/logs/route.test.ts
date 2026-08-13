import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  getPlatformRepositories: vi.fn(),
  getUserLogs: vi.fn(),
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
  getUserLogs: mocks.getUserLogs,
}));

vi.mock("@/lib/newapi/crypto", () => ({
  decryptSecret: mocks.decryptSecret,
}));

import { GET } from "./route";

describe("GET /api/console/usage/logs", () => {
  beforeEach(() => {
    mocks.getCurrentUserId.mockReset();
    mocks.getPlatformRepositories.mockReset();
    mocks.getUserLogs.mockReset();
    mocks.decryptSecret.mockClear();
  });

  it("pages and filters logs without exposing routing internals", async () => {
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.getUserLogs.mockResolvedValue({
      page: 2,
      pageSize: 20,
      total: 40,
      items: [{
        created_at: 1_800_000_000,
        type: 2,
        token_name: "prod",
        model_name: "gpt-4o",
        quota: 500_000,
        prompt_tokens: 1,
        completion_tokens: 2,
        use_time: 3,
        is_stream: true,
        request_id: "req-1",
        group: "gpt-pro",
        channel: 9,
      }],
    });
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
          { organizationId: "org-1", role: "member" },
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

    const response = await GET(new Request("https://reizo.example/api/console/usage/logs?organizationId=org-1&page=2&pageSize=20&type=consume"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.total).toBe(40);
    expect(payload.page).toBe(2);
    expect(payload.items[0]).toMatchObject({
      type: "consume",
      model: "gpt-4o",
      tokenName: "prod",
      requestId: "req-1",
    });
    expect(JSON.stringify(payload)).not.toMatch(/gpt-pro|channel/i);
    expect(mocks.getUserLogs).toHaveBeenCalledWith("pat-xyz", expect.objectContaining({
      page: 2,
      pageSize: 20,
      type: 2,
    }));
  });
});
