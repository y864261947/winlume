import { describe, expect, it } from "vitest";
import { getWorkScene, skillsForScene } from "./work-scenes";

describe("work scenes", () => {
  it("returns the content-office scene and its ordered Skill ids", () => {
    expect(getWorkScene("content-office")?.label).toBe("内容与办公");
    expect(skillsForScene("content-office")).toEqual([
      "production-content-intake",
      "production-content-research",
      "production-content-draft",
      "production-content-review",
    ]);
  });

  it("rejects unknown and non-slug scene values", () => {
    expect(getWorkScene("../content-office")).toBeNull();
    expect(skillsForScene("unknown")).toEqual([]);
  });

  it("returns a fresh Skill id list for callers to safely filter", () => {
    const skills = skillsForScene("content-office");
    skills.pop();
    expect(skillsForScene("content-office")).toHaveLength(4);
  });
});
