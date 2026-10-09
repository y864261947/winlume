import type { Metadata } from "next";
import "./globals.css";
import "@/components/reizo/generated/design.css";
import "@/components/reizo/reizo.css";
import "@/components/reizo/generated/theme.css";
import "@/components/reizo/appearance.css";
import "@/components/reizo/business-appearance.css";
import AppearanceProvider from "@/components/reizo/AppearanceProvider";
import { ModalProvider } from "@/components/providers";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: `${site.name} - AI 资源平台`,
  description: site.description,
  icons: { icon: "/reizo/assets/reizo-mark.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body className="flex min-h-screen flex-col bg-canvas font-sans text-ink-900 antialiased">
        <AppearanceProvider><ModalProvider>{children}</ModalProvider></AppearanceProvider>
      </body>
    </html>
  );
}
