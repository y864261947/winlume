import type { CSSProperties } from "react";

const HAN_NUMERALS = new Set("一二三四五六七八九十");

/** First distinctive CJK character, else first Latin/digit — unique tile mark without per-skill art. */
export function skillMonogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "技";
  const hans = [...trimmed.matchAll(/\p{Script=Han}/gu)].map((match) => match[0]);
  const han = hans.find((ch) => !HAN_NUMERALS.has(ch)) ?? hans[0];
  if (han) return han;
  const latin = trimmed.match(/[A-Za-z0-9]/);
  if (latin) return latin[0].toUpperCase();
  return Array.from(trimmed)[0] ?? "技";
}

export function catalogAccentStyle(accent: string): CSSProperties {
  return { "--studio-cat-accent": accent } as CSSProperties;
}
