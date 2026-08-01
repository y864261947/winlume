import type { Artifact, Message, Project, Session } from "@/lib/agent/types";

export interface SessionStore {
  listSessions(userId: string, projectId?: string): Promise<Session[]>;
  getSession(userId: string, sessionId: string): Promise<Session | null>;
  createSession(
    input: Omit<Session, "createdAt" | "updatedAt"> & { createdAt?: string },
  ): Promise<Session>;
  updateSession(
    userId: string,
    sessionId: string,
    patch: Partial<
      Pick<Session, "title" | "model" | "pinnedSkillIds" | "codexThreadId">
    > & { projectId?: string | null },
  ): Promise<Session>;
  deleteSession(userId: string, sessionId: string): Promise<void>;
  listMessages(userId: string, sessionId: string): Promise<Message[]>;
  appendMessages(userId: string, sessionId: string, messages: Message[]): Promise<void>;
}

export interface ProjectStore {
  listProjects(userId: string): Promise<Project[]>;
  getProject(userId: string, projectId: string): Promise<Project | null>;
  createProject(
    input: Omit<Project, "createdAt" | "updatedAt" | "userId"> & {
      userId: string;
      createdAt?: string;
    },
  ): Promise<Project>;
  updateProject(
    userId: string,
    projectId: string,
    patch: Partial<Pick<Project, "name" | "pinnedSkillIds">> & {
      description?: string | null;
      instructions?: string | null;
    },
  ): Promise<Project>;
  deleteProject(userId: string, projectId: string): Promise<void>;
}

export interface ArtifactStore {
  listByUser(userId: string): Promise<Artifact[]>;
  listBySession(userId: string, sessionId: string): Promise<Artifact[]>;
  listByProject(userId: string, projectId: string): Promise<Artifact[]>;
  get(userId: string, artifactId: string): Promise<Artifact | null>;
  write(meta: Artifact, content: Buffer | string): Promise<Artifact>;
  readContent(userId: string, artifactId: string): Promise<Buffer | null>;
}
