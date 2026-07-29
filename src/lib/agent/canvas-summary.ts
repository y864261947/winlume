import type { CanvasElement } from "@/lib/agent/canvas-content";

/**
 * Describes the current canvas for model context. This intentionally does not
 * attempt a reverse Mermaid conversion, so manually drawn elements remain
 * represented as the user actually left them.
 */
export function summarizeCanvasElements(elements: CanvasElement[]): string {
  if (elements.length === 0) return "(canvas is empty)";

  const labels: string[] = [];
  const shapeCounts = new Map<string, number>();
  let connections = 0;

  for (const element of elements) {
    const type = typeof element.type === "string" ? element.type : "shape";
    if (type === "arrow" || type === "line") {
      connections += 1;
      continue;
    }
    if (type === "text" && typeof element.text === "string" && element.text.trim()) {
      labels.push(element.text.trim());
      continue;
    }
    shapeCounts.set(type, (shapeCounts.get(type) ?? 0) + 1);
  }

  const lines: string[] = [];
  if (labels.length) lines.push(`Labels: ${labels.join(", ")}`);
  for (const [type, count] of shapeCounts) {
    lines.push(`${count} ${type}${count === 1 ? "" : "s"}`);
  }
  if (connections) lines.push(`${connections} connection${connections === 1 ? "" : "s"}`);

  return lines.join("; ") || "(canvas has elements with no readable content)";
}
