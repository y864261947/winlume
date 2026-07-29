import type { Metadata } from "next";
import "@excalidraw/excalidraw/index.css";
import StudioShell from "@/components/studio/StudioShell";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: `${site.name} Studio`,
  description: "WinLume 工作台：自由对话、技能与作品。",
};

export default function StudioLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <StudioShell>{children}</StudioShell>;
}
