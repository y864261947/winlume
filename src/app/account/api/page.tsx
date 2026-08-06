import { redirect } from "next/navigation";

/** 旧账户内 API 文档页 → 独立文档中心 */
export default function AccountApiPage() {
  redirect("/docs/api");
}
