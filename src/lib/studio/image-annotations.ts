/**
 * Geometry and compositing for image-local refinement annotations.
 * Marks remain normalized so the preview size never affects the generated PNG.
 */

export type AnnotationPoint = { x: number; y: number };
export type AnnotationMarkKind = "point" | "box" | "pen";
export type ImageAnnotationMark = {
  id: string;
  kind: AnnotationMarkKind;
  points: AnnotationPoint[];
  /** User's instruction for this exact marked region. */
  comment?: string;
};
export type ImageBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ImageRefinementDisplay = {
  notes: string[];
};

/** Leave transport headroom below the shared 2 MiB image-upload limit. */
export const MAX_ANNOTATION_IMAGE_BYTES = Math.floor(1.8 * 1024 * 1024);

const ANNOTATION_ENCODING_STEPS = [
  { scale: 1, quality: 0.86 },
  { scale: 1, quality: 0.72 },
  { scale: 0.85, quality: 0.8 },
  { scale: 0.85, quality: 0.66 },
  { scale: 0.7, quality: 0.74 },
  { scale: 0.7, quality: 0.6 },
  { scale: 0.55, quality: 0.68 },
  { scale: 0.45, quality: 0.62 },
  { scale: 0.35, quality: 0.58 },
  { scale: 0.28, quality: 0.54 },
] as const;

type AnnotationBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Number(clamp(value).toFixed(4));
}

function format(value: number): string {
  return round(value).toString();
}

export function normalizeAnnotationPoint(
  point: { x: number; y: number },
  bounds: ImageBounds,
): AnnotationPoint {
  if (bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp((point.x - bounds.left) / bounds.width),
    y: clamp((point.y - bounds.top) / bounds.height),
  };
}

export function annotationBounds(
  marks: readonly ImageAnnotationMark[],
): AnnotationBounds | null {
  const points = marks.flatMap((mark) => mark.points);
  if (!points.length) return null;

  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const point of points) {
    const x = clamp(point.x);
    const y = clamp(point.y);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    x: round(minX),
    y: round(minY),
    width: round(maxX - minX),
    height: round(maxY - minY),
  };
}

/** Returns the decoded byte count of a base64 data URL without allocating it. */
export function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const base64 = dataUrl.slice(comma + 1);
  if (!base64) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function markDescription(mark: ImageAnnotationMark): string {
  const points = mark.points
    .map((point) => `(${format(point.x)}, ${format(point.y)})`)
    .join(" -> ");
  const bounds = annotationBounds([mark]);
  const boundText = bounds
    ? ` bounds=(${format(bounds.x)}, ${format(bounds.y)}, ${format(bounds.width)}, ${format(bounds.height)})`
    : "";
  const comment = mark.comment?.trim();
  const commentText = comment ? ` note=${JSON.stringify(comment)}` : "";
  return `${mark.kind} ${points}${boundText}${commentText}`;
}

export function buildImageRefinementInstruction(input: {
  baseArtifactId: string;
  annotationArtifactId: string;
  request: string;
  marks: readonly ImageAnnotationMark[];
}): string {
  const request = input.request.trim();
  const marks = input.marks.map(markDescription).join("; ");
  return [
    "图片局部修改请求：",
    `clean base artifact id=${input.baseArtifactId}; marked reference artifact id=${input.annotationArtifactId}.`,
    "sourceArtifactIds must be [base, marked]，且顺序必须保持为干净原图在前、带标记参考图在后。",
    `标记区域（归一化 0-1 坐标）：${marks || "none"}。`,
    `总体要求：${request || "请按每个标记旁的说明修改。"}`,
    "每个标记的 note 是该区域独立的修改说明；分别执行这些说明，不要把一个区域的说明扩展到其他区域。",
    "只修改标记区域，除非用户要求明确需要影响其他区域；标记中的蓝色图钉、红色方框和画笔线仅用于定位，绝不能保留在输出图片中。",
  ].join("\n");
}

/**
 * Converts a persisted internal refinement prompt into user-facing chip data.
 * The complete prompt remains stored and is still sent to the model; this only
 * prevents artifact ids and normalized coordinates from leaking into the chat UI.
 */
export function getImageRefinementDisplay(
  content: string,
): ImageRefinementDisplay | null {
  if (!content.startsWith("图片局部修改请求：")) return null;

  const notes: string[] = [];
  const notePattern = /\bnote=("(?:\\.|[^"\\])*")/g;
  for (const match of content.matchAll(notePattern)) {
    try {
      const note = JSON.parse(match[1] ?? "") as unknown;
      if (typeof note === "string" && note.trim()) notes.push(note.trim());
    } catch {
      // Ignore malformed historical text and still render a safe summary chip.
    }
  }
  return { notes };
}

function pointToPixels(point: AnnotationPoint, width: number, height: number) {
  return { x: clamp(point.x) * width, y: clamp(point.y) * height };
}

/** Draw visible targeting directions over a natural-size image canvas. */
export function drawImageAnnotationMarks(
  ctx: CanvasRenderingContext2D,
  marks: readonly ImageAnnotationMark[],
  width: number,
  height: number,
): void {
  const scale = Math.max(1, Math.min(width, height) / 800);
  const lineWidth = Math.max(3, 5 * scale);
  const pinRadius = Math.max(8, 14 * scale);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const mark of marks) {
    if (mark.kind === "point") {
      const point = mark.points[0];
      if (!point) continue;
      const { x, y } = pointToPixels(point, width, height);
      ctx.fillStyle = "#2563eb";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(2, lineWidth * 0.5);
      ctx.beginPath();
      ctx.arc(x, y, pinRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, pinRadius * 0.24), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    if (mark.kind === "box") {
      const first = mark.points[0];
      const last = mark.points[1];
      if (!first || !last) continue;
      const start = pointToPixels(first, width, height);
      const end = pointToPixels(last, width, height);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([lineWidth * 2, lineWidth * 1.4]);
      ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
      ctx.setLineDash([]);
      continue;
    }

    if (mark.points.length < 2) continue;
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    mark.points.forEach((point, index) => {
      const pixel = pointToPixels(point, width, height);
      if (index === 0) ctx.moveTo(pixel.x, pixel.y);
      else ctx.lineTo(pixel.x, pixel.y);
    });
    ctx.stroke();
  }
  ctx.restore();
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("浏览器无法压缩批注图"));
    }, mimeType, quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("读取批注图失败"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Composite the clean source image with marks into an upload-safe JPEG.
 * The source is deliberately kept separate in the actual edit request, so
 * this image only needs enough fidelity to communicate targets to the model.
 */
export async function compositeImageAnnotation(
  image: HTMLImageElement,
  marks: readonly ImageAnnotationMark[],
): Promise<string> {
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  if (!naturalWidth || !naturalHeight) {
    throw new Error("图片尚未准备好，无法创建标注");
  }

  // Do not allocate an unnecessarily huge canvas for a high-resolution source.
  const baseScale = Math.min(1, 4096 / Math.max(naturalWidth, naturalHeight));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持图片标注画布");

  for (const step of ANNOTATION_ENCODING_STEPS) {
    const width = Math.max(1, Math.round(naturalWidth * baseScale * step.scale));
    const height = Math.max(1, Math.round(naturalHeight * baseScale * step.scale));
    canvas.width = width;
    canvas.height = height;
    // JPEG has no alpha channel. A white backing avoids black transparent areas.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    drawImageAnnotationMarks(ctx, marks, width, height);

    const blob = await canvasToBlob(canvas, "image/jpeg", step.quality);
    if (blob.size > MAX_ANNOTATION_IMAGE_BYTES) continue;
    return blobToDataUrl(blob);
  }

  throw new Error("图片细节过多，无法压缩到可提交的批注大小，请换一张较小的图片后重试");
}
