import { describe, expect, it } from "vitest";
import { buildUpdatedScene } from "./canvas-convert";

describe("buildUpdatedScene", () => {
  it("merges fresh Mermaid elements with preserved user-drawn ones", () => {
    const old = [{ id: "user-1" }];
    const fresh = [{ id: "node-1" }];

    const merged = buildUpdatedScene(old, fresh);
    expect(merged).toContainEqual({ id: "user-1" });
    expect(merged).toContainEqual({ id: "node-1", customData: { source: "mermaid" } });
  });
});
