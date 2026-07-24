import { describe, it, expect } from "vitest";
import type { Skill } from "@/lib/agent/types";
import {
  buildSystemPrompt,
  formatSkillSections,
  MAX_SKILL_CHARS,
} from "./inject";

function makeSkill(partial: Partial<Skill> & { id: string }): Skill {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    description: partial.description ?? "",
    category: partial.category ?? "general",
    source: partial.source ?? "bundled",
    enabled: partial.enabled ?? true,
    systemPrompt: partial.systemPrompt ?? "",
    triggers: partial.triggers,
    examplePrompt: partial.examplePrompt,
    preview: partial.preview,
  };
}

describe("formatSkillSections", () => {
  it("returns empty string for no skills", () => {
    expect(formatSkillSections([])).toBe("");
  });

  it("formats header and skill body", () => {
    const skills = [
      makeSkill({
        id: "a",
        name: "Alpha",
        systemPrompt: "Do alpha things.",
      }),
    ];
    const out = formatSkillSections(skills);
    expect(out).toContain("## Active skills for this turn");
    expect(out).toContain("### Alpha");
    expect(out).toContain("Do alpha things.");
  });

  it("includes multiple skills in order", () => {
    const skills = [
      makeSkill({ id: "a", name: "A", systemPrompt: "body-a" }),
      makeSkill({ id: "b", name: "B", systemPrompt: "body-b" }),
    ];
    const out = formatSkillSections(skills);
    expect(out.indexOf("### A")).toBeLessThan(out.indexOf("### B"));
    expect(out).toContain("body-a");
    expect(out).toContain("body-b");
  });

  it("truncates when total skill body exceeds maxChars", () => {
    const skills = [
      makeSkill({
        id: "big",
        name: "Big",
        systemPrompt: "x".repeat(100),
      }),
      makeSkill({
        id: "next",
        name: "Next",
        systemPrompt: "should-not-appear-fully",
      }),
    ];
    const out = formatSkillSections(skills, 50);
    expect(out).toContain("### Big");
    expect(out).toContain("x".repeat(50));
    expect(out).not.toContain("x".repeat(51));
    expect(out).toMatch(/truncated/i);
    // Second skill should not fully appear after budget exhausted
    expect(out).not.toContain("should-not-appear-fully");
  });

  it("uses default 24k budget constant", () => {
    expect(MAX_SKILL_CHARS).toBe(24_000);
    const skills = [
      makeSkill({
        id: "ok",
        name: "Ok",
        systemPrompt: "y".repeat(100),
      }),
    ];
    const out = formatSkillSections(skills);
    expect(out).not.toMatch(/truncated/i);
    expect(out).toContain("y".repeat(100));
  });

  it("falls back to id when name is empty", () => {
    const skills = [
      makeSkill({ id: "my-id", name: "  ", systemPrompt: "hi" }),
    ];
    const out = formatSkillSections(skills);
    expect(out).toContain("### my-id");
  });
});

describe("buildSystemPrompt", () => {
  it("returns base only when no skills", () => {
    expect(buildSystemPrompt("BASE POLICY", [])).toBe("BASE POLICY");
  });

  it("concatenates base and skill sections", () => {
    const skills = [
      makeSkill({ id: "s", name: "Skill", systemPrompt: "Be helpful." }),
    ];
    const out = buildSystemPrompt("BASE POLICY", skills);
    expect(out.startsWith("BASE POLICY")).toBe(true);
    expect(out).toContain("## Active skills for this turn");
    expect(out).toContain("### Skill");
    expect(out).toContain("Be helpful.");
  });

  it("trims base policy", () => {
    const out = buildSystemPrompt("  base  \n", [
      makeSkill({ id: "s", name: "S", systemPrompt: "x" }),
    ]);
    expect(out.startsWith("base\n\n##")).toBe(true);
  });
});
