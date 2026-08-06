import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getCurrentAuthContext: vi.fn() }));

import { getCurrentAuthContext } from "@/lib/auth/session";
import { requireGatewayAdminContext, GatewayAdminError } from "./server";

describe("requireGatewayAdminContext", () => {
  beforeEach(() => vi.mocked(getCurrentAuthContext).mockReset());

  it("throws 401 when there is no session", async () => {
    vi.mocked(getCurrentAuthContext).mockResolvedValue(null);
    await expect(requireGatewayAdminContext()).rejects.toMatchObject({ status: 401 } satisfies Partial<GatewayAdminError>);
  });

  it("throws 403 when platformRole is not admin", async () => {
    vi.mocked(getCurrentAuthContext).mockResolvedValue({
      userId: "u1", username: "u", displayName: "U", email: null,
      platformRole: "user", authVersion: 1, legacyNewApiUserId: null,
    });
    await expect(requireGatewayAdminContext()).rejects.toMatchObject({ status: 403 } satisfies Partial<GatewayAdminError>);
  });

  it("resolves when platformRole is admin", async () => {
    vi.mocked(getCurrentAuthContext).mockResolvedValue({
      userId: "u1", username: "u", displayName: "U", email: null,
      platformRole: "admin", authVersion: 1, legacyNewApiUserId: null,
    });
    await expect(requireGatewayAdminContext()).resolves.toBeUndefined();
  });
});
