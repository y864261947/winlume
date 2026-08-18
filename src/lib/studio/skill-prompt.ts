/** Role-play wrapper used when a Skill has no real example task. */
const ROLE_PREFIX =
  /^[\s"'“‘「『]*请以[「『"'“].+?[」』"'”]的(?:专业视角|角色)[，,]?(?:帮助我|帮我)完成[：:.。]?\s*/u;

const GENERIC_TAIL = /^(?:[….\s"'“”‘’「」『』]*|(?:这项)?任务[。.]?)$/u;

export function isGenericSkillPrompt(prompt: string | null | undefined): boolean {
  const text = prompt?.trim() ?? "";
  if (!text) return true;
  const match = text.match(ROLE_PREFIX);
  if (!match) return false;
  return GENERIC_TAIL.test(text.slice(match[0].length).trim());
}

/** Example text worth putting in the composer; otherwise the Skill chip is enough. */
export function usableComposerPrompt(
  prompt: string | null | undefined,
): string | undefined {
  const text = prompt?.trim();
  if (!text || isGenericSkillPrompt(text)) return undefined;
  return text;
}
