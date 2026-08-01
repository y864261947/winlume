import type { ProtocolFamily, ProtocolRouteDefinition } from "./types";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function route(
  id: string,
  family: ProtocolFamily,
  description: string,
  pattern: RegExp,
): ProtocolRouteDefinition {
  return { id, family, description, methods: METHODS, matches: (pathname) => pattern.test(pathname) };
}

/**
 * Public protocol families exposed by NewAPI-compatible clients. Keep this
 * catalog explicit so a missing adapter returns 501 instead of an accidental
 * unauthenticated or opaque 404.
 */
export const PUBLIC_ROUTE_CATALOG: readonly ProtocolRouteDefinition[] = [
  route("openai-images", "images", "OpenAI-compatible image generation and editing", /^\/v1\/images(?:\/.*)?$/),
  route("openai-audio", "audio", "OpenAI-compatible audio speech, transcription, and translation", /^\/v1\/audio(?:\/.*)?$/),
  route("openai-embeddings", "embeddings", "OpenAI-compatible embeddings", /^\/v1\/embeddings(?:\/.*)?$/),
  route("openai-realtime", "realtime", "OpenAI-compatible realtime HTTP handshake", /^\/v1\/realtime(?:\/.*)?$/),
  route("claude-messages", "claude", "Anthropic Claude messages protocol", /^(?:\/v1\/messages|\/anthropic\/v1\/messages)(?:\/.*)?$/),
  route("gemini-models", "gemini", "Google Gemini generate-content protocol", /^(?:\/v1beta|\/gemini\/v1beta)\/models(?:\/.*)?$/),
  route("midjourney", "midjourney", "Midjourney task protocol", /^\/(?:mj|midjourney)(?:\/.*)?$/),
  route("suno", "suno", "Suno task protocol", /^\/suno(?:\/.*)?$/),
  route("video", "video", "Video generation and task protocol", /^\/(?:video|videos|v1\/video|v1\/videos)(?:\/.*)?$/),
  route("tasks", "task", "Asynchronous task and job protocol", /^\/(?:api\/(?:task|tasks|async|queue)|v1\/(?:tasks|jobs))(?:\/.*)?$/),
  route("openai", "openai", "OpenAI-compatible core API", /^\/v1(?:\/.*)?$/),
];

export function matchPublicRoute(pathname: string, method = "GET"): ProtocolRouteDefinition | undefined {
  const normalizedMethod = method.toUpperCase();
  return PUBLIC_ROUTE_CATALOG.find(
    (entry) => entry.methods.includes(normalizedMethod) && entry.matches(pathname),
  );
}

export function catalogForFamily(family: ProtocolFamily): ProtocolRouteDefinition[] {
  return PUBLIC_ROUTE_CATALOG.filter((entry) => entry.family === family);
}
