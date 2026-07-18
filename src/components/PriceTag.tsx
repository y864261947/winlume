import { Pricing } from "@/data/products";

export default function PriceTag({ pricing }: { pricing: Pricing }) {
  if (pricing.kind === "token") {
    return (
      <span className="space-y-0.5">
        <span className="block">
          <span className="text-ink-400">输入 </span>
          <span className="text-ink-800">{pricing.input}</span>
          <span className="text-ink-400"> /1M tokens</span>
        </span>
        <span className="block">
          <span className="text-ink-400">输出 </span>
          <span className="text-ink-800">{pricing.output}</span>
          <span className="text-ink-400"> /1M tokens</span>
        </span>
      </span>
    );
  }
  if (pricing.kind === "unit") {
    return (
      <span>
        <span className="text-ink-400">价格 </span>
        <span className="text-ink-800">{pricing.price}</span>
      </span>
    );
  }
  return (
    <span>
      <span className="text-ink-400">价格 </span>
      <span className="text-ink-800">{pricing.label}</span>
    </span>
  );
}
