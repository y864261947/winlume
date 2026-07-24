# Task 2 Report: Resolve user + Studio shell layout (no marketing chrome)

**Status:** DONE  
**Commit:** `feat(studio): shell layout and default redirect to workbench` (see `git log -1`)  
**Date:** 2026-07-24

## Summary

Implemented Studio workbench shell and default entry redirect:

- Server helper `requireUserId()` for gateway user id (header / cookie)
- Root layout stripped to `html/body` + `ModalProvider` only (no SiteHeader/Footer)
- Marketing pages moved under route group `(marketing)/` with marketing chrome layout
- Studio routes: `/studio`, `/studio/settings` with sidebar shell (no marketing chrome)
- `/` → `redirect("/studio")`
- Proxy no longer forces business-audience redirect away from home (studio is default entry)

No chat API, sessions API, or streaming was implemented.

## Files created / modified

| Path | Action |
|------|--------|
| `src/lib/host/web/user.ts` | Created — `requireUserId()` |
| `src/app/layout.tsx` | Modified — providers only |
| `src/app/page.tsx` | Modified — redirect to `/studio` |
| `src/app/(marketing)/layout.tsx` | Created — AnnouncementBar + SiteHeader + Footer |
| `src/app/(marketing)/business/page.tsx` | Moved from `src/app/business/` |
| `src/app/(marketing)/pricing/page.tsx` | Moved from `src/app/pricing/` |
| `src/app/(marketing)/products/**` | Moved from `src/app/products/` |
| `src/app/studio/layout.tsx` | Created — StudioShell + metadata |
| `src/app/studio/page.tsx` | Created — empty state + non-functional prompt |
| `src/app/studio/settings/page.tsx` | Created — account/balance stub |
| `src/components/studio/StudioShell.tsx` | Created — full-height flex shell |
| `src/components/studio/StudioSidebar.tsx` | Created — nav + login/balance |
| `src/proxy.ts` | Modified — home no longer rewrites to `/business` |

## Acceptance checks

| Check | Result |
|-------|--------|
| Studio has no marketing header/footer | Pass — marketing chrome only in `(marketing)/layout.tsx` |
| `/` → `/studio` | Pass — `redirect("/studio")` in `page.tsx` |
| Marketing `/products` etc. still framed | Pass — under `(marketing)` route group |
| Login / balance patterns reused | Pass — `useModals` + `formatBalance` |
| No chat/sessions/streaming | Pass — prompt form is placeholder |
| `npm run build` | Pass — compiled + TypeScript clean |

## Build routes (excerpt)

```
○ /
○ /business
○ /pricing
ƒ /products
● /products/[id]
○ /studio
○ /studio/settings
```

## Manual check notes

- `npm run build` succeeded (Next.js 16.2.10 Turbopack).
- Dev server not left running; route table confirms studio + marketing split.
- Sidebar: 新对话、最近（占位）、Skills/作品（即将上线）、设置；登录 CTA 走现有 LoginModal。
- Studio home empty-state title: 「今天想完成什么？」；chips fill draft only; send is no-op until Task 5.

## Design decisions

1. **Route group `(marketing)`** instead of per-page `MarketingFrame` — keeps URLs (`/products`, `/business`) stable and applies chrome once.
2. **Proxy**: previous business-audience redirect on `/` conflicted with default Studio entry; proxy now passes through. Audience cookie still used by marketing UI switchers.
3. **`requireUserId`**: returns `null` when logged out (does not throw), matching brief signature for later storage partitioning.
4. **Root `body`** remains `flex min-h-screen flex-col` so marketing `main.flex-1` still expands; Studio uses `h-dvh` overflow shell inside.

## Follow-ups (out of scope)

- Wire prompt send → create session (Task 5+)
- Recent sessions list in sidebar
- Skills / 作品 routes
- Optional: disable marketing onboarding modal when on `/studio`
- Optional: SiteHeader logo target if marketing home is no longer `/`
