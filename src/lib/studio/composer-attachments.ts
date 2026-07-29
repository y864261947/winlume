/**
 * NewMax-style composer attachment helpers (web port).
 * Long paste → collapsed blocks; images/files as chips; expand into final message text.
 */

export const PASTE_LINE_THRESHOLD = 8;
export const PASTE_CHAR_THRESHOLD = 400;
export const PASTED_COLLAPSED_PX = 160;
export const PASTED_EXPANDED_PX = 480;
export const MAX_PASTED_BLOCKS = 8;
export const MAX_IMAGES = 4;
export const MAX_FILES = 6;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_TEXT_FILE_BYTES = 512 * 1024;
export const PREVIEW_LINE_COUNT = 12;

export type PastedBlock = {
  id: string;
  full: string;
  preview: string;
  lineCount: number;
  charCount: number;
  source: "paste" | "file";
  name?: string;
};

export type ImageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  /** Set once the image finishes persisting as an Artifact. */
  artifactId?: string;
  /** True after a persist attempt threw and the attachment can be retried. */
  uploadFailed?: boolean;
};

export type FileAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "text" | "binary";
  /** Present when kind === "text" */
  textContent?: string;
};

export type PasteIntent =
  | { kind: "short-text"; text: string }
  | { kind: "long-text"; text: string }
  | { kind: "images"; files: File[] }
  | { kind: "files"; files: File[] }
  | { kind: "mixed"; text?: string; images: File[]; files: File[] }
  | { kind: "empty" };

function uid(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function countTextLines(text: string): number {
  if (!text) return 0;
  return text.replace(/\r\n/g, "\n").split("\n").length;
}

export function shouldCollapsePaste(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return (
    countTextLines(trimmed) >= PASTE_LINE_THRESHOLD ||
    trimmed.length >= PASTE_CHAR_THRESHOLD
  );
}

export function buildPastedPreview(
  full: string,
  maxLines = PREVIEW_LINE_COUNT,
): string {
  const lines = full.replace(/\r\n/g, "\n").split("\n");
  if (lines.length <= maxLines) return full;
  return `${lines.slice(0, maxLines).join("\n")}\n…`;
}

export function createPastedBlock(
  full: string,
  opts?: { source?: "paste" | "file"; name?: string },
): PastedBlock {
  const normalized = full.replace(/\r\n/g, "\n");
  return {
    id: uid("paste"),
    full: normalized,
    preview: buildPastedPreview(normalized),
    lineCount: countTextLines(normalized),
    charCount: normalized.length,
    source: opts?.source ?? "paste",
    name: opts?.name,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const TEXT_MIME = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "text/css",
  "text/javascript",
  "application/json",
  "application/xml",
  "application/javascript",
  "application/typescript",
]);

const TEXT_EXT =
  /\.(txt|md|markdown|csv|json|xml|html|htm|css|js|ts|tsx|jsx|py|go|rs|java|c|cpp|h|yml|yaml|toml|ini|log|env|sh|bash|sql)$/i;

export function isLikelyTextFile(file: File): boolean {
  if (file.type && TEXT_MIME.has(file.type)) return true;
  if (file.type.startsWith("text/")) return true;
  return TEXT_EXT.test(file.name);
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name);
}

/** Classify clipboard / drop payload (NewMax resolveComposerPasteIntent). */
export function resolveComposerPasteIntent(
  clipboardData: DataTransfer | null,
): PasteIntent {
  if (!clipboardData) return { kind: "empty" };

  const items = Array.from(clipboardData.items ?? []);
  const filesFromItems: File[] = [];
  for (const item of items) {
    if (item.kind === "file") {
      const f = item.getAsFile();
      if (f) filesFromItems.push(f);
    }
  }
  const filesFromList = Array.from(clipboardData.files ?? []);
  const allFiles = filesFromItems.length ? filesFromItems : filesFromList;

  const images = allFiles.filter(isImageFile);
  const otherFiles = allFiles.filter((f) => !isImageFile(f));
  const text = clipboardData.getData("text/plain") ?? "";

  if (images.length && !otherFiles.length && !text.trim()) {
    return { kind: "images", files: images };
  }
  if (otherFiles.length && !images.length && !text.trim()) {
    return { kind: "files", files: otherFiles };
  }
  if ((images.length || otherFiles.length) && text.trim()) {
    return {
      kind: "mixed",
      text,
      images,
      files: otherFiles,
    };
  }
  if (images.length || otherFiles.length) {
    return {
      kind: "mixed",
      images,
      files: otherFiles,
    };
  }
  if (!text) return { kind: "empty" };
  if (shouldCollapsePaste(text)) return { kind: "long-text", text };
  return { kind: "short-text", text };
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file);
  });
}

export async function fileToImageAttachment(
  file: File,
): Promise<ImageAttachment> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `图片过大（${formatFileSize(file.size)}），上限 ${formatFileSize(MAX_IMAGE_BYTES)}`,
    );
  }
  const dataUrl = await readFileAsDataUrl(file);
  return {
    id: uid("img"),
    name: file.name || "image.png",
    mimeType: file.type || "image/png",
    size: file.size,
    dataUrl,
  };
}

export async function fileToAttachment(file: File): Promise<{
  pasted?: PastedBlock;
  file?: FileAttachment;
}> {
  if (isLikelyTextFile(file)) {
    if (file.size > MAX_TEXT_FILE_BYTES) {
      throw new Error(
        `文本文件过大（${formatFileSize(file.size)}），上限 ${formatFileSize(MAX_TEXT_FILE_BYTES)}`,
      );
    }
    const text = await readFileAsText(file);
    if (shouldCollapsePaste(text) || text.length > 0) {
      return {
        pasted: createPastedBlock(text, { source: "file", name: file.name }),
      };
    }
  }
  return {
    file: {
      id: uid("file"),
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      kind: "binary",
    },
  };
}

/**
 * Expand draft + attachments into a single user message string for /api/chat.
 * Images: include data URL when small enough; otherwise metadata only (no vision API yet).
 */
export function composeOutboundMessage(opts: {
  draft: string;
  pasted: PastedBlock[];
  images: ImageAttachment[];
  files: FileAttachment[];
}): string {
  const parts: string[] = [];
  const draft = opts.draft.trim();
  if (draft) parts.push(draft);

  for (const block of opts.pasted) {
    const title =
      block.name?.trim() ||
      (block.source === "file" ? "文件" : `粘贴内容 · ${block.lineCount} 行`);
    parts.push(`--- ${title} ---\n${block.full}`);
  }

  for (const f of opts.files) {
    if (f.kind === "text" && f.textContent) {
      parts.push(`--- 附件：${f.name} ---\n${f.textContent}`);
    } else {
      parts.push(
        `--- 附件：${f.name}（${f.mimeType || "binary"}，${formatFileSize(f.size)}，未内联）---`,
      );
    }
  }

  // Images stay as UI chips + optional @图片N / artifact uploads.
  // Never dump "--- 图片：… ---" into the bubble — users should see their
  // own prompt as typed. The model gets references via @ labels and
  // server-side artifact system-reminders.
  if (!draft && opts.images.length) {
    parts.push(
      opts.images.map((i) => `@${i.name}`).join(" "),
    );
  }

  return parts.join("\n\n").trim();
}

export function hasComposerPayload(opts: {
  draft: string;
  pasted: PastedBlock[];
  images: ImageAttachment[];
  files: FileAttachment[];
}): boolean {
  return (
    Boolean(opts.draft.trim()) ||
    opts.pasted.length > 0 ||
    opts.images.length > 0 ||
    opts.files.length > 0
  );
}

const UPLOAD_NAME_PATTERN = /^图片(\d+)$/;

/** Generates upload-scoped "图片N" names, ignoring model-chosen artifact names. */
export function nextUploadImageNames(
  existingNames: string[],
  count: number,
): string[] {
  let base = existingNames.filter((name) => UPLOAD_NAME_PATTERN.test(name)).length;
  const names: string[] = [];
  for (let i = 0; i < count; i += 1) {
    base += 1;
    names.push(`图片${base}`);
  }
  return names;
}

const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Decodes a canonical `data:<mimeType>;base64,<payload>` URL. */
export function parseDataUrl(
  dataUrl: string,
): { mimeType: string; bytes: Buffer } | null {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;

  const [, mimeType, base64] = match;
  if (!base64 || !BASE64_PATTERN.test(base64)) return null;

  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.toString("base64") !== base64) return null;
  return { mimeType, bytes };
}
