import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Artifact, Message, Session } from "@/lib/agent/types";
import type { ArtifactStore, SessionStore } from "@/lib/host/ports";
import {
  artifactsIndexPath,
  blobPath,
  sessionFilePath,
  sessionsIndexPath,
  storageKeyFor,
  userDir,
} from "./paths";

interface SessionFile {
  session: Session;
  messages: Message[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/** Atomic write: temp file in same dir + rename. */
function atomicWriteFile(filePath: string, data: string | Buffer): void {
  ensureDir(dirname(filePath));
  const tmp = join(dirname(filePath), `.${randomUUID()}.tmp`);
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, filePath);
  } catch (err) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* ignore cleanup errors */
    }
    throw err;
  }
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  const raw = readFileSync(filePath, "utf8");
  if (!raw.trim()) return fallback;
  return JSON.parse(raw) as T;
}

function writeJsonFile(filePath: string, value: unknown): void {
  atomicWriteFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createSessionStore(rootDir: string): SessionStore {
  function readIndex(userId: string): Session[] {
    return readJsonFile<Session[]>(sessionsIndexPath(rootDir, userId), []);
  }

  function writeIndex(userId: string, sessions: Session[]): void {
    writeJsonFile(sessionsIndexPath(rootDir, userId), sessions);
  }

  function readSessionFile(userId: string, sessionId: string): SessionFile | null {
    const path = sessionFilePath(rootDir, userId, sessionId);
    if (!existsSync(path)) return null;
    return readJsonFile<SessionFile | null>(path, null);
  }

  function writeSessionFile(userId: string, data: SessionFile): void {
    writeJsonFile(sessionFilePath(rootDir, userId, data.session.id), data);
  }

  return {
    async listSessions(userId) {
      const sessions = readIndex(userId);
      return [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async getSession(userId, sessionId) {
      const file = readSessionFile(userId, sessionId);
      if (file) return file.session;
      const fromIndex = readIndex(userId).find((s) => s.id === sessionId);
      return fromIndex ?? null;
    },

    async createSession(input) {
      ensureDir(userDir(rootDir, input.userId));
      const createdAt = input.createdAt ?? nowIso();
      const session: Session = {
        id: input.id,
        userId: input.userId,
        title: input.title,
        model: input.model,
        createdAt,
        updatedAt: createdAt,
      };

      const index = readIndex(input.userId);
      if (index.some((s) => s.id === session.id)) {
        throw new Error(`Session already exists: ${session.id}`);
      }
      index.push(session);
      writeIndex(input.userId, index);
      writeSessionFile(input.userId, { session, messages: [] });
      return session;
    },

    async updateSession(userId, sessionId, patch) {
      const file = readSessionFile(userId, sessionId);
      if (!file) throw new Error(`Session not found: ${sessionId}`);

      const session: Session = {
        ...file.session,
        ...patch,
        updatedAt: nowIso(),
      };
      writeSessionFile(userId, { session, messages: file.messages });

      const index = readIndex(userId);
      const i = index.findIndex((s) => s.id === sessionId);
      if (i >= 0) {
        index[i] = session;
      } else {
        index.push(session);
      }
      writeIndex(userId, index);
      return session;
    },

    async deleteSession(userId, sessionId) {
      const path = sessionFilePath(rootDir, userId, sessionId);
      if (existsSync(path)) unlinkSync(path);
      writeIndex(
        userId,
        readIndex(userId).filter((s) => s.id !== sessionId),
      );
    },

    async listMessages(userId, sessionId) {
      const file = readSessionFile(userId, sessionId);
      return file?.messages ?? [];
    },

    async appendMessages(userId, sessionId, messages) {
      const file = readSessionFile(userId, sessionId);
      if (!file) throw new Error(`Session not found: ${sessionId}`);

      const session: Session = {
        ...file.session,
        updatedAt: nowIso(),
      };
      writeSessionFile(userId, {
        session,
        messages: [...file.messages, ...messages],
      });

      const index = readIndex(userId);
      const i = index.findIndex((s) => s.id === sessionId);
      if (i >= 0) {
        index[i] = session;
        writeIndex(userId, index);
      }
    },
  };
}

function createArtifactStore(rootDir: string): ArtifactStore {
  function readIndex(userId: string): Artifact[] {
    return readJsonFile<Artifact[]>(artifactsIndexPath(rootDir, userId), []);
  }

  function writeIndex(userId: string, artifacts: Artifact[]): void {
    writeJsonFile(artifactsIndexPath(rootDir, userId), artifacts);
  }

  return {
    async listByUser(userId) {
      return readIndex(userId);
    },

    async listBySession(userId, sessionId) {
      return readIndex(userId).filter((a) => a.sessionId === sessionId);
    },

    async get(userId, artifactId) {
      return readIndex(userId).find((a) => a.id === artifactId) ?? null;
    },

    async write(meta, content) {
      const artifact: Artifact = {
        ...meta,
        storageKey: meta.storageKey || storageKeyFor(meta.userId, meta.id),
      };
      const path = blobPath(rootDir, artifact.userId, artifact.id);
      const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
      atomicWriteFile(path, buf);

      const index = readIndex(artifact.userId).filter((a) => a.id !== artifact.id);
      index.push(artifact);
      writeIndex(artifact.userId, index);
      return artifact;
    },

    async readContent(userId, artifactId) {
      const path = blobPath(rootDir, userId, artifactId);
      if (!existsSync(path)) return null;
      return readFileSync(path);
    },
  };
}

export interface WebFileStore {
  sessions: SessionStore;
  artifacts: ArtifactStore;
}

/**
 * File-backed SessionStore + ArtifactStore under `rootDir`
 * (typically project `data/`):
 * - users/{userId}/sessions.json
 * - users/{userId}/sessions/{sessionId}.json → { session, messages }
 * - users/{userId}/artifacts.json
 * - blobs/{userId}/{artifactId}
 */
export function createWebFileStore(rootDir: string): WebFileStore {
  ensureDir(rootDir);
  return {
    sessions: createSessionStore(rootDir),
    artifacts: createArtifactStore(rootDir),
  };
}
