import { describe, it, expect } from "vitest";
import { sortDepartmentIds, departmentLabel } from "./departments";

describe("departments", () => {
  it("orders known departments first", () => {
    expect(sortDepartmentIds(["specialized", "marketing", "design"])).toEqual([
      "marketing",
      "design",
      "specialized",
    ]);
    expect(departmentLabel("marketing")).toBe("营销");
  });
});
