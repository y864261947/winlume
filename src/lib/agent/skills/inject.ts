import type { Skill } from "@/lib/agent/types";
import { getSkill } from "./registry";

/** Max total characters of skill bodies injected into the system prompt. */
export const MAX_SKILL_CHARS = 24_000;

const SECTION_HEADER = "## Active skills for this turn";

const TRUNCATION_NOTE =
  "\n\n_[Skill content truncated to fit the 24,000 character budget for this turn.]_";

/**
 * Resolve skill ids to full Skill objects (order preserved, de-duplicated).
 * Unknown / invalid ids are skipped.
 */
export async function resolveSkills(skillIds?: string[]): Promise<Skill[]> {
  if (!skillIds?.length) return [];
  const seen = new Set<string>();
  const out: Skill[] = [];
  for (const raw of skillIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const skill = await getSkill(id);
    if (skill) out.push(skill);
  }
  return out;
}

/**
 * Format selected skills as a system-prompt addendum under a fixed header.
 * Caps total skill body characters at `maxChars` (default 24k) and appends
 * a clear truncation note when content is cut.
 *
 * Returns empty string when there are no skills.
 */
export function formatSkillSections(
  skills: Skill[],
  maxChars: number = MAX_SKILL_CHARS,
): string {
  if (!skills.length) return "";

  const parts: string[] = [SECTION_HEADER];
  let used = 0;
  let truncated = false;

  for (const skill of skills) {
    const name = skill.name?.trim() || skill.id;
    const body = (skill.systemPrompt ?? "").trim();
    const header = `### ${name}`;
    // Budget accounts for body only (headers are small fixed overhead).
    // When body does not fit, include partial body + note.
    if (used >= maxChars) {
      truncated = true;
      break;
    }

    const remaining = maxChars - used;
    let bodySlice = body;
    if (body.length > remaining) {
      bodySlice = body.slice(0, Math.max(0, remaining));
      truncated = true;
    }

    parts.push(header);
    if (bodySlice) parts.push(bodySlice);
    used += bodySlice.length;

    if (truncated) break;
  }

  let text = parts.join("\n\n");
  if (truncated) {
    text += TRUNCATION_NOTE;
  }
  return text;
}

/**
 * Build the full system prompt: base studio policy + optional skill sections.
 */
export function buildSystemPrompt(
  base: string,
  skills: Skill[],
  maxChars: number = MAX_SKILL_CHARS,
): string {
  const baseText = base.trim();
  const sections = formatSkillSections(skills, maxChars);
  if (!sections) return baseText;
  if (!baseText) return sections;
  return `${baseText}\n\n${sections}`;
}
