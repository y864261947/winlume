import { describe, expect, it } from "vitest";
import {
  mergeCanvasElements,
  needsCanvasConversion,
  parseCanvasContent,
  sanitizeCanvasAppState,
  serializeCanvasContent,
  tagAsMermaidSourced,
  type CanvasArtifactContent,
  type CanvasElement,
} from "./canvas-content";

describe("serializeCanvasContent / parseCanvasContent", () => {
  it("round-trips a full envelope", () => {
    const content: CanvasArtifactContent = {
      mermaidSource: "flowchart TD\nA-->B",
      convertedFromMermaid: "flowchart TD\nA-->B",
      scene: { elements: [{ id: "1" }], appState: { zoom: 1 } },
    };

    expect(parseCanvasContent(serializeCanvasContent(content))).toEqual(content);
  });

  it("returns null for invalid JSON", () => {
    expect(parseCanvasContent("{not json")).toBeNull();
  });

  it("returns null when mermaidSource is missing", () => {
    expect(parseCanvasContent(JSON.stringify({ scene: { elements: [], appState: {} } }))).toBeNull();
  });

  it("removes Excalidraw collaboration state while saving and loading", () => {
    const content: CanvasArtifactContent = {
      mermaidSource: "flowchart TD\nA-->B",
      scene: {
        elements: [],
        appState: { collaborators: new Map([["user", { id: "user" }]]), zoom: 1 },
      },
    };

    const saved = serializeCanvasContent(content);
    expect(saved).not.toContain("collaborators");
    expect(parseCanvasContent(saved)?.scene?.appState).toEqual({ zoom: 1 });
  });

  it("repairs legacy payloads where JSON converted collaborators to an object", () => {
    const legacy = JSON.stringify({
      mermaidSource: "flowchart TD\nA-->B",
      scene: { elements: [], appState: { collaborators: {}, zoom: 1 } },
    });

    expect(parseCanvasContent(legacy)?.scene?.appState).toEqual({ zoom: 1 });
    expect(sanitizeCanvasAppState({ collaborators: {}, zoom: 1 })).toEqual({ zoom: 1 });
  });
});

describe("needsCanvasConversion", () => {
  it("is true when scene is absent", () => {
    expect(needsCanvasConversion({ mermaidSource: "flowchart TD\nA-->B" })).toBe(true);
  });

  it("is true when mermaidSource changed since last conversion", () => {
    expect(
      needsCanvasConversion({
        mermaidSource: "flowchart TD\nA-->B-->C",
        convertedFromMermaid: "flowchart TD\nA-->B",
        scene: { elements: [], appState: {} },
      }),
    ).toBe(true);
  });

  it("is false when scene matches the current mermaidSource", () => {
    expect(
      needsCanvasConversion({
        mermaidSource: "flowchart TD\nA-->B",
        convertedFromMermaid: "flowchart TD\nA-->B",
        scene: { elements: [], appState: {} },
      }),
    ).toBe(false);
  });
});

describe("tagAsMermaidSourced", () => {
  it("adds customData.source = mermaid without clobbering existing customData", () => {
    const elements: CanvasElement[] = [
      { id: "a" },
      { id: "b", customData: { note: "keep me" } },
    ];

    const tagged = tagAsMermaidSourced(elements);
    expect(tagged[0]!.customData).toEqual({ source: "mermaid" });
    expect(tagged[1]!.customData).toEqual({ note: "keep me", source: "mermaid" });
  });
});

describe("mergeCanvasElements", () => {
  it("replaces mermaid-tagged elements and preserves user-drawn ones", () => {
    const oldElements: CanvasElement[] = [
      { id: "old-node", customData: { source: "mermaid" } },
      { id: "user-note" },
    ];
    const fresh: CanvasElement[] = [{ id: "new-node" }];

    const merged = mergeCanvasElements(oldElements, fresh);
    expect(merged).toContainEqual({ id: "new-node", customData: { source: "mermaid" } });
    expect(merged).toContainEqual({ id: "user-note" });
    expect(merged.find((el) => el.id === "old-node")).toBeUndefined();
  });

  it("handles an empty old scene (create path)", () => {
    const fresh: CanvasElement[] = [{ id: "a" }, { id: "b" }];
    expect(mergeCanvasElements([], fresh)).toEqual(tagAsMermaidSourced(fresh));
  });
});
