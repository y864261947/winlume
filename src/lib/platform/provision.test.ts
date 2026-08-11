import { beforeEach, describe, expect, it, vi } from "vitest";

const newApiState = { nextUserId: 100, nextTokenId: 1 };

vi.mock("../newapi/admin-client", () => ({
  createNewApiUser: vi.fn(async () => {}),
  findNewApiUserIdByUsername: vi.fn(async () => newApiState.nextUserId),
  disableNewApiUser: vi.fn(async () => {}),
}));

vi.mock("../newapi/team-client", () => ({
  loginAndMintPat: vi.fn(async () => "pat-xyz"),
  createTeamToken: vi.fn(async () => {}),
  findTeamTokenIdByName: vi.fn(async () => newApiState.nextTokenId),
  fetchTeamTokenKey: vi.fn(async () => "sk-newapi-raw-key"),
}));

import { createNewApiUser, disableNewApiUser } from "../newapi/admin-client";
import { provisionPlatformUser } from "./provision";

function fakeDatabase(overrides: { txShouldFail?: boolean } = {}) {
  const inserted: Record<string, unknown[]> = {};
  const tx = {
    insert: (table: { _: { name: string } } | { name?: string }) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          if (overrides.txShouldFail) throw new Error("simulated tx failure");
          const key = JSON.stringify(Object.keys(values));
          inserted[key] = inserted[key] ?? [];
          const row = { id: "generated-id", ...values };
          inserted[key].push(row);
          return [row];
        },
      }),
    }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
  };
  return {
    transaction: async (callback: (tx: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as Parameters<typeof provisionPlatformUser>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.REIZO_TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

describe("provisionPlatformUser", () => {
  it("creates the new-api user before touching local storage", async () => {
    const database = fakeDatabase();
    await provisionPlatformUser(database, { username: "team-abc", displayName: "Team ABC", passwordHash: "hash" });
    expect(createNewApiUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: "reizo-team-abc", displayName: "Team ABC" }),
    );
  });

  it("attempts to disable the new-api user if the local transaction fails", async () => {
    const database = fakeDatabase({ txShouldFail: true });
    await expect(
      provisionPlatformUser(database, { username: "team-abc", displayName: "Team ABC", passwordHash: "hash" }),
    ).rejects.toThrow();
    expect(disableNewApiUser).toHaveBeenCalledWith(newApiState.nextUserId);
  });
});
