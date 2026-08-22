/**
 * OpenAI-compatible tool schemas for the Studio free agent (web-safe MVP).
 */

export type StudioToolName =
  | "todo_write"
  | "write_artifact"
  | "read_artifact"
  | "list_artifacts"
  | "generate_image"
  | "fuse_images"
  | "generate_ecommerce_image_set"
  | "remove_background"
  | "upscale_image"
  | "remove_watermark_or_subtitles"
  | "generate_canvas"
  | "generate_sheet";

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
        "List artifacts shared by the current session, project, or user (id, name, kind, createdAt). Does not return full content.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["session", "project", "user"],
            description:
              "session (default): this chat; project: artifacts from all chats in the current project; user: all of the user's artifacts",
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
      name: "fuse_images",
      description:
        "Fuse exactly two existing image artifacts into a new image. The first source is the base composition and the second is the subject or visual element to merge. Use a precise prompt to state what must be preserved and how the images should combine. Returns a pending image artifact; do not claim the final image is ready in the same turn.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Short human-readable title for the generated image.",
          },
          prompt: {
            type: "string",
            description:
              "Explain how the second image should be merged into the first and the details that must remain unchanged.",
          },
          size: {
            type: "string",
            enum: ["1024x1024", "1024x1536", "1536x1024"],
            description: "Output image dimensions.",
          },
          sourceArtifactIds: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            maxItems: 2,
            description:
              "Exactly two source image artifact ids. The first is the base composition; the second is the reference to merge.",
          },
        },
        required: ["name", "prompt", "size", "sourceArtifactIds"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_ecommerce_image_set",
      description:
        "Start an e-commerce image-set ToolJob from one product image: it creates a hidden product cutout, plans hero/lifestyle/detail shots, then generates three independent images. An optional reference image may guide composition, lighting, palette, and atmosphere only; do not copy its readable text, logos, people, or protected visual assets. Returns three pending artifacts and a job id; do not describe the images as ready in the same turn.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Short human-readable title for this product image set.",
          },
          sourceArtifactId: {
            type: "string",
            description: "Exact id of the product image artifact to preserve across all three outputs.",
          },
          referenceArtifactId: {
            type: "string",
            description:
              "Optional exact id of a second reference image. It supplies style direction only and must be different from sourceArtifactId.",
          },
          template: {
            type: "string",
            enum: ["product", "apparel"],
            description: "Use apparel for clothing or accessories; product for other physical goods.",
          },
          prompt: {
            type: "string",
            description: "Optional product, audience, scene, or visual constraints to apply to every output.",
          },
          size: {
            type: "string",
            enum: ["1024x1024", "1024x1536", "1536x1024"],
            description: "Shared output dimensions for all three images.",
          },
        },
        required: ["name", "sourceArtifactId", "template", "size"],
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
  {
    type: "function" as const,
    function: {
      name: "generate_sheet",
      description:
        "Create or patch an editable spreadsheet workbook in the artifact panel. A workbook may contain multiple worksheets and in-workbook formulas such as 汇总!B2=明细!E10. To create, pass sheets with a values grid (cells starting with = are formulas). To revise a workbook already in context, pass sourceArtifactId and operations only — never replace the whole book unless the user explicitly asks to start over. One call updates one workbook; call again with another sourceArtifactId to patch a second in-context workbook. Do not invent formulas that reference another workbook.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Short human-readable title for the workbook",
          },
          sourceArtifactId: {
            type: "string",
            description:
              "Existing sheet artifact id to patch. Omit to create a new workbook.",
          },
          sheets: {
            type: "array",
            description:
              "Initial worksheets when creating. Each item is a name plus an optional values rectangle.",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Worksheet tab name" },
                values: {
                  type: "array",
                  description: "Row-major grid. Strings starting with = are formulas.",
                  items: {
                    type: "array",
                    items: {
                      type: ["string", "number", "boolean", "null"],
                    },
                  },
                },
                formulas: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      cell: { type: "string", description: "A1 address" },
                      formula: { type: "string" },
                    },
                    required: ["cell", "formula"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["name"],
              additionalProperties: false,
            },
          },
          operations: {
            type: "array",
            description:
              "Patches applied in order. Required when sourceArtifactId is set.",
            items: {
              type: "object",
              properties: {
                op: {
                  type: "string",
                  enum: [
                    "setValues",
                    "setFormulas",
                    "clearRange",
                    "addSheet",
                    "renameSheet",
                    "deleteSheet",
                  ],
                },
                sheet: {
                  type: "string",
                  description: "Worksheet name or id. Defaults to the active sheet.",
                },
                start: { type: "string", description: "A1 start for setValues/setFormulas" },
                values: {
                  type: "array",
                  items: {
                    type: "array",
                    items: { type: ["string", "number", "boolean", "null"] },
                  },
                },
                formulas: {
                  type: "array",
                  items: { type: "array", items: { type: "string" } },
                },
                range: { type: "string", description: "A1 range for clearRange" },
                name: { type: "string", description: "Sheet name for addSheet/renameSheet" },
              },
              required: ["op"],
              additionalProperties: false,
            },
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remove_background",
      description:
        "Remove the background from one existing image artifact and return a ready PNG with transparency. Use auto by default; it uses general HD segmentation. Select product, person, garment, or hair only when the user explicitly identifies the subject or needs a specialist edge treatment. sourceArtifactId must be the exact image artifact id supplied in system context. Do not use generate_image as a substitute for background removal.",
      parameters: {
        type: "object",
        properties: {
          sourceArtifactId: {
            type: "string",
            description:
              "Exact id of the source PNG, JPG, or WebP image artifact to process.",
          },
          subject: {
            type: "string",
            enum: ["auto", "product", "person", "garment", "hair", "general_hd"],
            description:
              "Segmentation mode. Use auto by default; it maps to general HD segmentation. Use a specialist only when its subject is known.",
          },
        },
        required: ["sourceArtifactId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "upscale_image",
      description:
        "Improve the clarity of one existing image artifact. Use this for requests to make an image clearer, higher resolution, or more suitable for display. Returns a ready image artifact.",
      parameters: {
        type: "object",
        properties: {
          sourceArtifactId: {
            type: "string",
            description: "Exact id of the source PNG, JPG, or WebP image artifact to process.",
          },
          mode: {
            type: "string",
            enum: ["standard", "generative"],
            description: "standard is stable enhancement; generative may reconstruct more detail.",
          },
        },
        required: ["sourceArtifactId", "mode"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remove_watermark_or_subtitles",
      description:
        "Remove either a watermark or subtitles from one existing image artifact. Use only when the user explicitly confirms they have the necessary rights to alter the image. This is not a general object-removal tool. Returns a ready image artifact.",
      parameters: {
        type: "object",
        properties: {
          sourceArtifactId: {
            type: "string",
            description: "Exact id of the source PNG, JPG, or WebP image artifact to process.",
          },
          target: {
            type: "string",
            enum: ["watermark", "subtitles"],
            description: "The visual content to remove.",
          },
          rightsConfirmed: {
            type: "boolean",
            enum: [true],
            description: "Must be true only after the user explicitly confirms they have the necessary rights.",
          },
        },
        required: ["sourceArtifactId", "target", "rightsConfirmed"],
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
  "fuse_images",
  "generate_ecommerce_image_set",
  "remove_background",
  "upscale_image",
  "remove_watermark_or_subtitles",
  "generate_canvas",
  "generate_sheet",
] as const;
