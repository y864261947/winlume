import type { DefaultArtifactKind, Skill, SkillMeta } from "@/lib/agent/types";

export type FrontmatterValue = string | boolean | number | string[] | null;

export interface ParsedFrontmatter {
  raw: Record<string, FrontmatterValue>;
  body: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/i;

/**
 * Split markdown into YAML frontmatter (between --- fences) and body.
 * Tolerant of missing closing fence (treats rest as body) and no frontmatter.
 */
export function splitFrontmatter(markdown: string): ParsedFrontmatter {
  const text = markdown.replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) {
    return { raw: {}, body: text };
  }

  const afterOpen = text.slice(3);
  // Allow optional newline right after opening ---
  const rest = afterOpen.replace(/^\r?\n/, "");
  const closeMatch = rest.match(/\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!closeMatch || closeMatch.index === undefined) {
    // Malformed: no closing fence — treat whole file as body
    return { raw: {}, body: text };
  }

  const yamlBlock = rest.slice(0, closeMatch.index);
  const body = rest.slice(closeMatch.index + closeMatch[0].length);
  return { raw: parseSimpleYaml(yamlBlock), body };
}

/**
 * Minimal YAML subset for skill frontmatter:
 * - key: value (string, number, boolean, null)
 * - key: | / > multi-line scalars (joined)
 * - key:\n  - item lists
 * - quoted strings
 * Ignores comments and blank lines.
 */
export function parseSimpleYaml(yaml: string): Record<string, FrontmatterValue> {
  const out: Record<string, FrontmatterValue> = {};
  const lines = yaml.replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    i += 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;

    const key = kv[1];
    const valuePart = kv[2].trim();

    if (valuePart === "|" || valuePart === ">") {
      const chunks: string[] = [];
      while (i < lines.length) {
        const next = lines[i];
        if (next.trim() === "") {
          chunks.push("");
          i += 1;
          continue;
        }
        if (/^\s+/.test(next) && !/^[A-Za-z_][\w-]*\s*:/.test(next.trim())) {
          chunks.push(next.replace(/^\s+/, ""));
          i += 1;
          continue;
        }
        break;
      }
      out[key] = chunks.join(valuePart === "|" ? "\n" : " ").trim();
      continue;
    }

    if (valuePart === "" || valuePart === "[]") {
      // Possibly a list on following indented "- " lines
      const items: string[] = [];
      let sawList = false;
      while (i < lines.length) {
        const next = lines[i];
        const listItem = next.match(/^\s+-\s+(.*)$/);
        if (listItem) {
          sawList = true;
          items.push(unquote(listItem[1].trim()));
          i += 1;
          continue;
        }
        if (next.trim() === "") {
          i += 1;
          continue;
        }
        break;
      }
      out[key] = sawList ? items : valuePart === "[]" ? [] : null;
      continue;
    }

    if (valuePart.startsWith("[") && valuePart.endsWith("]")) {
      const inner = valuePart.slice(1, -1).trim();
      if (!inner) {
        out[key] = [];
      } else {
        out[key] = inner.split(",").map((s) => unquote(s.trim()));
      }
      continue;
    }

    out[key] = parseScalar(valuePart);
  }

  return out;
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseScalar(value: string): FrontmatterValue {
  const unquoted = unquote(value);
  if (value === "true" || value === "yes") return true;
  if (value === "false" || value === "no") return false;
  if (value === "null" || value === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return unquoted;
}

function asString(value: FrontmatterValue | undefined, fallback = ""): string {
  if (value === undefined || value === null) return fallback;
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function asStringArray(value: FrontmatterValue | undefined): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const s = String(value).trim();
  if (!s) return undefined;
  return s.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
}

function asBool(value: FrontmatterValue | undefined, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null) return fallback;
  const s = String(value).toLowerCase();
  if (s === "true" || s === "yes" || s === "1") return true;
  if (s === "false" || s === "no" || s === "0") return false;
  return fallback;
}

function asPreview(value: FrontmatterValue | undefined): SkillMeta["preview"] {
  const s = asString(value).toLowerCase();
  if (s === "markdown" || s === "html" || s === "none") return s;
  return undefined;
}

function asDefaultArtifact(
  value: FrontmatterValue | undefined,
): DefaultArtifactKind | undefined {
  const s = asString(value).toLowerCase();
  if (
    s === "markdown" ||
    s === "html" ||
    s === "image-prompt" ||
    s === "none"
  ) {
    return s;
  }
  return undefined;
}

function asSource(value: FrontmatterValue | undefined): SkillMeta["source"] {
  const s = asString(value).toLowerCase();
  if (s === "bundled" || s === "imported" || s === "user") return s;
  return "bundled";
}

export interface ParseSkillOptions {
  /** Used when frontmatter has no usable name/id (e.g. directory name). */
  fallbackId?: string;
}

/**
 * Parse skill markdown (YAML frontmatter + body) into a Skill.
 * `id` = frontmatter `id` | slug-like `name` | fallbackId | filename-style slug of name.
 */
export function parseSkillMarkdown(markdown: string, opts: ParseSkillOptions = {}): Skill {
  const { raw, body } = splitFrontmatter(markdown);
  const nameField = asString(raw.name).trim();
  const explicitId = asString(raw.id).trim();

  let id: string;
  if (explicitId) {
    id = explicitId;
  } else if (nameField && SLUG_RE.test(nameField)) {
    id = nameField;
  } else if (opts.fallbackId) {
    id = opts.fallbackId;
  } else if (nameField) {
    id = slugify(nameField);
  } else {
    id = "unnamed-skill";
  }

  const title = asString(raw.title).trim();
  const displayName = title || nameField || id;

  const description = asString(raw.description).trim();
  const category = asString(raw.category, "general").trim() || "general";
  const triggers = asStringArray(raw.triggers);
  const examplePrompt =
    asString(raw.example_prompt || raw.examplePrompt).trim() || undefined;
  const preview = asPreview(raw.preview);
  const source = asSource(raw.source);
  const enabled = asBool(raw.enabled, true);
  const featured = raw.featured !== undefined ? asBool(raw.featured, false) : undefined;
  const defaultArtifact = asDefaultArtifact(
    raw.defaultArtifact ?? raw.default_artifact,
  );

  return {
    id,
    name: displayName,
    description,
    category,
    triggers,
    examplePrompt,
    preview,
    source,
    enabled,
    featured,
    defaultArtifact,
    systemPrompt: body.replace(/^\uFEFF/, "").trim(),
  };
}

/** Stable URL/filename-safe slug from arbitrary text. */
export function slugify(input: string): string {
  const ascii = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return ascii || "skill";
}

/** Drop systemPrompt for list endpoints. */
export function toSkillMeta(skill: Skill): SkillMeta {
  const { systemPrompt: _body, ...meta } = skill;
  return meta;
}
