import Image from "next/image";

/** Illustrative starter covers; never used as a user's artifact. */
export default function LibraryArtwork({ kind }: { kind: string }) {
  if (kind === "commerce" || kind === "video") return <div className={`review-tool-art review-art-${kind}`} aria-hidden="true"><Image src={`/reizo/assets/campaign-${kind === "commerce" ? "studio" : "lifestyle"}-v1.png`} alt="" fill sizes="360px" unoptimized /><span>{kind === "commerce" ? "产品视觉 · 示例" : "短视频分镜 · 示例"}</span></div>;
  const labels: Record<string, [string, string, string[]]> = {
    finance: ["经营月报", "从数据，到下一步行动", ["核对收入与成本口径", "分析指标变化", "汇总待核实问题"]],
    legal: ["合同审阅", "合作协议 · 复核清单", ["付款条件与时间", "交付范围与验收", "违约、解除与保密"]],
    code: ["接口排查", "timeout.test.ts", ["复现超时 → 定位调用", "校验错误 → 验证重试", "expect(result).toBeDefined()"]],
    research: ["研究摘要", "观点与证据，清楚归类", ["研究问题与材料范围", "主要结论与来源", "分歧与待验证假设"]],
  };
  const [label, title, lines] = labels[kind] ?? labels.research;
  return <div className={`review-tool-art review-art-${kind}`} aria-hidden="true"><div className="review-cover-document"><small>{label} / 示例</small><strong>{title}</strong>{lines.map(line => <p key={line}>{line}</p>)}</div></div>;
}
