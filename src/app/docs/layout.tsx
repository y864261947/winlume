import type { Metadata } from "next";
import type { ReactNode } from "react";
import DocsShell from "@/components/docs/DocsShell";
import { site } from "@/data/site";
import "./docs.css";

export const metadata: Metadata = {
  title: {
    default: `${site.name} 文档中心`,
    template: `%s · ${site.name} Docs`,
  },
  description: "WinLume API 开发者文档：聊天、嵌入、图像、音频、视频等 AI 模型接口参考。",
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}
