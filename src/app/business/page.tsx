import type { Metadata } from "next";
import DesignPage from "@/components/reizo/DesignPage";

export const metadata: Metadata = {
  title: "ReizoAI",
  description: "技术与 AI 咨询、核心系统现代化与定制企业级 AI。",
};

export default function BusinessPage() {
  return <DesignPage page="business" />;
}
