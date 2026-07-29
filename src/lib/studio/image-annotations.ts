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
};
export type ImageBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

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

function markDescription(mark: ImageAnnotationMark): string {
  const points = mark.points
    .map((point) => `(${format(point.x)}, ${format(point.y)})`)
    .join(" -> ");
  const bounds = annotationBounds([mark]);
  const boundText = bounds
    ? ` bounds=(${format(bounds.x)}, ${format(bounds.y)}, ${format(bounds.width)}, ${format(bounds.height)})`
    : "";
  return `${mark.kind} ${points}${boundText}`;
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
    `用户要求：${request || "请按标记区域修改。"}`,
    "只修改标记区域，除非用户要求明确需要影响其他区域；标记中的蓝色图钉、红色方框和画笔线仅用于定位，绝不能保留在输出图片中。",
  ].join("\n");
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

/** Composite the clean source image with marks at its natural pixel dimensions. */
export async function compositeImageAnnotation(
  image: HTMLImageElement,
  marks: readonly ImageAnnotationMark[],
): Promise<string> {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) {
    throw new Error("图片尚未准备好，无法创建标注");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持图片标注画布");
  ctx.drawImage(image, 0, 0, width, height);
  drawImageAnnotationMarks(ctx, marks, width, height);
  return canvas.toDataURL("image/png");
}
