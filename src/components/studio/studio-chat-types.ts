import type { ArtifactKind, Message } from "@/lib/agent/types";
import type { StudioUIMessage } from "@/lib/studio/ui-message-adapter";
import type { ComposerOptions } from "@/lib/studio/composer-options";

export const MAX_MESSAGE_QUEUE_SIZE = 5;

export type ArtifactEventPayload = {
  artifactId: string;
  name: string;
  kind: ArtifactKind;
};

export type StudioQueuedMessage = {
  id: string;
  content: string;
  model?: string;
  capabilityPresetId?: string;
  skillIds?: string[];
  referencedArtifactIds?: string[];
  /** @deprecated Use referencedArtifactIds. */
  referencedArtifactId?: string;
  composerOptions?: ComposerOptions;
  createdAt: number;
};

export type StudioPreparedTurn = {
  id: string;
  setStatus: (label: string) => void;
  fail: (message: string) => void;
  commit: (
    text: string,
    overrides?: StudioSendOverrides,
  ) => Promise<"sent" | "rejected">;
};

export type StudioSendOverrides = {
  model?: string;
  capabilityPresetId?: string;
  skillIds?: string[];
  referencedArtifactIds?: string[];
  referencedArtifactId?: string;
  composerOptions?: ComposerOptions;
  projectId?: string;
  bootstrap?: { title?: string };
};

export type StudioChatOptions = {
  sessionId?: string | null;
  initialMessages?: Message[];
  model?: string;
  skillIds?: string[];
  onSession?: (sessionId: string) => void;
  onUnauthorized?: () => void;
  onArtifact?: (event: ArtifactEventPayload) => void;
  onFinish?: () => void;
  activeRun?: { id: string; status: string; message: string } | null;
};

export type StudioChatResult = {
  sessionId: string | null;
  messages: StudioUIMessage[];
  streaming: boolean;
  error: string | null;
  model: string;
  setModel: (model: string) => void;
  setMessages: (
    update:
      | StudioUIMessage[]
      | ((previous: StudioUIMessage[]) => StudioUIMessage[]),
  ) => void;
  send: (
    text: string,
    overrides?: StudioSendOverrides,
  ) => Promise<"sent" | "queued" | "rejected">;
  prepare: (
    text: string,
    label?: string,
  ) => StudioPreparedTurn | null;
  stop: () => void;
  clearError: () => void;
  retryError: () => Promise<void>;
  resumeStream: () => Promise<void>;
  regenerate: (options?: { messageId?: string }) => Promise<void>;
  queue: StudioQueuedMessage[];
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
};
