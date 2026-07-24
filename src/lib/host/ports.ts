import type { Artifact, Message, Session } from "@/lib/agent/types";

export interface SessionStore {
  listSessions(userId: string): Promise<Session[]>;
  getSession(userId: string, sessionId: string): Promise<Session | null>;
  createSession(
    input: Omit<Session, "createdAt" | "updatedAt"> & { createdAt?: string },
  ): Promise<Session>;
  updateSession(
    userId: string,
    sessionId: string,
    patch: Partial<Pick<Session, "title" | "model">>,
  ): Promise<Session>;
  deleteSession(userId: string, sessionId: string): Promise<void>;
  listMessages(userId: string, sessionId: string): Promise<Message[]>;
  appendMessages(userId: string, sessionId: string, messages: Message[]): Promise<void>;
}

export interface ArtifactStore {
  listByUser(userId: string): Promise<Artifact[]>;
  listBySession(userId: string, sessionId: string): Promise<Artifact[]>;
  get(userId: string, artifactId: string): Promise<Artifact | null>;
  write(meta: Artifact, content: Buffer | string): Promise<Artifact>;
  readContent(userId: string, artifactId: string): Promise<Buffer | null>;
}
