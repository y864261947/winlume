import { describe, expect, it } from "vitest";
import { skillhubIconUrl } from "./skillhub-icons";

describe("skillhubIconUrl", () => {
  it("returns a remote logo for imported SkillHub skills", () => {
    const url = skillhubIconUrl("skillhub-agently-mail");
    expect(url).toMatch(/^https:\/\//);
  });

  it("falls back when a skill has no uploaded icon", () => {
    expect(skillhubIconUrl("skillhub-browser-automation-toolbox")).toBeUndefined();
    expect(skillhubIconUrl("not-a-skill")).toBeUndefined();
  });
});
