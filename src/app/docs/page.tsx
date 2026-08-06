import { redirect } from "next/navigation";

/** 文档入口直接进入 API 参考，避免空壳落地页 */
export default function DocsPage() {
  redirect("/docs/api");
}
