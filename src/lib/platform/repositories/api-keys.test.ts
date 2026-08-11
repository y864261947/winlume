import { beforeEach, describe, expect, it, vi } from "vitest";

const { findByOrganizationId, constructDatabases } = vi.hoisted(() => ({
  findByOrganizationId: vi.fn(),
  constructDatabases: [] as unknown[],
}));

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
// Mock the whole mapping module so ApiKeyRepository constructs a real dependency
// instance with the database it was given (catches field-init order bugs).
vi.mock("./team-new-api-mapping", () => ({
  TeamNewApiMappingRepository: class TeamNewApiMappingRepository {
    constructor(database?: unknown) {
      constructDatabases.push(database);
    }
    findByOrganizationId = findByOrganizationId;
  },
}));

import { createTeamToken, revokeTeamToken } from "../../newapi/team-client";
import { ApiKeyRepository } from "./api-keys";

const mappingRow = {
  organizationId: "org-1",
  newApiUserId: 42,
  newApiUsername: "reizo-team-abc",
  newApiPasswordCiphertext: "enc(pw)",
  newApiPatCiphertext: "enc(pat)",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function fakeDatabase(insertedRow: Record<string, unknown>) {
  return {
    insert: () => ({ values: () => ({ returning: async () => [insertedRow] }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [insertedRow] }) }) }),
  } as unknown as ConstructorParameters<typeof ApiKeyRepository>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  constructDatabases.length = 0;
  findByOrganizationId.mockResolvedValue(mappingRow);
});

describe("ApiKeyRepository construction", () => {
  it("passes the database into TeamNewApiMappingRepository (not undefined)", () => {
    const database = fakeDatabase({ id: "key-1" });
    new ApiKeyRepository(database);
    expect(constructDatabases).toHaveLength(1);
    expect(constructDatabases[0]).toBe(database);
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

    expect(findByOrganizationId).toHaveBeenCalledWith("org-1");
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
    expect(findByOrganizationId).toHaveBeenCalledWith("org-1");
    expect(revokeTeamToken).toHaveBeenCalledWith("pat", 55);
  });

  it("does not throw when mapping lookup fails", async () => {
    findByOrganizationId.mockRejectedValue(new Error("db down"));
    const database = fakeDatabase({
      id: "key-1",
      status: "revoked",
      newApiTokenId: 55,
      organizationId: "org-1",
    });
    const repository = new ApiKeyRepository(database);
    await expect(repository.revoke("key-1")).resolves.toMatchObject({ id: "key-1", status: "revoked" });
    expect(revokeTeamToken).not.toHaveBeenCalled();
  });
});
