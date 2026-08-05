import type { Metadata } from "next";
import EnterprisePortal from "@/components/enterprise/EnterprisePortal";

export const metadata: Metadata = {
  title: "ZenAI | 企业级 AI 与软件工程",
  description: "技术与 AI 咨询、核心系统现代化与定制企业级 AI。",
};

export default function BusinessPage() {
  return <EnterprisePortal />;
}
