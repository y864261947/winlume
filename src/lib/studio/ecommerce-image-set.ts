/**
 * Server-owned plan for the first e-commerce image-set pipeline. The plan is
 * deliberately provider-neutral so a controllable diffusion provider can be
 * added later without changing the ToolJob contract.
 */

export const ECOMMERCE_IMAGE_SET_PIPELINE_VERSION = "ecommerce-image-set@v1" as const;

export const ECOMMERCE_IMAGE_SET_TEMPLATES = ["product", "apparel"] as const;
export type EcommerceImageSetTemplate = (typeof ECOMMERCE_IMAGE_SET_TEMPLATES)[number];

export const ECOMMERCE_IMAGE_SET_SIZES = [
  "1024x1024",
  "1024x1536",
  "1536x1024",
] as const;
export type EcommerceImageSetSize = (typeof ECOMMERCE_IMAGE_SET_SIZES)[number];

export type EcommerceImageSetShot = {
  id: "hero" | "lifestyle" | "detail";
  name: string;
  direction: string;
  prompt: string;
};

export type EcommerceImageSetPlan = {
  version: typeof ECOMMERCE_IMAGE_SET_PIPELINE_VERSION;
  template: EcommerceImageSetTemplate;
  size: EcommerceImageSetSize;
  explicitConstraints: string;
  referenceMode: "none" | "style_only";
  identityRules: string[];
  shots: EcommerceImageSetShot[];
};

const SHOT_DIRECTIONS: Record<
  EcommerceImageSetTemplate,
  readonly Omit<EcommerceImageSetShot, "prompt">[]
> = {
  product: [
    {
      id: "hero",
      name: "主图",
      direction:
        "Create a clean marketplace hero image. Center the product on a seamless white background with accurate silhouette, materials, colors, packaging, and brand details.",
    },
    {
      id: "lifestyle",
      name: "场景图",
      direction:
        "Create a premium lifestyle product photograph in a believable use context that supports the product category. Keep the product as the visual focus and preserve all product details exactly.",
    },
    {
      id: "detail",
      name: "细节图",
      direction:
        "Create a high-fidelity detail photograph that clearly shows the most relevant material, texture, finish, or functional component of the product without inventing features.",
    },
  ],
  apparel: [
    {
      id: "hero",
      name: "主图",
      direction:
        "Create a clean apparel marketplace hero image on a seamless white background. Show the garment or accessory clearly, preserve its cut, fabric, color, print, trim, and brand details exactly.",
    },
    {
      id: "lifestyle",
      name: "场景图",
      direction:
        "Create an editorial lifestyle photograph showing the garment or accessory naturally in use. Keep its design, fit, fabric, color, print, trim, and brand details faithful to the source.",
    },
    {
      id: "detail",
      name: "细节图",
      direction:
        "Create a close product detail photograph focused on fabric, weave, hardware, stitching, or trim that exists in the source. Do not invent a new pattern, logo, or component.",
    },
  ],
};

function shotPrompt(
  shot: Omit<EcommerceImageSetShot, "prompt">,
  constraints: string,
  referenceMode: EcommerceImageSetPlan["referenceMode"],
): string {
  return [
    "Create one standalone e-commerce product image from the supplied source product image.",
    "Treat the source product as authoritative: preserve its shape, proportions, materials, colors, packaging, labels, and visible brand details.",
    "Do not create a collage, contact sheet, split panel, watermark, or newly invented readable text.",
    referenceMode === "style_only"
      ? "A second reference image is supplied only for composition, lighting, palette, and atmosphere. Do not copy its readable text, logo, people, or other protected visual assets."
      : "",
    shot.direction,
    constraints ? `Additional product and visual constraints: ${constraints}` : "",
  ].filter(Boolean).join("\n\n");
}
export function buildEcommerceImageSetPlan(input: {
  template: EcommerceImageSetTemplate;
  size: EcommerceImageSetSize;
  prompt?: string;
  hasReferenceImage?: boolean;
}): EcommerceImageSetPlan {
  const explicitConstraints = input.prompt?.trim() ?? "";
  const referenceMode: EcommerceImageSetPlan["referenceMode"] = input.hasReferenceImage
    ? "style_only"
    : "none";
  const identityRules = [
    "Preserve product silhouette, proportions, materials, colours, packaging, labels, and visible brand details.",
    "Do not invent product features, patterns, readable text, or logos.",
  ];

  return {
    version: ECOMMERCE_IMAGE_SET_PIPELINE_VERSION,
    template: input.template,
    size: input.size,
    explicitConstraints,
    referenceMode,
    identityRules,
    shots: SHOT_DIRECTIONS[input.template].map((shot) => ({
      ...shot,
      prompt: shotPrompt(shot, explicitConstraints, referenceMode),
    })),
  };
}
