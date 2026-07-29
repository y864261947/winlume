"use client";

import {
  mergeCanvasElements,
  type CanvasElement,
} from "@/lib/agent/canvas-content";

/**
 * Runs Mermaid conversion only in the browser. The imports stay inside the
 * function so Node-side test collection never evaluates Mermaid or browser
 * globals, while Next still creates a client chunk for the conversion path.
 */
export async function convertMermaidToCanvasElements(
  mermaid: string,
): Promise<CanvasElement[]> {
  const [{ parseMermaidToExcalidraw }, { convertToExcalidrawElements }] = await Promise.all([
    import("@excalidraw/mermaid-to-excalidraw"),
    import("@excalidraw/excalidraw"),
  ]);
  const { elements: skeletonElements } = await parseMermaidToExcalidraw(mermaid);
  return convertToExcalidrawElements(skeletonElements) as unknown as CanvasElement[];
}

/** Pure merge step used by the client conversion flow. */
export function buildUpdatedScene(
  oldElements: CanvasElement[],
  freshMermaidElements: CanvasElement[],
): CanvasElement[] {
  return mergeCanvasElements(oldElements, freshMermaidElements);
}
