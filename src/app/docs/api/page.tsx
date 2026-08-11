import type { Metadata } from "next";
import { ApiHub } from "@/components/docs/ApiHub";

export const metadata: Metadata = {
  title: "API 参考",
  description: "Reizo AI 模型接口完整参考文档。",
};

export default function DocsApiPage() {
  return <ApiHub />;
}
