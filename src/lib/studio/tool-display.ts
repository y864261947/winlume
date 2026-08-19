/**
 * Human-friendly tool labels for chat UI (hide raw tool ids / technical summaries).
 */

export type FriendlyToolView = {
  /** Short verb phrase for group headers / live status */
  actionLabel: string;
  /** One-line result for expanded row */
  resultLine?: string;
  /** Optional artifact id for "打开作品" */
  artifactId?: string;
  kindLabel?: string;
};

const TOOL_ACTION: Record<string, string> = {
  todo_write: "更新进度",
  declare_plan: "更新进度",
  write_artifact: "保存作品",
  read_artifact: "读取作品",
  list_artifacts: "查看作品列表",
  generate_sheet: "更新表格",
};

const KIND_LABEL: Record<string, string> = {
  markdown: "Markdown",
  html: "网页",
  text: "文本",
  json: "JSON",
  image: "图片",
  binary: "文件",
  canvas: "画布",
  sheet: "表格",
};

export function toolActionLabel(name: string): string {
  return TOOL_ACTION[name] ?? "处理中";
}

export function formatCharCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1000) return `${n} 字`;
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")} 千字`;
  return `${Math.round(n / 1000)} 千字`;
}

/**
 * Parse server tool_result summaries into user-facing copy.
 * write_artifact: `Saved artifact "name" (id=…, kind=markdown, 1675 chars)`
 */
export function friendlyToolView(
  name: string,
  opts?: {
    status?: "running" | "done";
    ok?: boolean;
    summary?: string;
    input?: unknown;
  },
): FriendlyToolView {
  const status = opts?.status ?? "done";
  const ok = opts?.ok;
  const summary = opts?.summary?.trim() ?? "";

  if (name === "todo_write" || name === "declare_plan") {
    if (status === "running") return { actionLabel: "正在更新进度" };
    if (ok === false) {
      return {
        actionLabel: "更新进度失败",
        resultLine: stripTechnicalNoise(summary) || "进度未能更新",
      };
    }
    // summary like: 进度更新 · 进行中：写三篇笔记
    return {
      actionLabel: summary.startsWith("进度完成")
        ? "进度已完成"
        : summary.includes("进行中")
          ? "进度已更新"
          : "已更新进度",
      resultLine: stripTechnicalNoise(summary) || undefined,
    };
  }

  if (name === "write_artifact") {
    if (status === "running") {
      const fromInput =
        opts?.input &&
        typeof opts.input === "object" &&
        opts.input !== null &&
        "name" in opts.input &&
        typeof (opts.input as { name?: unknown }).name === "string"
          ? String((opts.input as { name: string }).name).trim()
          : "";
      return {
        actionLabel: fromInput ? `正在保存「${fromInput}」` : "正在保存作品",
      };
    }
    if (ok === false) {
      return {
        actionLabel: "保存作品失败",
        resultLine: stripTechnicalNoise(summary) || "保存失败，请稍后重试",
      };
    }
    const m = summary.match(
      /Saved artifact "([^"]+)"\s*\(id=([^,)\s]+),\s*kind=(\w+),\s*(\d+)\s*chars?\)/i,
    );
    if (m) {
      const title = m[1];
      const artifactId = m[2];
      const kind = m[3];
      const chars = Number(m[4]);
      const kindLabel = KIND_LABEL[kind] ?? kind;
      const size = formatCharCount(chars);
      return {
        actionLabel: `已保存「${title}」`,
        resultLine: [kindLabel, size].filter(Boolean).join(" · "),
        artifactId,
        kindLabel,
      };
    }
    // Fallback: pull quoted name if present
    const q = summary.match(/"([^"]{1,120})"/);
    return {
      actionLabel: q ? `已保存「${q[1]}」` : "已保存作品",
      resultLine: stripTechnicalNoise(summary),
    };
  }

  if (name === "read_artifact") {
    if (status === "running") return { actionLabel: "正在读取作品" };
    if (ok === false) {
      return {
        actionLabel: "读取作品失败",
        resultLine: stripTechnicalNoise(summary),
      };
    }
    const m = summary.match(/Read artifact "([^"]+)"/i);
    return {
      actionLabel: m ? `已读取「${m[1]}」` : "已读取作品",
      resultLine: undefined,
    };
  }

  if (name === "generate_sheet") {
    if (status === "running") {
      const fromInput =
        opts?.input &&
        typeof opts.input === "object" &&
        opts.input !== null &&
        "name" in opts.input &&
        typeof (opts.input as { name?: unknown }).name === "string"
          ? String((opts.input as { name: string }).name).trim()
          : "";
      return {
        actionLabel: fromInput ? `正在更新「${fromInput}」` : "正在更新表格",
      };
    }
    if (ok === false) {
      return {
        actionLabel: "更新表格失败",
        resultLine: stripTechnicalNoise(summary) || "表格未能保存",
      };
    }
    const created = summary.match(/Created sheet "([^"]+)"/i);
    const updated = summary.match(/Updated sheet "([^"]+)"/i);
    const title = created?.[1] ?? updated?.[1];
    const id = summary.match(/id=([^,)\s]+)/i)?.[1];
    return {
      actionLabel: title
        ? created
          ? `已创建表格「${title}」`
          : `已更新表格「${title}」`
        : created
          ? "已创建表格"
          : "已更新表格",
      artifactId: id,
      kindLabel: "表格",
    };
  }

  if (name === "list_artifacts") {
    if (status === "running") return { actionLabel: "正在查看作品列表" };
    if (ok === false) {
      return {
        actionLabel: "查看列表失败",
        resultLine: stripTechnicalNoise(summary),
      };
    }
    const m = summary.match(/Found (\d+)/i);
    const empty = /No artifacts/i.test(summary);
    return {
      actionLabel: empty
        ? "暂无作品"
        : m
          ? `已列出 ${m[1]} 个作品`
          : "已查看作品列表",
    };
  }

  // Unknown tools — never dump raw ids/json if we can avoid it
  if (status === "running") {
    return { actionLabel: `正在执行 ${toolActionLabel(name)}` };
  }
  if (ok === false) {
    return {
      actionLabel: `${toolActionLabel(name)}失败`,
      resultLine: stripTechnicalNoise(summary),
    };
  }
  return {
    actionLabel: toolActionLabel(name),
    resultLine: stripTechnicalNoise(summary),
  };
}

/** Group header summary from a list of tools */
export function friendlyToolGroupSummary(
  tools: Array<{ name: string; status: "running" | "done"; ok?: boolean; resultSummary?: string; input?: unknown }>,
): string {
  const labels = tools.map((t) =>
    friendlyToolView(t.name, {
      status: t.status,
      ok: t.ok,
      summary: t.resultSummary,
      input: t.input,
    }).actionLabel,
  );
  const unique = [...new Set(labels)];
  if (unique.length === 0) return "";
  if (unique.length <= 2) return unique.join(" · ");
  return `${unique.slice(0, 2).join(" · ")} 等 ${tools.length} 项`;
}

function stripTechnicalNoise(text: string): string {
  if (!text) return "";
  return text
    .replace(/\bid=[a-f0-9-]{8,}\b/gi, "")
    .replace(/\bkind=\w+\b/gi, "")
    .replace(/\b\d+\s*chars?\b/gi, "")
    .replace(/[()]/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,;.\s]+|[,;.\s]+$/g, "")
    .trim();
}
