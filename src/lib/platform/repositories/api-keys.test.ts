import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../newapi/team-client", () => ({
  createTeamToken: vi.fn(async () => {}),
  findTeamTokenIdByName: vi.fn(async () => 55),
  fetchTeamTokenKey: vi.fn(async () => "sk-newapi-raw"),
  revokeTeamToken: vi.fn(async () => {}),
}));
vi.mock("../../newapi/crypto", () => ({
  encryptSecret: vi.fn((value: string) => `enc(${value})`),
  decryptSecret: vi.fn((value: string) => value.replace(/^enc\(|\)$/g, "")),
}));

import { createTeamToken, revokeTeamToken } from "../../newapi/team-client";
import { ApiKeyRepository } from "./api-keys";
import { TeamNewApiMappingRepository } from "./team-new-api-mapping";

function fakeDatabase(insertedRow: Record<string, unknown>) {
  return {
    insert: () => ({ values: () => ({ returning: async () => [insertedRow] }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [insertedRow] }) }) }),
  } as unknown as ConstructorParameters<typeof ApiKeyRepository>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(TeamNewApiMappingRepository.prototype, "findByOrganizationId").mockResolvedValue({
    organizationId: "org-1",
    newApiUserId: 42,
    newApiUsername: "reizo-team-abc",
    newApiPasswordCiphertext: "enc(pw)",
    newApiPatCiphertext: "enc(pat)",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

describe("ApiKeyRepository.create (new-api backed)", () => {
  it("creates a new-api token before storing the local key row", async () => {
    const database = fakeDatabase({
      id: "key-1",
      userId: "user-1",
      organizationId: "org-1",
      keyPrefix: "wl_abc123",
      keyHash: "hash",
      newApiTokenId: 55,
      newApiKeyCiphertext: "enc(sk-newapi-raw)",
    });
    const repository = new ApiKeyRepository(database);

    const result = await repository.create({ userId: "user-1", organizationId: "org-1", name: "CI key" });

    expect(createTeamToken).toHaveBeenCalledWith("pat", "CI key");
    expect(result.record.newApiTokenId).toBe(55);
    expect(result.plaintext).toMatch(/^wl_/);
  });
});

describe("ApiKeyRepository.revoke (new-api backed)", () => {
  it("best-effort revokes the underlying new-api token", async () => {
    const database = fakeDatabase({
      id: "key-1",
      status: "revoked",
      newApiTokenId: 55,
      organizationId: "org-1",
    });
    const repository = new ApiKeyRepository(database);
    await repository.revoke("key-1");
    expect(revokeTeamToken).toHaveBeenCalledWith("pat", 55);
  });
});
