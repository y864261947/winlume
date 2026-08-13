"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, ChevronRight, LayoutGrid } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useModals } from "@/components/providers";

export default function PortalPricingShell({ children }: { children: ReactNode }) {
  const { account, openLogin } = useModals();
  const [notice, setNotice] = useState("");
  const accountName = account ? account.display_name || account.username : null;

  return (
    <div className="portal-home">
      <div className="portal-frame portal-pricing-frame">
        <div className="portal-nav-shell">
          <div className="portal-nav-shell-fill" aria-hidden />
          <header className="portal-nav" aria-label="主导航">
            <Link href="/" className="portal-brand">
              <Image className="portal-brand-mark" src="/brand/reizo-mark.png" alt="" width={32} height={32} priority />
              Reizo
            </Link>
            <nav className="portal-main-links" aria-label="页面导航">
              <Link href="/">首页</Link>
              <Link href="/products?cate=app">应用工具</Link>
              <Link href="/products?cate=api">模型</Link>
              <Link href="/docs">文档</Link>
            </nav>
            <div className="portal-user-links">
              <Link href="/studio"><LayoutGrid aria-hidden />Agent</Link>
              <button type="button" onClick={() => setNotice("暂无新的通知")}><Bell aria-hidden />通知</button>
              {accountName ? (
                <Link href="/account" className="portal-account">
                  <span>{accountName.slice(0, 1).toUpperCase()}</span>{accountName}<ChevronRight aria-hidden />
                </Link>
              ) : (
                <button type="button" className="portal-account" onClick={() => openLogin("login")}>
                  <span>登</span>登录<ChevronRight aria-hidden />
                </button>
              )}
            </div>
          </header>
        </div>
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
