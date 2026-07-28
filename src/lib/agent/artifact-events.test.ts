import { describe, expect, it, vi } from "vitest";
import { publishArtifactEvent, subscribeArtifactEvents } from "./artifact-events";

describe("artifact-events", () => {
  it("delivers a published event to a subscribed listener", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeArtifactEvents("user-1", listener);

    publishArtifactEvent("user-1", {
      type: "artifact_updated",
      artifactId: "art-1",
      status: "ready",
    });

    expect(listener).toHaveBeenCalledWith({
      type: "artifact_updated",
      artifactId: "art-1",
      status: "ready",
    });
    unsubscribe();
  });

  it("does not deliver to listeners of a different user", () => {
    const listener = vi.fn();
    subscribeArtifactEvents("user-1", listener);

    publishArtifactEvent("user-2", {
      type: "artifact_updated",
      artifactId: "art-1",
      status: "ready",
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeArtifactEvents("user-1", listener);
    unsubscribe();

    publishArtifactEvent("user-1", {
      type: "artifact_updated",
      artifactId: "art-1",
      status: "failed",
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not throw when publishing with no subscribers", () => {
    expect(() =>
      publishArtifactEvent("nobody-listening", {
        type: "artifact_updated",
        artifactId: "art-1",
        status: "ready",
      }),
    ).not.toThrow();
  });

  it("keeps delivering to remaining listeners if one listener throws", () => {
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    subscribeArtifactEvents("user-1", bad);
    subscribeArtifactEvents("user-1", good);

    expect(() =>
      publishArtifactEvent("user-1", {
        type: "artifact_updated",
        artifactId: "art-1",
        status: "ready",
      }),
    ).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});
