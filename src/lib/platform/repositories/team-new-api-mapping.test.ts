import { describe, expect, it } from "vitest";
import { TeamNewApiMappingRepository } from "./team-new-api-mapping";

describe("TeamNewApiMappingRepository.create", () => {
  it("inserts a mapping row using the provided transaction handle", async () => {
    const inserted = {
      organizationId: "org-1",
      newApiUserId: 42,
      newApiUsername: "team-abc",
      newApiPasswordCiphertext: "enc-pw",
      newApiPatCiphertext: "enc-pat",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const values = { returning: () => Promise.resolve([inserted]) };
    const insert = () => ({ values: () => values });
    const fakeTx = { insert } as unknown as Parameters<TeamNewApiMappingRepository["create"]>[0];

    const repository = new TeamNewApiMappingRepository();
    const result = await repository.create(fakeTx, {
      organizationId: "org-1",
      newApiUserId: 42,
      newApiUsername: "team-abc",
      newApiPasswordCiphertext: "enc-pw",
      newApiPatCiphertext: "enc-pat",
    });
    expect(result).toEqual(inserted);
  });
});
