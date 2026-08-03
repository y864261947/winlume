/**
 * Shared upload policy for the reference-video MVP. Keep this dependency-free
 * so the browser composer and the Node route handler enforce the same limits.
 */

export const MAX_REFERENCE_VIDEO_BYTES = 50 * 1024 * 1024;

export const REFERENCE_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

const VIDEO_EXTENSIONS = /\.(mp4|mov|webm)$/i;

export const REFERENCE_VIDEO_ACCEPT =
  "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm";

export function isSupportedReferenceVideoMime(value: string): boolean {
  return (REFERENCE_VIDEO_MIME_TYPES as readonly string[]).includes(
    value.trim().toLowerCase(),
  );
}

export function isReferenceVideoFile(file: Pick<File, "name" | "type">): boolean {
  return isSupportedReferenceVideoMime(file.type) || VIDEO_EXTENSIONS.test(file.name);
}

export function referenceVideoMimeType(
  file: Pick<File, "name" | "type">,
): (typeof REFERENCE_VIDEO_MIME_TYPES)[number] {
  if (isSupportedReferenceVideoMime(file.type)) {
    return file.type.trim().toLowerCase() as (typeof REFERENCE_VIDEO_MIME_TYPES)[number];
  }
  if (/\.mov$/i.test(file.name)) return "video/quicktime";
  if (/\.webm$/i.test(file.name)) return "video/webm";
  return "video/mp4";
}
