import icons from "./skillhub-icons.json";

const ICON_BY_ID = icons as Record<string, string>;

export function skillhubIconUrl(id: string): string | undefined {
  const url = ICON_BY_ID[id];
  return url || undefined;
}
