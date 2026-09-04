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
      expect.objectContaining({ username: expect.stringMatching(/^reizo-[0-9a-f]{12}$/), displayName: "Team ABC" }),
    );
  });

  it("keeps the generated new-api username/password within new-api's max=20 field limits regardless of Reizo username length", async () => {
    // new-api's model.User enforces validate:"max=20" on Username and
    // validate:"min=8,max=20" on Password (model/user.go) — a naive
    // `reizo-${username}` derivation (or a long random password) blows past
    // this for any real-world username/password and fails registration
    // 100% of the time in production. Regression test for that.
    const database = fakeDatabase();
    const longUsername = "a-very-long-reizo-username-well-past-twenty-chars";
    await provisionPlatformUser(database, { username: longUsername, displayName: "Long Name", passwordHash: "hash" });
    const call = vi.mocked(createNewApiUser).mock.calls[0][0];
    expect(call.username.length).toBeLessThanOrEqual(20);
    expect(call.password.length).toBeGreaterThanOrEqual(8);
    expect(call.password.length).toBeLessThanOrEqual(20);
  });

  it("caps the new-api display name while keeping the local profile name intact", async () => {
    const database = fakeDatabase();
    const displayName = "这是一个超过 New API 昵称长度限制的 Google 昵称";
    await provisionPlatformUser(database, { username: "google-user", displayName, passwordHash: "hash" });
    const call = vi.mocked(createNewApiUser).mock.calls[0][0];
    expect(Array.from(call.displayName)).toHaveLength(20);
    expect(call.displayName).toBe(Array.from(displayName).slice(0, 20).join(""));
  });

  it("attempts to disable the new-api user if the local transaction fails", async () => {
    const database = fakeDatabase({ txShouldFail: true });
    await expect(
      provisionPlatformUser(database, { username: "team-abc", displayName: "Team ABC", passwordHash: "hash" }),
    ).rejects.toThrow();
    expect(disableNewApiUser).toHaveBeenCalledWith(newApiState.nextUserId);
  });
});
