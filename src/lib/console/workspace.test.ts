import { describe, expect, it } from "vitest";
import { ensureOwnerCountSafe, parseOrganizationRole } from "./workspace";

describe("console workspace guards", () => {
  it("does not permit the final owner to be removed or demoted", () => {
    expect(() => ensureOwnerCountSafe([{ role: "owner" }], "owner", "viewer"))
      .toThrow("至少需要一位 owner");
    expect(() => ensureOwnerCountSafe([{ role: "owner" }, { role: "owner" }], "owner", "admin"))
      .not.toThrow();
  });

  it("accepts only supported organization roles", () => {
    expect(parseOrganizationRole("admin")).toBe("admin");
    expect(() => parseOrganizationRole("operator")).toThrow("角色无效");
  });
});
