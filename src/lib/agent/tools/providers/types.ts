export type ToolCapabilityId = "image.background_removal";

export type ToolAsset = {
  bytes: Buffer;
  mimeType: string;
};

export type ToolInvocationInput = {
  images: ToolAsset[];
  params?: Record<string, string | number | boolean>;
};

export type ToolInvocationResult =
  | { status: "completed"; outputs: ToolAsset[] }
  | { status: "processing"; providerJobId: string; pollAfterMs: number };

export interface ToolProvider {
  readonly id: string;
  readonly capabilities: readonly ToolCapabilityId[];
  invoke(
    capability: ToolCapabilityId,
    input: ToolInvocationInput,
  ): Promise<ToolInvocationResult>;
  pollJob?(
    capability: ToolCapabilityId,
    providerJobId: string,
  ): Promise<ToolInvocationResult>;
}

export type ToolProviderErrorKind =
  | "configuration"
  | "unavailable"
  | "invalid_result";

/** Safe-to-display provider failure. Provider URLs and SDK details stay internal. */
export class ToolProviderError extends Error {
  constructor(
    readonly kind: ToolProviderErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ToolProviderError";
  }
}
