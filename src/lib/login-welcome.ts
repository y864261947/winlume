const oauthWelcomeKey = "reizo:oauth-welcome:v1";
const oauthWelcomeMaxAge = 10 * 60 * 1000;

export function loginGreeting(name: string, now = new Date()) {
  const hour = now.getHours();
  const greeting = hour >= 5 && hour < 11 ? "早上好" : hour >= 11 && hour < 14 ? "中午好" : hour >= 14 && hour < 18 ? "下午好" : "晚上好";
  return `${greeting}，${name.trim() || "欢迎回来"}`;
}

// This is only an animation intent, never evidence of an authenticated session.
export function markOAuthWelcome() {
  try { window.sessionStorage.setItem(oauthWelcomeKey, String(Date.now())); } catch { /* Storage can be disabled. */ }
}

export function clearOAuthWelcome() {
  try { window.sessionStorage.removeItem(oauthWelcomeKey); } catch { /* Storage can be disabled. */ }
}

/** Consume only after /api/account/self has confirmed the real account. */
export function consumeOAuthWelcome() {
  try {
    const raw = window.sessionStorage.getItem(oauthWelcomeKey);
    clearOAuthWelcome();
    if (!raw) return false;
    const age = Date.now() - Number(raw);
    return Number.isFinite(age) && age >= 0 && age < oauthWelcomeMaxAge;
  } catch { return false; }
}
