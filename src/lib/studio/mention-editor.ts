/**
 * Contenteditable mention editor model + DOM helpers.
 * Mentions are atomic chips; serialized form keeps `@图片1` plain text for send path.
 */

export type MentionChipMeta = {
  name: string;
  thumbSrc?: string;
  kind?: "image" | "canvas" | "sheet";
  artifactId?: string;
  localId?: string;
  /** Native hover tooltip only — never shown in the chip's own text. */
  title?: string;
  /**
   * Overrides `name` in the serialized `@token` sent to the agent, while the
   * chip still displays `name`. Use this to disambiguate (e.g. qualify a cell
   * range with its sheet) without cluttering the visible chip.
   */
  sendName?: string;
};

export type EditorSegment =
  | { type: "text"; text: string }
  | {
      type: "mention";
      name: string;
      thumbSrc?: string;
      kind?: "image" | "canvas" | "sheet";
      artifactId?: string;
      localId?: string;
    };

const MENTION_TOKEN_RE = /@([^\s@]+)/g;
/** Zero-width space after chips so the caret can sit after them. */
export const CHIP_ZWSP = "\u200B";

/** True when text contains an @token, used to gate safe message re-send. */
export function hasMentionToken(text: string): boolean {
  return new RegExp(MENTION_TOKEN_RE).test(text);
}

export function segmentsToText(segments: EditorSegment[]): string {
  return segments
    .map((s) => (s.type === "text" ? s.text : `@${s.name}`))
    .join("");
}

/**
 * Split serialized prompt into text + mention segments.
 * Only tokens whose name `resolve` accepts become chips; others stay plain text.
 */
export function textToSegments(
  text: string,
  resolve: (name: string) => MentionChipMeta | null | undefined,
): EditorSegment[] {
  if (!text) return [];
  const segments: EditorSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION_TOKEN_RE)) {
    const full = match[0];
    const name = match[1] ?? "";
    const index = match.index ?? 0;
    if (index > last) {
      segments.push({ type: "text", text: text.slice(last, index) });
    }
    const meta = resolve(name);
    if (meta) {
      segments.push({
        type: "mention",
        name: meta.name || name,
        thumbSrc: meta.thumbSrc,
        kind: meta.kind,
        artifactId: meta.artifactId,
        localId: meta.localId,
      });
    } else {
      segments.push({ type: "text", text: full });
    }
    last = index + full.length;
  }
  if (last < text.length) {
    segments.push({ type: "text", text: text.slice(last) });
  }
  return mergeAdjacentText(segments);
}

function mergeAdjacentText(segments: EditorSegment[]): EditorSegment[] {
  const out: EditorSegment[] = [];
  for (const s of segments) {
    const prev = out[out.length - 1];
    if (s.type === "text" && prev?.type === "text") {
      prev.text += s.text;
    } else {
      out.push(s.type === "text" ? { ...s } : { ...s });
    }
  }
  return out.filter((s) => s.type === "mention" || s.text.length > 0);
}

const SHEET_CHIP_PALETTE: Array<{ bg: string; border: string }> = [
  { bg: "#EFF6FF", border: "#BFDBFE" }, // blue
  { bg: "#F0FDF4", border: "#BBF7D0" }, // green
  { bg: "#FFFBEB", border: "#FDE68A" }, // amber
  { bg: "#FAF5FF", border: "#E9D5FF" }, // purple
  { bg: "#FFF1F2", border: "#FECDD3" }, // rose
  { bg: "#F0FDFA", border: "#99F6E4" }, // teal
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Deterministic pale color per sheet, so pinned ranges from different sheets are easy to tell apart. */
function sheetChipColor(meta: MentionChipMeta): { bg: string; border: string } | null {
  if (meta.kind !== "sheet" || !meta.title) return null;
  const key = `${meta.artifactId ?? ""}:${meta.title}`;
  return SHEET_CHIP_PALETTE[hashString(key) % SHEET_CHIP_PALETTE.length] ?? null;
}

export function createMentionChipElement(
  doc: Document,
  meta: MentionChipMeta,
): HTMLSpanElement {
  const chip = doc.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.mentionName = meta.name;
  if (meta.kind) chip.dataset.mentionKind = meta.kind;
  if (meta.artifactId) chip.dataset.artifactId = meta.artifactId;
  if (meta.localId) chip.dataset.localId = meta.localId;
  if (meta.sendName) chip.dataset.sendName = meta.sendName;
  // High-contrast white chip so @图片N stays readable on glass composer
  // and (via MentionRichText) on dark user bubbles.
  chip.className =
    "mention-chip inline-flex max-w-[12rem] items-center gap-1.5 rounded-full border border-[rgba(15,23,42,0.14)] bg-white py-1 pl-1 pr-2 align-middle text-[12px] font-semibold leading-none text-[#0F172A] shadow-sm select-none";
  chip.setAttribute("role", "img");
  chip.setAttribute("aria-label", `@${meta.name}`);
  if (meta.title) chip.title = meta.title;
  const sheetColor = sheetChipColor(meta);
  if (sheetColor) {
    chip.style.backgroundColor = sheetColor.bg;
    chip.style.borderColor = sheetColor.border;
  }

  if (meta.thumbSrc) {
    const img = doc.createElement("img");
    img.src = meta.thumbSrc;
    img.alt = "";
    img.className = "h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-black/10";
    img.draggable = false;
    chip.appendChild(img);
  } else {
    const ph = doc.createElement("span");
    ph.className =
      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E2E8F0] text-[10px] font-bold text-[#334155]";
    ph.textContent =
      meta.kind === "canvas" ? "画" : meta.kind === "sheet" ? "表" : "图";
    chip.appendChild(ph);
  }

  const label = doc.createElement("span");
  label.className = "min-w-0 truncate tracking-tight";
  label.textContent = `@${meta.name}`;
  chip.appendChild(label);

  return chip;
}

export function serializeMentionEditor(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += (node.textContent ?? "").replaceAll(CHIP_ZWSP, "");
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset.mentionName) {
      out += `@${node.dataset.sendName || node.dataset.mentionName}`;
      return;
    }
    if (node.tagName === "BR") {
      out += "\n";
      return;
    }
    // Block boundaries (div/p from contenteditable) → newline between blocks
    const isBlock =
      node.tagName === "DIV" || node.tagName === "P" || node.tagName === "LI";
    if (isBlock && out.length && !out.endsWith("\n")) {
      // only before non-first block content
    }
    const childNodes = Array.from(node.childNodes);
    childNodes.forEach((child, i) => {
      if (isBlock && i > 0) {
        // already handled via BR usually
      }
      walk(child);
    });
    if (isBlock && node !== root && out.length && !out.endsWith("\n")) {
      // trailing newline for completed blocks when next sibling exists
      const next = node.nextSibling;
      if (next) out += "\n";
    }
  };
  Array.from(root.childNodes).forEach(walk);
  return out.replace(/\u00a0/g, " ");
}

export function renderSegmentsToEditor(
  root: HTMLElement,
  segments: EditorSegment[],
): void {
  const doc = root.ownerDocument;
  root.replaceChildren();
  if (!segments.length) {
    return;
  }
  for (const seg of segments) {
    if (seg.type === "text") {
      // Preserve newlines as <br>
      const parts = seg.text.split("\n");
      parts.forEach((part, i) => {
        if (part) root.appendChild(doc.createTextNode(part));
        if (i < parts.length - 1) root.appendChild(doc.createElement("br"));
      });
    } else {
      root.appendChild(
        createMentionChipElement(doc, {
          name: seg.name,
          thumbSrc: seg.thumbSrc,
          kind: seg.kind,
          artifactId: seg.artifactId,
          localId: seg.localId,
        }),
      );
      root.appendChild(doc.createTextNode(CHIP_ZWSP));
    }
  }
}

/** Serialized caret offset from current selection inside root. */
export function getSerializedCaretOffset(root: HTMLElement): number {
  const sel = root.ownerDocument.getSelection();
  if (!sel || sel.rangeCount === 0) return serializeMentionEditor(root).length;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) {
    return serializeMentionEditor(root).length;
  }

  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);

  // Measure via temporary container
  const holder = root.ownerDocument.createElement("div");
  holder.appendChild(pre.cloneContents());
  return serializeMentionEditor(holder).length;
}

/** Place caret at a serialized text offset. */
export function setSerializedCaretOffset(root: HTMLElement, offset: number): void {
  const doc = root.ownerDocument;
  const sel = doc.getSelection();
  if (!sel) return;

  let remaining = Math.max(0, offset);
  const range = doc.createRange();
  let placed = false;

  const placeInText = (textNode: Text, maxLen: number) => {
    const take = Math.min(remaining, maxLen);
    if (remaining <= maxLen) {
      range.setStart(textNode, take);
      range.collapse(true);
      placed = true;
      remaining = 0;
      return true;
    }
    remaining -= maxLen;
    return false;
  };

  const walk = (node: Node): boolean => {
    if (placed) return true;
    if (node.nodeType === Node.TEXT_NODE) {
      const raw = node.textContent ?? "";
      const visible = raw.replaceAll(CHIP_ZWSP, "");
      // Map visible offset into raw (skip ZWSP for counting but allow caret after chip)
      if (remaining <= visible.length) {
        // Find raw index for visible offset
        let vis = 0;
        let rawIdx = 0;
        while (rawIdx < raw.length && vis < remaining) {
          if (raw[rawIdx] !== CHIP_ZWSP) vis += 1;
          rawIdx += 1;
        }
        range.setStart(node, rawIdx);
        range.collapse(true);
        placed = true;
        return true;
      }
      remaining -= visible.length;
      return false;
    }
    if (node instanceof HTMLElement && node.dataset.mentionName) {
      const tokenLen = `@${node.dataset.sendName || node.dataset.mentionName}`.length;
      if (remaining <= tokenLen) {
        // Caret belongs on/after chip → place after chip (and ZWSP if present)
        const after = node.nextSibling;
        if (after && after.nodeType === Node.TEXT_NODE) {
          range.setStart(after, 0);
        } else {
          range.setStartAfter(node);
        }
        range.collapse(true);
        placed = true;
        remaining = 0;
        return true;
      }
      remaining -= tokenLen;
      return false;
    }
    if (node instanceof HTMLElement && node.tagName === "BR") {
      if (remaining <= 1) {
        range.setStartAfter(node);
        range.collapse(true);
        placed = true;
        return true;
      }
      remaining -= 1;
      return false;
    }
    for (const child of Array.from(node.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  };

  walk(root);
  if (!placed) {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Replace [start, end) in serialized space with a mention chip.
 * Returns new serialized text and caret offset after the chip.
 */
export function insertMentionChipInEditor(
  root: HTMLElement,
  range: { start: number; end: number },
  meta: MentionChipMeta,
): { text: string; cursor: number } {
  const doc = root.ownerDocument;
  const sel = doc.getSelection();
  // Select the serialized range
  setSerializedCaretOffset(root, range.start);
  const startRange = sel?.getRangeAt(0).cloneRange();
  setSerializedCaretOffset(root, range.end);
  const endRange = sel?.getRangeAt(0);
  if (!startRange || !endRange || !sel) {
    // Fallback append
    const chip = createMentionChipElement(doc, meta);
    root.appendChild(chip);
    root.appendChild(doc.createTextNode(CHIP_ZWSP + " "));
    const text = serializeMentionEditor(root);
    return { text, cursor: text.length };
  }
  const del = doc.createRange();
  del.setStart(startRange.startContainer, startRange.startOffset);
  del.setEnd(endRange.startContainer, endRange.startOffset);
  del.deleteContents();

  const chip = createMentionChipElement(doc, meta);
  del.insertNode(chip);
  // Space + ZWSP after chip for typing
  const after = doc.createTextNode(`${CHIP_ZWSP} `);
  if (chip.nextSibling) {
    chip.parentNode?.insertBefore(after, chip.nextSibling);
  } else {
    chip.parentNode?.appendChild(after);
  }
  // Caret after ZWSP+space → after space
  const caret = doc.createRange();
  caret.setStart(after, after.data.length);
  caret.collapse(true);
  sel.removeAllRanges();
  sel.addRange(caret);

  const text = serializeMentionEditor(root);
  const cursor = getSerializedCaretOffset(root);
  return { text, cursor };
}

/**
 * If the caret sits right after a mention chip (only whitespace/ZWSP between
 * them — e.g. the space auto-inserted after a chip, untouched), delete the
 * whole chip in one Backspace instead of requiring one press per invisible
 * character. Returns null when the caret isn't in that position, so the
 * caller should fall back to native Backspace behavior.
 */
export function deleteMentionChipBeforeCaret(
  root: HTMLElement,
): { text: string; cursor: number } | null {
  const doc = root.ownerDocument;
  const sel = doc.getSelection();
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const container = range.startContainer;

  const isWhitespaceOrZwsp = (value: string) =>
    Array.from(value).every((ch) => ch === CHIP_ZWSP || /\s/.test(ch));

  if (container.nodeType === Node.TEXT_NODE) {
    const before = (container.textContent ?? "").slice(0, range.startOffset);
    if (!isWhitespaceOrZwsp(before)) return null;
  } else if (range.startOffset > 0) {
    return null;
  }

  let node: Node | null = container.previousSibling;
  while (node?.nodeType === Node.TEXT_NODE && isWhitespaceOrZwsp(node.textContent ?? "")) {
    node = node.previousSibling;
  }
  if (!(node instanceof HTMLElement) || !node.dataset.mentionName) return null;

  const del = doc.createRange();
  del.setStartBefore(node);
  del.setEnd(range.startContainer, range.startOffset);
  del.deleteContents();

  const caret = doc.createRange();
  caret.setStart(del.startContainer, del.startOffset);
  caret.collapse(true);
  sel.removeAllRanges();
  sel.addRange(caret);

  return { text: serializeMentionEditor(root), cursor: getSerializedCaretOffset(root) };
}

/** Replace a serialized range with plain text (e.g. remove /query). */
export function replaceSerializedRangeWithText(
  root: HTMLElement,
  range: { start: number; end: number },
  insert: string,
): { text: string; cursor: number } {
  const doc = root.ownerDocument;
  const sel = doc.getSelection();
  setSerializedCaretOffset(root, range.start);
  const startRange = sel?.getRangeAt(0).cloneRange();
  setSerializedCaretOffset(root, range.end);
  const endRange = sel?.getRangeAt(0);
  if (!startRange || !endRange || !sel) {
    const text = serializeMentionEditor(root);
    return { text, cursor: text.length };
  }
  const del = doc.createRange();
  del.setStart(startRange.startContainer, startRange.startOffset);
  del.setEnd(endRange.startContainer, endRange.startOffset);
  del.deleteContents();
  if (insert) {
    const node = doc.createTextNode(insert);
    del.insertNode(node);
    const caret = doc.createRange();
    caret.setStart(node, node.data.length);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
  } else {
    sel.removeAllRanges();
    sel.addRange(del);
  }
  const text = serializeMentionEditor(root);
  return { text, cursor: getSerializedCaretOffset(root) };
}
