/**
 * Extract a JSON string field value from a *partial* JSON object stream
 * (e.g. OpenAI tool-call argument deltas for write_artifact).
 * Returns whatever has been received so far inside the quotes; null if field not started.
 */

export function extractPartialJsonStringField(
  partialJson: string,
  field: string,
): string | null {
  if (!partialJson || !field) return null;
  const key = `"${field}"`;
  const keyIdx = partialJson.indexOf(key);
  if (keyIdx < 0) return null;

  let i = keyIdx + key.length;
  // skip whitespace and colon
  while (i < partialJson.length && /\s/.test(partialJson[i]!)) i += 1;
  if (partialJson[i] !== ":") return null;
  i += 1;
  while (i < partialJson.length && /\s/.test(partialJson[i]!)) i += 1;
  if (partialJson[i] !== '"') {
    // field present but value not a string yet (or incomplete)
    return null;
  }
  i += 1;

  let out = "";
  while (i < partialJson.length) {
    const c = partialJson[i]!;
    if (c === "\\") {
      if (i + 1 >= partialJson.length) break; // incomplete escape — stop
      const n = partialJson[i + 1]!;
      if (n === "u") {
        if (i + 5 >= partialJson.length) break;
        const hex = partialJson.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) break;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
      const map: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        b: "\b",
        f: "\f",
        '"': '"',
        "\\": "\\",
        "/": "/",
      };
      out += map[n] ?? n;
      i += 2;
      continue;
    }
    if (c === '"') break; // closed string
    out += c;
    i += 1;
  }
  return out;
}
