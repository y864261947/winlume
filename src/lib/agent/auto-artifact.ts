/**
 * When the model dumps a full deliverable into chat without calling write_artifact,
 * promote the text into a durable artifact so the workbench panel is useful.
 */

/** Soft lower bound for auto-persist (chars). */
export const AUTO_ARTIFACT_MIN_CHARS = 500;

/** Always auto-persist above this length even without structural cues. */
export const AUTO_ARTIFACT_FORCE_CHARS = 1200;

/**
 * Detect "this turn already saved work" short acks — do not double-save.
 */
export function looksLikeArtifactAckOnly(text: string): boolean {
  const t = text.trim();
  if (t.length > 900) return false;
  return /已保存|保存为作品|write_artifact|artifact\s*id|Saved artifact/i.test(
    t,
  );
}

/**
 * User asked for a durable deliverable (notes, copy, report, multi-piece content).
 */
export function userIntentLooksDeliverable(userText: string): boolean {
  const u = userText.trim();
  if (!u) return false;
  return /笔记|文案|种草|标题|正文|标签|报告|方案|大纲|脚本|清单|海报|PPT|网页|落地页|PRD|README|文档|文章|帖子|小红书|公众号|邮件|proposal|report|outline|script|copy|article|notes?/i.test(
    u,
  );
}

/**
 * Assistant output looks like a structured deliverable worth saving.
 */
export function assistantLooksDeliverable(text: string): boolean {
  const t = text.trim();
  if (t.length < AUTO_ARTIFACT_MIN_CHARS) return false;
  if (t.length >= AUTO_ARTIFACT_FORCE_CHARS) return true;

  const headingCount = (t.match(/^#{1,3}\s+.+$/gm) ?? []).length;
  const boldTitleCount = (t.match(/\*\*[^*]{2,80}\*\*/g) ?? []).length;
  const sectionMarkers =
    (t.match(/(?:^|\n)\s*(?:标题|正文|标签建议|标签)[:：]/g) ?? []).length;
  const multiNote = (t.match(/笔记\s*[1-9一二三四五]/g) ?? []).length;

  return (
    headingCount >= 1 ||
    boldTitleCount >= 4 ||
    sectionMarkers >= 2 ||
    multiNote >= 2 ||
    (t.includes("```") && t.length >= AUTO_ARTIFACT_MIN_CHARS)
  );
}

export function shouldAutoPersistArtifact(
  userText: string,
  assistantText: string,
): boolean {
  const text = assistantText.trim();
  if (!text) return false;
  if (looksLikeArtifactAckOnly(text)) return false;
  if (!assistantLooksDeliverable(text)) return false;
  // Prefer saving when user asked for deliverable OR content is clearly structured/long
  if (userIntentLooksDeliverable(userText)) return true;
  return text.length >= AUTO_ARTIFACT_FORCE_CHARS;
}

export function artifactNameFromTurn(
  userText: string,
  assistantText: string,
): string {
  const heading = assistantText.match(/^#{1,3}\s+(.+)$/m);
  if (heading?.[1]?.trim()) {
    return heading[1].trim().slice(0, 80);
  }
  const noteTitle = assistantText.match(
    /\*\*标题[:：]?\*\*\s*([^\n*]+)/,
  );
  if (noteTitle?.[1]?.trim()) {
    return noteTitle[1].trim().slice(0, 80);
  }
  const oneLine = userText.replace(/\s+/g, " ").trim();
  if (!oneLine) return "作品";
  return oneLine.length > 40 ? `${oneLine.slice(0, 40)}…` : oneLine;
}

export function inferArtifactKind(
  content: string,
): "markdown" | "html" | "text" {
  const t = content.trim();
  if (/^<!DOCTYPE html/i.test(t) || /<html[\s>]/i.test(t)) return "html";
  if (/^#{1,3}\s|^\*\*|\[.+\]\(.+\)|```/.test(t)) return "markdown";
  return "markdown";
}
