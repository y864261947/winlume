"use client";
import Link from "next/link";
import AccountAvatar from "@/components/account/AccountAvatar";
import Image from "next/image";


import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { LogOut, UserRound, Wallet, Settings, KeyRound } from "lucide-react";
import { useModals } from "@/components/providers";

const links = [["/", "首页"], ["/agent", "工作台"], ["/models", "API 接口"], ["/business", "企业服务"], ["/pricing", "会员与价格"]];

function subscribeToScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

const getCompactSnapshot = () => window.scrollY > 70;
const getServerCompactSnapshot = () => false;

export default function ReizoHeader({ enterprise = false }: { enterprise?: boolean }) {
  const pathname = usePathname();
  // All product pages share this navigation; imported scripts must not own it.
  const scrolled = useSyncExternalStore(subscribeToScroll, getCompactSnapshot, getServerCompactSnapshot);
  const compact = scrolled;
  const { account, accountLoading, openLogin, signOut } = useModals();
  const [navOpen, setNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const menu = useRef<HTMLDivElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setAccountOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setNavOpen(false); setAccountOpen(false); if (accountOpen) accountButton.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [accountOpen]);
  const navigation = enterprise ? [["#capabilities", "服务能力"], ["#solutions", "行业方案"], ["#cases", "客户案例"], ["#insights", "洞察与指南"]] : links;
  return <>
    {/* Home already reserves space in its hero; other pages previously used a sticky header. */}
    {pathname !== "/" && <div className="reizo-header-spacer" aria-hidden="true" />}
    <header className={`site-header reizo-scroll-header${enterprise ? " enterprise-header" : ""}${compact ? " is-compact" : ""}`}>
    <div className="shell navigation">
      <Link className="brand" href={enterprise ? "/business" : "/"} aria-label={enterprise ? "REIZO 企业服务首页" : "REIZO 首页"}><Image unoptimized src="/reizo/assets/reizo-mark.png" alt="" width="32" height="32" /><span>REIZO</span>{enterprise && <small>企业服务</small>}</Link>
      <nav id="main-nav" className={navOpen ? "open" : undefined} aria-label="主导航">
        {navigation.map(([href, label]) => <Link key={href} href={href} onClick={() => setNavOpen(false)} aria-current={pathname === href ? "page" : undefined} className={href === "/pricing" ? "nav-membership" : undefined}>{label}</Link>)}
        {enterprise && <Link href="/" className="enterprise-product-return" onClick={() => setNavOpen(false)}>返回产品 <span aria-hidden="true">↗</span></Link>}
      </nav>
      {!enterprise && <Link href="/pricing" className="nav-membership-account" aria-current={pathname === "/pricing" ? "page" : undefined}>会员与价格</Link>}
      <div className="reizo-account-control" ref={menu}>
        <button ref={accountButton} type="button" className="site-account-link" aria-label={account ? "我的账户" : "登录账户"} aria-expanded={accountOpen} aria-controls={account ? "reizo-account-menu" : undefined} disabled={accountLoading} onClick={() => account ? setAccountOpen(!accountOpen) : openLogin()}>
          <AccountAvatar image={account?.image} size={28} /><span>{accountLoading ? "加载中" : account ? account.display_name || account.username : "登录"}</span>
        </button>
        {account && accountOpen && <div className="reizo-account-menu" id="reizo-account-menu">
          <strong>{account.display_name || account.username}</strong>
          <Link href="/account"><UserRound size={16} />我的账户</Link><Link href="/account/wallet"><Wallet size={16} />钱包与账单</Link><Link href="/account/keys"><KeyRound size={16} />API 密钥</Link><Link href="/account/personalization"><Settings size={16} />资料与设置</Link>
          <button disabled={pending} onClick={async () => { setPending(true); setError(""); try { await signOut(); setAccountOpen(false); } catch { setError("退出失败，请重试"); } finally { setPending(false); } }}><LogOut size={16} />{pending ? "正在退出…" : "退出登录"}</button>
          {error && <p role="alert">{error}</p>}
        </div>}
      </div>
      <Link className="button nav-cta" href={enterprise ? "/business/contact" : "/studio"}>{enterprise ? "联系企业顾问" : "开始使用"} <span>↗</span></Link>
      <button className="menu-toggle icon-button" aria-expanded={navOpen} aria-controls="main-nav" aria-label={navOpen ? "收起导航" : "展开导航"} onClick={() => setNavOpen(!navOpen)}><span /><span /></button>
    </div>
    </header>
  </>;
}
