/**
 * Client-side artifact export helpers (NewMax export:* without Electron).
 * - PDF: print dialog (user chooses “Save as PDF”)
 * - Word: HTML Word-compatible .doc (opens in Microsoft Word / WPS)
 */

import type { ArtifactKind } from "@/lib/agent/types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Very light markdown → HTML for export (no full CommonMark). */
export function markdownToSimpleHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      out.push(listType === "ul" ? "</ul>" : "</ol>");
      listType = null;
    }
  };

  const inline = (text: string) => {
    let t = escapeHtml(text);
    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    t = t.replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2">$1</a>',
    );
    return t;
  };

  for (const raw of lines) {
    if (raw.startsWith("```")) {
      if (inCode) {
        out.push(
          `<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`,
        );
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(raw);
      continue;
    }

    if (!raw.trim()) {
      closeList();
      continue;
    }

    const h = raw.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }

    const ul = raw.match(/^[-*]\s+(.+)$/);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        out.push("<ul>");
      }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }

    const ol = raw.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        out.push("<ol>");
      }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    closeList();
    if (raw.startsWith("> ")) {
      out.push(`<blockquote>${inline(raw.slice(2))}</blockquote>`);
      continue;
    }
    out.push(`<p>${inline(raw)}</p>`);
  }
  if (inCode) {
    out.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
  }
  closeList();
  return out.join("\n");
}

export function contentToBodyHtml(
  kind: ArtifactKind,
  content: string,
): string {
  switch (kind) {
    case "html":
      // Prefer body fragment if full document
      {
        const m = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        return m ? m[1] : content;
      }
    case "markdown":
      return markdownToSimpleHtml(content);
    case "json":
      try {
        const pretty = JSON.stringify(JSON.parse(content), null, 2);
        return `<pre>${escapeHtml(pretty)}</pre>`;
      } catch {
        return `<pre>${escapeHtml(content)}</pre>`;
      }
    default:
      return `<pre>${escapeHtml(content)}</pre>`;
  }
}

const PRINT_CSS = `
  body { font-family: "Segoe UI", system-ui, -apple-system, sans-serif; line-height: 1.65; color: #1a1a1a; max-width: 800px; margin: 2rem auto; padding: 0 1.25rem; font-size: 14px; }
  h1 { font-size: 1.6rem; margin: 1.2em 0 0.5em; }
  h2 { font-size: 1.3rem; margin: 1.1em 0 0.45em; }
  h3 { font-size: 1.1rem; margin: 1em 0 0.4em; }
  p, li { margin: 0.4em 0; }
  pre { background: #f6f4f0; padding: 12px 14px; border-radius: 8px; overflow-x: auto; font-size: 12px; white-space: pre-wrap; word-break: break-word; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; }
  blockquote { border-left: 3px solid #c2410c; margin: 0.8em 0; padding: 0.2em 0 0.2em 1em; color: #555; }
  table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  a { color: #c2410c; }
  @media print { body { margin: 0; max-width: none; } }
`;

function wrapDocument(title: string, bodyHtml: string, extraHead = ""): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${PRINT_CSS}</style>
${extraHead}
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/** Open print dialog so the user can Save as PDF (NewMax htmlToPDF equivalent on web). */
export function exportArtifactAsPdf(opts: {
  title: string;
  kind: ArtifactKind;
  content: string;
}): void {
  const body = contentToBodyHtml(opts.kind, opts.content);
  const html = wrapDocument(opts.title, body);
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) {
    throw new Error("浏览器拦截了弹窗，请允许后重试导出 PDF");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  const trigger = () => {
    try {
      w.focus();
      w.print();
    } catch {
      /* ignore */
    }
  };
  if (w.document.readyState === "complete") {
    setTimeout(trigger, 200);
  } else {
    w.addEventListener("load", () => setTimeout(trigger, 200));
    setTimeout(trigger, 400);
  }
}

/**
 * Word-compatible HTML document saved as .doc
 * (opens in Word/WPS; not OOXML .docx — no native binary deps).
 */
export function exportArtifactAsWord(opts: {
  title: string;
  kind: ArtifactKind;
  content: string;
  filenameBase: string;
}): void {
  const body = contentToBodyHtml(opts.kind, opts.content);
  const wordMeta = `
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<!--[if gte mso 9]><xml>
 <w:WordDocument>
  <w:View>Print</w:View>
  <w:Zoom>100</w:Zoom>
 </w:WordDocument>
</xml><![endif]-->
`;
  const html = wrapDocument(opts.title, body, wordMeta);
  const base = opts.filenameBase.replace(/\.[^.]+$/, "") || "artifact";
  const blob = new Blob(["\ufeff", html], {
    type: "application/msword;charset=utf-8",
  });
  downloadBlob(`${base}.doc`, blob);
}

export function canExportAsDocument(kind: ArtifactKind): boolean {
  return (
    kind === "markdown" ||
    kind === "html" ||
    kind === "text" ||
    kind === "json"
  );
}
