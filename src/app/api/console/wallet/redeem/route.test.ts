import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  getPlatformRepositories: vi.fn(),
  redeemTeamCode: vi.fn(),
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
  redeemTeamCode: mocks.redeemTeamCode,
}));

vi.mock("@/lib/newapi/crypto", () => ({
  decryptSecret: mocks.decryptSecret,
}));

import { POST } from "./route";

describe("POST /api/console/wallet/redeem", () => {
  beforeEach(() => {
    mocks.getCurrentUserId.mockReset();
    mocks.getPlatformRepositories.mockReset();
    mocks.redeemTeamCode.mockReset();
    mocks.decryptSecret.mockClear();
  });

  it("redeems a code onto the workspace new-api account", async () => {
    mocks.getCurrentUserId.mockResolvedValue("user-1");
    mocks.redeemTeamCode.mockResolvedValue({ type: "quota", quota: 500_000 });
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

    const response = await POST(new Request("https://reizo.example/api/console/wallet/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: "org-1", code: "CODE-1" }),
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      organizationId: "org-1",
      type: "quota",
      credits: 1,
    });
    expect(mocks.redeemTeamCode).toHaveBeenCalledWith("pat-xyz", "CODE-1");
  });
});
