"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import PortalNav from "@/components/PortalNav";

export default function PortalPricingShell({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState("");

  return (
    <div className="portal-home">
      <div className="portal-frame portal-pricing-frame">
        <PortalNav current="pricing" onNotify={() => setNotice("暂无新的通知")} />
        {notice ? <p className="portal-account-notice" role="status">{notice}</p> : null}
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
