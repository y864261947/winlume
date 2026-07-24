import type { Metadata } from "next";
import "./globals.css";
import { ModalProvider } from "@/components/providers";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: `${site.name} - AI 资源平台`,
  description: site.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col bg-canvas font-sans text-ink-900 antialiased">
        <ModalProvider>{children}</ModalProvider>
      </body>
    </html>
  );
}
