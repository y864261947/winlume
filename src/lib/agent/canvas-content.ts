export interface CanvasElement {
  id: string;
  customData?: { source?: string } & Record<string, unknown>;
  [key: string]: unknown;
}

export interface CanvasArtifactContent {
  mermaidSource: string;
  /** Mermaid source from which the current scene was generated. */
  convertedFromMermaid?: string;
  scene?: {
    elements: CanvasElement[];
    appState: Record<string, unknown>;
  };
}

export function serializeCanvasContent(content: CanvasArtifactContent): string {
  return JSON.stringify(content);
}

export function parseCanvasContent(raw: string): CanvasArtifactContent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { mermaidSource?: unknown }).mermaidSource !== "string"
  ) {
    return null;
  }

  return parsed as CanvasArtifactContent;
}

export function needsCanvasConversion(content: CanvasArtifactContent): boolean {
  return !content.scene || content.convertedFromMermaid !== content.mermaidSource;
}

export function tagAsMermaidSourced(elements: CanvasElement[]): CanvasElement[] {
  return elements.map((element) => ({
    ...element,
    customData: { ...(element.customData ?? {}), source: "mermaid" },
  }));
}

export function mergeCanvasElements(
  oldElements: CanvasElement[],
  freshMermaidElements: CanvasElement[],
): CanvasElement[] {
  const userDrawn = oldElements.filter((element) => element.customData?.source !== "mermaid");
  return [...tagAsMermaidSourced(freshMermaidElements), ...userDrawn];
}
