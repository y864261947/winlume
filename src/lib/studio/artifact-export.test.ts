import { describe, expect, it } from "vitest";
import {
  canExportAsDocument,
  contentToBodyHtml,
  markdownToSimpleHtml,
} from "./artifact-export";

describe("markdownToSimpleHtml", () => {
  it("renders headings and paragraphs", () => {
    const html = markdownToSimpleHtml("# Title\n\nHello **world**");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>world</strong>");
  });

  it("renders lists and code fences", () => {
    const html = markdownToSimpleHtml("- a\n- b\n\n```\ncode\n```");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<pre><code>code</code></pre>");
  });
});

describe("contentToBodyHtml", () => {
  it("pretty-prints json", () => {
    const html = contentToBodyHtml("json", '{"a":1}');
    expect(html).toContain("&quot;a&quot;: 1");
  });

  it("extracts body from full html document", () => {
    const html = contentToBodyHtml(
      "html",
      "<html><body><p>Hi</p></body></html>",
    );
    expect(html).toContain("<p>Hi</p>");
    expect(html).not.toContain("<html>");
  });
});

describe("canExportAsDocument", () => {
  it("allows text-like kinds only", () => {
    expect(canExportAsDocument("markdown")).toBe(true);
    expect(canExportAsDocument("html")).toBe(true);
    expect(canExportAsDocument("binary")).toBe(false);
    expect(canExportAsDocument("image")).toBe(false);
  });
});
