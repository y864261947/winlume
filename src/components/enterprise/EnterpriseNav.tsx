"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import Image from "next/image";

const navigation = [
  { label: "洞察", href: "#insights" },
  { label: "客户案例", href: "#cases" },
  { label: "AI资讯", href: "#insights" },
  { label: "关于我们", href: "#footer" },
] as const;

export default function EnterpriseNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const mobileMenuId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="zen-nav">
      <div className="zen-nav-inner">
        <Link href="/business" className="zen-nav-brand" aria-label="ZenAI 首页">
          <Image src="/enterprise/zenai/zenai-logo.avif" alt="ZEN" width={112} height={42} priority />
        </Link>

        <nav className="zen-nav-links" aria-label="主导航">
          <Link href="/business" aria-current="page">首页</Link>
          {navigation.map((item) => <a key={item.label} href={item.href}>{item.label}</a>)}
        </nav>

        <div className="zen-nav-actions">
          <button type="button" className="zen-nav-language" aria-label="当前语言：中文">中文</button>
          <a className="zen-nav-cta" href="#assessment">预约演示</a>
        </div>

        <button
          type="button"
          className="zen-nav-menu"
          aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
          aria-controls={mobileMenuId}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X aria-hidden /> : <Menu aria-hidden />}
        </button>
      </div>

      {menuOpen && (
        <nav id={mobileMenuId} className="zen-nav-mobile" aria-label="移动端主导航">
          <Link href="/business" aria-current="page" onClick={closeMenu}>首页</Link>
          {navigation.map((item) => <a key={item.label} href={item.href} onClick={closeMenu}>{item.label}</a>)}
          <button type="button" className="zen-nav-language" aria-label="当前语言：中文">中文</button>
          <a className="zen-nav-cta" href="#assessment" onClick={closeMenu}>预约演示</a>
        </nav>
      )}
    </header>
  );
}
