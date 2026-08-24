"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode } from "react";
import PortalHeader from "@/components/PortalHeader";

export default function PortalPricingShell({ children }: { children: ReactNode }) {
  return (
    <div className="portal-home">
      <div className="portal-frame portal-pricing-frame">
        <PortalHeader />
        {children}
        <footer className="portal-personal-footer">
          <strong><Image className="portal-footer-mark" src="/brand/reizo-mark.png" alt="" width={24} height={24} />REIZO</strong>
          <span>让 AI 能力成为日常工作的一部分。</span>
          <nav aria-label="页脚导航">
            <Link href="/products?cate=app">应用工具</Link>
            <Link href="/products?cate=api">模型目录</Link>
            <Link href="/docs">开发文档</Link>
            <Link href="/business">企业方案</Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
