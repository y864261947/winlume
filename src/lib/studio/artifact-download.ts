import type { Artifact } from "@/lib/agent/types";

export function imageArtifactExtension(mimeType?: string): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  return ".png";
}

export function downloadImageArtifact(
  artifact: Pick<Artifact, "id" | "name" | "mimeType">,
): void {
  const a = document.createElement("a");
  a.href = `/api/artifacts/${artifact.id}/raw`;
  a.download = `${artifact.name}${imageArtifactExtension(artifact.mimeType)}`;
  a.click();
}
