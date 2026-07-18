import { Sparkles } from "lucide-react";

// 纯渲染组件，不依赖客户端能力，可同时被 server / client 组件使用。
export default function LogoMark({ size = "md" }: { size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-7 w-7 rounded-md" : "h-8 w-8 rounded-lg";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span
      className={`spectrum-bg flex shrink-0 items-center justify-center shadow-sm shadow-primary-500/30 ${box}`}
    >
      <Sparkles className={`${icon} text-white`} />
    </span>
  );
}
