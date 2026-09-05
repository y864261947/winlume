import { describe, expect, it } from "vitest";
import { AuthChallengeRepository, resetAuthChallengeMemoryForTests } from "./auth-challenges";

function missingTableDb() {
  const fail = () => Promise.reject(Object.assign(new Error("Failed query"), { cause: { code: "42P01" } }));
  return {
    select: () => ({ from: () => ({ where: () => ({ limit: fail }) }) }),
    insert: () => ({ values: () => ({ returning: fail }) }),
    delete: () => ({ where: fail }),
    update: () => ({ set: () => ({ where: () => ({ returning: fail }) }) }),
  };
}

describe("AuthChallengeRepository", () => {
  it("stores challenges in memory when the table does not exist yet", async () => {
    resetAuthChallengeMemoryForTests();
    const repo = new AuthChallengeRepository(missingTableDb() as never);
    const created = await repo.replace({
      purpose: "signup",
      email: "new@example.com",
      username: "newuser",
      passwordHash: "hash",
      codeHash: "abc",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const found = await repo.findActive("signup", "new@example.com");
    expect(found?.id).toBe(created.id);
    expect(found?.username).toBe("newuser");
  });
});
