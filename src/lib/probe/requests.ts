import type { ProbeCaseId } from "./cases";
import { buildVideoBody } from "./video";


/**
 * Request payload builders for each probe case.
 *
 * Kept pure and separate from transport so the exact bytes sent upstream are
 * unit-testable. Prompts are deliberately tiny: the probe pays real money on
 * every call, and a capability question rarely needs a long prompt.
 */

/** 1x1 transparent PNG — smallest valid image input for a vision probe. */
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export type BuiltRequest = {
  path: string;
  body: Record<string, unknown>;
  /** Whether the response is expected to be an SSE stream. */
  stream: boolean;
};

/**
 * ~32K tokens of filler. Uses a repeated token-dense string rather than
 * natural prose so the input size is predictable across tokenizers.
 */
function longContextFiller(): string {
  return "The quick brown fox jumps over the lazy dog. ".repeat(3000);
}

export function buildTextRequest(caseId: ProbeCaseId, model: string): BuiltRequest {
  const base = { model, max_tokens: 64 };

  switch (caseId) {
    case "basic_text":
      return {
        path: "/v1/chat/completions",
        stream: false,
        body: { ...base, messages: [{ role: "user", content: "Reply with exactly: OK" }] },
      };

    case "streaming":
      return {
        path: "/v1/chat/completions",
        stream: true,
        body: {
          ...base,
          stream: true,
          messages: [{ role: "user", content: "Count from 1 to 10, separated by spaces." }],
        },
      };

    case "tool_call":
      return {
        path: "/v1/chat/completions",
        stream: false,
        body: {
          ...base,
          messages: [{ role: "user", content: "What is the weather in Tokyo? Use the tool." }],
          tool_choice: "auto",
          tools: [
            {
              type: "function",
              function: {
                name: "get_weather",
                description: "Get current weather for a city",
                parameters: {
                  type: "object",
                  properties: { city: { type: "string", description: "City name" } },
                  required: ["city"],
                },
              },
            },
          ],
        },
      };

    case "json_mode":
      return {
        path: "/v1/chat/completions",
        stream: false,
        body: {
          ...base,
          response_format: { type: "json_object" },
          messages: [
            { role: "user", content: 'Return a JSON object with a single key "status" set to "ok".' },
          ],
        },
      };

    case "vision":
      return {
        path: "/v1/chat/completions",
        stream: false,
        body: {
          ...base,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Describe this image in one short sentence." },
                { type: "image_url", image_url: { url: TINY_PNG } },
              ],
            },
          ],
        },
      };

    case "reasoning":
      return {
        path: "/v1/chat/completions",
        stream: false,
        body: {
          ...base,
          max_tokens: 512,
          reasoning_effort: "low",
          messages: [
            {
              role: "user",
              content: "If 3 machines make 3 widgets in 3 minutes, how long for 100 machines to make 100 widgets?",
            },
          ],
        },
      };

    case "long_context":
      return {
        path: "/v1/chat/completions",
        stream: false,
        body: {
          ...base,
          messages: [
            { role: "user", content: `${longContextFiller()}\n\nHow many times did the word "fox" appear? Answer with a number only.` },
          ],
        },
      };

    default:
      throw new Error(`buildTextRequest does not handle case "${caseId}"`);
  }
}

export function buildImageRequest(caseId: ProbeCaseId, model: string): BuiltRequest {
  if (caseId === "image_generate") {
    return {
      path: "/v1/images/generations",
      stream: false,
      body: { model, prompt: "A single red circle on a white background", n: 1, size: "1024x1024" },
    };
  }
  throw new Error(`buildImageRequest does not handle case "${caseId}"`);
}

/**
 * Video generation request.
 *
 * Delegates to the family-aware builder: the three upstreams in use all accept
 * `POST /v1/videos`, but their bodies are NOT interchangeable. See
 * src/lib/probe/video.ts for the per-family field map.
 */
export function buildVideoRequest(model: string, seconds: number): BuiltRequest {
  return {
    path: "/v1/videos",
    stream: false,
    body: buildVideoBody({ model, prompt: "A calm ocean wave at sunset", seconds }),
  };
}
