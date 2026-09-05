"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import LoginModal from "./LoginModal";
import SearchModal from "./SearchModal";
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [membershipOpen, setMembershipOpen] = useState(false);
  // 初始为空、挂载后再读 localStorage，避免 SSR 与客户端首帧不一致（hydration mismatch）
  const [favorites, setFavorites] = useState<string[]>([]);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [industryPrefs, setIndustryPrefs] = useState<string[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [balanceConfig, setBalanceConfig] = useState<BalanceConfig | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const accountRequestVersion = useRef(0);

  const refreshAccount = useCallback(async () => {
    const requestVersion = ++accountRequestVersion.current;
    // Load balance/auth feature flags even when the visitor is logged out so
    // LoginModal can show Google OAuth without a session cookie.
    const configPromise = getBalanceConfig()
      .then((config) => {
        if (requestVersion === accountRequestVersion.current) setBalanceConfig(config);
      })
      .catch(() => {
        if (requestVersion === accountRequestVersion.current) setBalanceConfig(null);
      });
    try {
      const currentAccount = await getAccount();
      if (requestVersion === accountRequestVersion.current) setAccount(currentAccount);
    } catch {
      if (requestVersion === accountRequestVersion.current) setAccount(null);
    } finally {
      await configPromise;
      if (requestVersion === accountRequestVersion.current) setAccountLoading(false);
    }
  }, []);

  const completeLogin = useCallback((nextAccount: Account) => {
    setAccount(nextAccount);
    setAccountLoading(false);
    void getBalanceConfig().then(setBalanceConfig).catch(() => setBalanceConfig(null));
  }, []);
  const openLogin = useCallback<ModalContextValue["openLogin"]>(() => { setLoginOpen(true); }, []);
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
    // Invalidate an in-flight account request before clearing the UI. Without
    // this, a request started before logout can restore the old account.
    ++accountRequestVersion.current;
    setAccount(null);
    setAccountLoading(false);
    try {
      await logoutRequest();
    } catch (error) {
      // If logout failed, resync the server session instead of claiming it
      // succeeded in the UI.
      void refreshAccount();
      throw error;
    }
    // A focus/visibility sync may have started while signOut was in flight;
    // invalidate it once more after the cookie has been cleared.
    ++accountRequestVersion.current;
    setAccount(null);
    setAccountLoading(false);
    // Keep public auth feature flags (e.g. google_oauth_enabled) after logout.
    void getBalanceConfig().then(setBalanceConfig).catch(() => setBalanceConfig(null));
  }, [refreshAccount]);

  const selectAudience = useCallback((next: Audience, industries: string[] = []) => {
    setAudience(next);
    setIndustryPrefs(industries);
    window.localStorage.setItem(audienceStorageKey, JSON.stringify({ audience: next, industries }));
    // 同步写 cookie，供 src/proxy.ts 做首页重定向
    document.cookie = `${audienceCookieKey}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  useEffect(() => {
    // OAuth callbacks and sign-out can update the session while this provider
    // stays mounted. Recheck whenever the page becomes active again.
    const initialSync = window.setTimeout(() => void refreshAccount(), 0);
    const syncAccount = () => {
      if (document.visibilityState === "visible") void refreshAccount();
    };
    window.addEventListener("focus", syncAccount);
    window.addEventListener("pageshow", syncAccount);
    document.addEventListener("visibilitychange", syncAccount);
    return () => {
      window.clearTimeout(initialSync);
      window.removeEventListener("focus", syncAccount);
      window.removeEventListener("pageshow", syncAccount);
      document.removeEventListener("visibilitychange", syncAccount);
    };
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

  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen((open) => !open); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);

  const value = useMemo<ModalContextValue>(() => ({ openLogin, closeLogin, openSearch, openMembership, openExperience, favorites, toggleFavorite, account, accountLoading, balanceConfig, refreshAccount, completeLogin, signOut, audience, industryPrefs, selectAudience }), [openLogin, closeLogin, openSearch, openMembership, openExperience, favorites, toggleFavorite, account, accountLoading, balanceConfig, refreshAccount, completeLogin, signOut, audience, industryPrefs, selectAudience]);

  return (
    <ModalContext.Provider value={value}>
      {children}
      <LoginModal open={loginOpen} onClose={closeLogin} />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <MembershipModal open={membershipOpen} onClose={() => setMembershipOpen(false)} />
    </ModalContext.Provider>
  );
}
