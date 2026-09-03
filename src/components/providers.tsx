"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import LoginModal from "./LoginModal";
import SearchModal from "./SearchModal";
import OnboardingModal from "./OnboardingModal";
import MembershipModal from "./MembershipModal";
import type { Product } from "@/data/products";
import type { Audience } from "@/data/audience";
import { getAccount, getBalanceConfig, logout as logoutRequest, type Account, type BalanceConfig } from "@/lib/account";

type LoginMode = "login" | "register";

/** Optional subject for marketing CTAs — routes into real Studio, not a mock run. */
export type ExperienceTarget = Product | { name: string } | string;

interface ModalContextValue {
  openLogin: (mode?: LoginMode) => void;
  closeLogin: () => void;
  openSearch: () => void;
  openMembership: () => void;
  /**
   * Open real Studio (no fake ExperienceModal runs).
   * Optional target preselects model via `?model=`.
   */
  openExperience: (target?: ExperienceTarget) => void;
  favorites: string[];
  toggleFavorite: (productId: string) => void;
  account: Account | null;
  accountLoading: boolean;
  balanceConfig: BalanceConfig | null;
  refreshAccount: () => Promise<void>;
  completeLogin: (account: Account) => void;
  signOut: () => Promise<void>;
  /** 用户身份版本：个人 / 企业（未选择时为 null） */
  audience: Audience | null;
  industryPrefs: string[];
  selectAudience: (audience: Audience, industries?: string[]) => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);
const favoriteStorageKey = "reizo:favorites-v1";
const audienceStorageKey = "reizo:audience-v1";
// proxy.ts 依据此 cookie 做首页重定向，改动时需两边同步
const audienceCookieKey = "reizo_audience";

function readFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try { const value = window.localStorage.getItem(favoriteStorageKey); return value ? (JSON.parse(value) as string[]) : []; } catch { return []; }
}

export function useModals(): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("useModals must be used within ModalProvider");
  return ctx;
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<LoginMode>("login");
  const [searchOpen, setSearchOpen] = useState(false);
  const [membershipOpen, setMembershipOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  // 初始为空、挂载后再读 localStorage，避免 SSR 与客户端首帧不一致（hydration mismatch）
  const [favorites, setFavorites] = useState<string[]>([]);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [industryPrefs, setIndustryPrefs] = useState<string[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [balanceConfig, setBalanceConfig] = useState<BalanceConfig | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);

  const refreshAccount = useCallback(async () => {
    // Load balance/auth feature flags even when the visitor is logged out so
    // LoginModal can show Google OAuth without a session cookie.
    const configPromise = getBalanceConfig()
      .then((config) => setBalanceConfig(config))
      .catch(() => setBalanceConfig(null));
    try {
      const currentAccount = await getAccount();
      setAccount(currentAccount);
    } catch {
      setAccount(null);
    } finally {
      await configPromise;
      setAccountLoading(false);
    }
  }, []);

  const completeLogin = useCallback((nextAccount: Account) => {
    setAccount(nextAccount);
    setAccountLoading(false);
    void getBalanceConfig().then(setBalanceConfig).catch(() => setBalanceConfig(null));
  }, []);
  const openLogin = useCallback((mode: LoginMode = "login") => { setLoginMode(mode); setLoginOpen(true); }, []);
  const closeLogin = useCallback(() => setLoginOpen(false), []);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const openMembership = useCallback(() => setMembershipOpen(true), []);
  /** Neutralized: marketing “立即体验” goes to Studio, not the mock ExperienceModal. */
  const openExperience = useCallback((target?: ExperienceTarget) => {
    const modelName =
      typeof target === "string"
        ? target
        : target && typeof target === "object" && "name" in target && typeof target.name === "string"
          ? target.name
          : undefined;
    const url = modelName
      ? `/studio?model=${encodeURIComponent(modelName)}`
      : "/studio";
    window.location.assign(url);
  }, []);
  const toggleFavorite = useCallback((productId: string) => { setFavorites((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]); }, []);
  const signOut = useCallback(async () => {
    // 请求失败会抛给调用方处理，本地账户状态保持不变
    await logoutRequest();
    setAccount(null);
    // Keep public auth feature flags (e.g. google_oauth_enabled) after logout.
    void getBalanceConfig().then(setBalanceConfig).catch(() => setBalanceConfig(null));
  }, []);

  const selectAudience = useCallback((next: Audience, industries: string[] = []) => {
    setAudience(next);
    setIndustryPrefs(industries);
    window.localStorage.setItem(audienceStorageKey, JSON.stringify({ audience: next, industries }));
    // 同步写 cookie，供 src/proxy.ts 做首页重定向
    document.cookie = `${audienceCookieKey}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  useEffect(() => {
    // 推迟到下一帧执行，避免在 effect 体内同步 setState
    const timer = window.setTimeout(() => void refreshAccount(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshAccount]);

  // 挂载后读取本地收藏；写入 effect 跳过首次执行，避免用空数组覆盖已有数据
  useEffect(() => {
    const timer = window.setTimeout(() => setFavorites(readFavorites()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const skipFirstFavoriteWrite = useRef(true);
  useEffect(() => {
    if (skipFirstFavoriteWrite.current) { skipFirstFavoriteWrite.current = false; return; }
    window.localStorage.setItem(favoriteStorageKey, JSON.stringify(favorites));
  }, [favorites]);

  // 挂载后读取已保存的身份版本与行业偏好
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(audienceStorageKey);
        if (!raw) return;
        const saved = JSON.parse(raw) as { audience?: Audience; industries?: string[] };
        if (saved.audience === "personal" || saved.audience === "business") setAudience(saved.audience);
        if (Array.isArray(saved.industries)) setIndustryPrefs(saved.industries);
      } catch { /* 忽略损坏的本地数据 */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // W2: identity picker is opt-in. Auto-opening it stacked on the homepage
  // spotlight (B8). Keep the modal mounted; nothing opens it on first visit.
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen((open) => !open); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);

  const completeOnboarding = useCallback((next: Audience, industries: string[]) => { selectAudience(next, industries); setOnboardingOpen(false); }, [selectAudience]);
  // 遮罩 / ESC 仅关闭，不写入"已完成"，下次访问还会再弹
  const dismissOnboarding = useCallback(() => setOnboardingOpen(false), []);

  const value = useMemo<ModalContextValue>(() => ({ openLogin, closeLogin, openSearch, openMembership, openExperience, favorites, toggleFavorite, account, accountLoading, balanceConfig, refreshAccount, completeLogin, signOut, audience, industryPrefs, selectAudience }), [openLogin, closeLogin, openSearch, openMembership, openExperience, favorites, toggleFavorite, account, accountLoading, balanceConfig, refreshAccount, completeLogin, signOut, audience, industryPrefs, selectAudience]);

  return (
    <ModalContext.Provider value={value}>
      {children}
      <LoginModal open={loginOpen} initialMode={loginMode} onClose={closeLogin} />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <MembershipModal open={membershipOpen} onClose={() => setMembershipOpen(false)} />
      <OnboardingModal open={onboardingOpen} onComplete={completeOnboarding} onDismiss={dismissOnboarding} />
    </ModalContext.Provider>
  );
}
