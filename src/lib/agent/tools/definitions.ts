/**
 * OpenAI-compatible tool schemas for the Studio free agent (web-safe MVP).
 */

export type StudioToolName =
  | "write_artifact"
  | "read_artifact"
  | "list_artifacts";

/** OpenAI tools array passed to streamGatewayChat. */
export const STUDIO_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "write_artifact",
      description:
        "Save a durable text artifact for the user to preview later. Prefer this for long documents, reports, and structured deliverables instead of dumping huge walls of text in chat.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Short human-readable title for the artifact",
          },
          kind: {
            type: "string",
            enum: ["markdown", "html", "text", "json"],
            description: "Content format",
          },
          content: {
            type: "string",
            description: "Full artifact body",
          },
        },
        required: ["name", "kind", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_artifact",
      description:
        "Read a previously saved artifact by id (metadata + text content). Content may be truncated if very large.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Artifact id returned by write_artifact or list_artifacts",
          },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_artifacts",
      description:
        "List artifacts for the current session (id, name, kind, createdAt). Does not return full content.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["session", "user"],
            description:
              "session (default): only this chat session; user: all of the user's artifacts",
          },
        },
        additionalProperties: false,
      },
    },
  },
] as const;

export const STUDIO_TOOL_NAMES: readonly StudioToolName[] = [
  "write_artifact",
  "read_artifact",
  "list_artifacts",
] as const;
