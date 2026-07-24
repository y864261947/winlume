import { describe, expect, it } from "vitest";
import { mergeSkillIds } from "./inject";

describe("mergeSkillIds", () => {
  it("pins first then turn extras; turn re-order keeps single id", () => {
    expect(mergeSkillIds(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
    expect(mergeSkillIds(undefined, ["x"])).toEqual(["x"]);
    expect(mergeSkillIds(["x"], undefined)).toEqual(["x"]);
    expect(mergeSkillIds([], [])).toEqual([]);
  });
});
