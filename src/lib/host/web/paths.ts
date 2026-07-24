import { join } from "node:path";

/** Safe path segment: reject empty, dots, and separators. */
export function assertSafeId(id: string, label = "id"): string {
  if (!id || id === "." || id === ".." || /[/\\]/.test(id)) {
    throw new Error(`Invalid ${label}: ${JSON.stringify(id)}`);
  }
  return id;
}

export function userDir(rootDir: string, userId: string): string {
  return join(rootDir, "users", assertSafeId(userId, "userId"));
}

export function sessionsIndexPath(rootDir: string, userId: string): string {
  return join(userDir(rootDir, userId), "sessions.json");
}

export function sessionFilePath(rootDir: string, userId: string, sessionId: string): string {
  return join(
    userDir(rootDir, userId),
    "sessions",
    `${assertSafeId(sessionId, "sessionId")}.json`,
  );
}

export function artifactsIndexPath(rootDir: string, userId: string): string {
  return join(userDir(rootDir, userId), "artifacts.json");
}

export function blobPath(rootDir: string, userId: string, artifactId: string): string {
  return join(
    rootDir,
    "blobs",
    assertSafeId(userId, "userId"),
    assertSafeId(artifactId, "artifactId"),
  );
}

export function storageKeyFor(userId: string, artifactId: string): string {
  return `blobs/${assertSafeId(userId, "userId")}/${assertSafeId(artifactId, "artifactId")}`;
}
