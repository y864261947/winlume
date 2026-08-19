/**
 * Prompt-side image and canvas @ mentions.
 * Local composer uploads are named 图片1, 图片2, … and referenced as @图片1 in text.
 */

import type { Artifact } from "@/lib/agent/types";
import type { ImageAttachment } from "@/lib/studio/composer-attachments";
import { nextUploadImageNames } from "@/lib/studio/composer-attachments";

const AT_IMAGE_PATTERN = /@图片(\d+)/g;
const UPLOAD_NAME_PATTERN = /^图片\d+$/;

export function isMentionableArtifact(artifact: Artifact): boolean {
  return (
    (artifact.kind === "image" ||
      artifact.kind === "canvas" ||
      artifact.kind === "sheet") &&
    artifact.status !== "failed"
  );
}

export type MentionCandidate = {
  /** Stable list key */
  key: string;
  /** Display / @ token body, e.g. 图片1 */
  name: string;
  /** Canvas artifacts intentionally have no image thumbnail. */
  thumbSrc?: string;
  kind: "image" | "canvas" | "sheet";
  artifactId?: string;
  localId?: string;
  status?: "ready" | "pending" | "failed";
  source: "local" | "artifact";
};

/** Assign sequential 图片N names to newly accepted attachments. */
export function nameLocalImageBatch(
  existing: ImageAttachment[],
  incoming: ImageAttachment[],
): ImageAttachment[] {
  const existingNames = existing.map((img) => img.name);
  const names = nextUploadImageNames(existingNames, incoming.length);
  return incoming.map((img, i) => ({
    ...img,
    name: names[i] ?? `图片${i + 1}`,
  }));
}

/** Candidates for the @ picker: local uploads first, then session artifacts. */
export function buildMentionCandidates(
  images: ImageAttachment[],
  artifacts: Artifact[] = [],
): MentionCandidate[] {
  const out: MentionCandidate[] = [];
  const seenArtifact = new Set<string>();
  const seenName = new Set<string>();

  for (const img of images) {
    const name = img.name?.trim() || "图片";
    out.push({
      key: `local:${img.id}`,
      name,
      thumbSrc: img.dataUrl,
      kind: "image",
      artifactId: img.artifactId,
      localId: img.id,
      status: img.uploadFailed ? "failed" : img.artifactId ? "ready" : "pending",
      source: "local",
    });
    seenName.add(name);
    if (img.artifactId) seenArtifact.add(img.artifactId);
  }

  for (const a of artifacts) {
    if (!isMentionableArtifact(a)) continue;
    if (seenArtifact.has(a.id)) continue;
    // Prefer local row when same 图片N name is already an attachment.
    if (UPLOAD_NAME_PATTERN.test(a.name) && seenName.has(a.name)) continue;
    const kind: MentionCandidate["kind"] =
      a.kind === "canvas" ? "canvas" : a.kind === "sheet" ? "sheet" : "image";
    out.push({
      key: `artifact:${a.id}`,
      name: a.name,
      thumbSrc: kind === "image" ? `/api/artifacts/${a.id}/raw` : undefined,
      kind,
      artifactId: a.id,
      status: a.status ?? "ready",
      source: "artifact",
    });
    seenArtifact.add(a.id);
    seenName.add(a.name);
  }

  return out;
}

export function filterMentionCandidates(
  candidates: MentionCandidate[],
  query: string,
  max = 20,
): MentionCandidate[] {
  const q = query.trim().toLowerCase();
  const pool = q
    ? candidates.filter((c) => c.name.toLowerCase().includes(q))
    : candidates;
  return pool.slice(0, max);
}

/** Ordered unique labels mentioned as @图片N (or @Name for non-upload artifacts). */
export function extractAtMentionNames(text: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  // Prefer 图片N tokens
  for (const m of text.matchAll(AT_IMAGE_PATTERN)) {
    const name = `图片${m[1]}`;
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }

  // Also @ExactName for session artifacts with other names (single-token after @)
  const generic = text.matchAll(/(?:^|[\s\n])@([^\s@]+)/g);
  for (const m of generic) {
    const raw = m[1] ?? "";
    if (!raw || raw.startsWith("图片")) continue;
    if (!seen.has(raw)) {
      seen.add(raw);
      names.push(raw);
    }
  }

  return names;
}

/**
 * Map @ names in the prompt to server artifact ids (when known).
 * Local-only images without artifactId are omitted here — caller should upload first.
 */
export function resolveReferencedArtifactIds(
  text: string,
  images: ImageAttachment[],
  artifacts: Artifact[] = [],
): string[] {
  const names = extractAtMentionNames(text);
  if (!names.length) return [];

  const byName = new Map<string, string>();
  for (const img of images) {
    if (img.artifactId && img.name) byName.set(img.name, img.artifactId);
  }
  for (const a of artifacts) {
    if (isMentionableArtifact(a) && !byName.has(a.name)) {
      byName.set(a.name, a.id);
    }
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const id = byName.get(name);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** Local image ids that are @-mentioned but not yet uploaded. */
export function resolvePendingLocalMentions(
  text: string,
  images: ImageAttachment[],
): ImageAttachment[] {
  const names = new Set(extractAtMentionNames(text));
  if (!names.size) {
    // If user attached images but didn't @ them, still treat all as relevant for home upload
    return [];
  }
  return images.filter((img) => names.has(img.name) && !img.artifactId);
}

/**
 * Insert `@name` replacing the in-progress `@query` range.
 * Keeps the token inside the sentence (multi-mention friendly).
 */
export function insertMentionToken(
  text: string,
  range: { start: number; end: number },
  name: string,
): { text: string; cursor: number } {
  const token = `@${name}`;
  const before = text.slice(0, range.start);
  let after = text.slice(range.end);
  // Avoid double spaces when the @query was mid-sentence before a space.
  if (before.endsWith(" ") && after.startsWith(" ")) {
    after = after.slice(1);
  }
  const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
  const next = `${before}${token}${needsTrailingSpace ? " " : ""}${after}`;
  const cursor = before.length + token.length + (needsTrailingSpace ? 1 : 0);
  return { text: next, cursor };
}
