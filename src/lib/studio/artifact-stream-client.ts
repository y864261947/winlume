"use client";

export type ArtifactStreamEvent =
  | { type: "artifact_updated"; artifactId: string; status: "pending" | "ready" | "failed" }
  | { type: "ping" };

/**
 * Opens one long-lived EventSource against /api/artifacts/stream and calls
 * `onEvent` for every artifact_updated frame. Returns an unsubscribe
 * function that closes the connection.
 */
export function subscribeArtifactStream(
  onEvent: (event: Extract<ArtifactStreamEvent, { type: "artifact_updated" }>) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const source = new EventSource("/api/artifacts/stream");
  source.onmessage = (e) => {
    let parsed: ArtifactStreamEvent;
    try {
      parsed = JSON.parse(e.data) as ArtifactStreamEvent;
    } catch {
      return;
    }
    if (parsed.type === "artifact_updated") onEvent(parsed);
  };

  return () => source.close();
}
