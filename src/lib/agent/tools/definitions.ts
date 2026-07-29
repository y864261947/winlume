/**
 * OpenAI-compatible tool schemas for the Studio free agent (web-safe MVP).
 */

export type StudioToolName =
  | "todo_write"
  | "write_artifact"
  | "read_artifact"
  | "list_artifacts"
  | "generate_image"
  | "generate_canvas";

/** OpenAI tools array passed to streamGatewayChat. */
export const STUDIO_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "todo_write",
      description:
        "Create and manage a structured task list the user sees live. Use for complex work with 3+ steps. Skip for simple Q&A or single-step tasks. Merge by default: send only id+status to flip progress. Keep exactly one item in_progress until all are done. When revising the plan mid-task, set explanation with a short rationale.",
      parameters: {
        type: "object",
        properties: {
          merge: {
            type: "boolean",
            description:
              "When true (default), merge into the existing list by id. When false, replace the entire list.",
          },
          explanation: {
            type: "string",
            description:
              "Optional one-line reason when creating or changing the plan (shown to the user briefly).",
          },
          todos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Stable id for this step (e.g. outline, draft, save)",
                },
                content: {
                  type: "string",
                  description:
                    "Short user-facing label (user's language). Optional on merge status-only updates.",
                },
                status: {
                  type: "string",
                  enum: ["pending", "in_progress", "completed", "cancelled"],
                  description: "pending | in_progress | completed | cancelled",
                },
              },
              required: ["id"],
              additionalProperties: false,
            },
            minItems: 1,
            maxItems: 12,
            description: "Todo items to write or merge",
          },
        },
        required: ["todos"],
        additionalProperties: false,
      },
    },
  },
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
  {
    type: "function" as const,
    function: {
      name: "generate_image",
      description:
        "Generate a new image from a text prompt, or edit/compose existing image artifacts. For any task that depends on existing images, pass every required image in sourceArtifactIds; the first image is the base and later images are references to insert or combine. Returns immediately with pending artifact id(s); the image renders in the artifact panel once generation finishes — do not wait for it or claim it is ready in this turn.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Short human-readable title for the artifact",
          },
          prompt: {
            type: "string",
            description: "Full description of the desired image or edit. Preserve the user's requested operation and constraints; image ids in this text do not replace sourceArtifactIds.",
          },
          model: {
            type: "string",
            description: "Image model id. Omit to use the session/scenario default.",
          },
          size: {
            type: "string",
            enum: ["1024x1024", "1024x1536", "1536x1024"],
            description: "Output image dimensions",
          },
          style: {
            type: "string",
            description: "Optional style hint appended to the prompt (e.g. 'flat illustration', 'photorealistic')",
          },
          count: {
            type: "integer",
            minimum: 1,
            maximum: 4,
            description: "How many images to generate (each becomes its own artifact)",
          },
          sourceArtifactId: {
            type: "string",
            description: "Legacy single image artifact id. Prefer sourceArtifactIds for new calls.",
          },
          sourceArtifactIds: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 16,
            description:
              "Ordered ids of every image needed for the edit/composition. Put the base image first, followed by all reference images whose visual content the result must use.",
          },
        },
        required: ["name", "prompt", "size", "count"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_canvas",
      description:
        "Generate or update an editable infinite-canvas diagram (flowchart, mind map, sequence diagram, etc.) by writing Mermaid syntax. Returns immediately with a pending artifact id; the diagram renders in the artifact panel once client-side conversion finishes. Do not wait for it or claim it is ready in this turn. Pass sourceArtifactId to update an existing canvas. When updating, read the injected structural summary of its current contents first so you do not ignore changes the user already made by hand.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Short human-readable title for the artifact",
          },
          mermaid: {
            type: "string",
            description: "Full Mermaid diagram definition (for example, 'flowchart TD\\nA-->B')",
          },
          sourceArtifactId: {
            type: "string",
            description: "Existing canvas artifact id to update. Omit to create a new canvas.",
          },
        },
        required: ["name", "mermaid"],
        additionalProperties: false,
      },
    },
  },
] as const;

export const STUDIO_TOOL_NAMES: readonly StudioToolName[] = [
  "todo_write",
  "write_artifact",
  "read_artifact",
  "list_artifacts",
  "generate_image",
  "generate_canvas",
] as const;
