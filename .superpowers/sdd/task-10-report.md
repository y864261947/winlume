# Task 10 Report: Auth gate polish, settings, cleanup mocks

**Status:** DONE  
**Date:** 2026-07-24

## Summary

- **Auth gate (client):** Studio home + `useStudioChat` block send when no `winlume:gateway-user-id`; open LoginModal via `onUnauthorized` / `openLogin`. Server `/api/chat` already 401s without `x-winlume-user`.
- **Settings:** Account balance + logout retained; **default model** preference in `localStorage` (`winlume:default-model`) via `src/lib/studio/prefs.ts`. New chats on `/studio` load it (or `?model=` from marketing).
- **Experience mock cleanup:** `ExperienceModal` unmounted from `ModalProvider`; stub never shows fake runs. Marketing “立即体验” / plaza CTAs link to `/studio` (optional `?model=`). `openExperience` navigates to Studio. `experience.ts` marked deprecated / unused by Studio paths.
- **README:** Replaced create-next-app boilerplate with WinLume Studio env, dev, skill import, and `data/` docs.

## Files

| Action | Path |
|--------|------|
| Create | `src/lib/studio/prefs.ts` |
| Modify | `src/app/studio/settings/page.tsx` |
| Modify | `src/app/studio/page.tsx` |
| Modify | `src/app/studio/c/[sessionId]/page.tsx` |
| Modify | `src/components/studio/useStudioChat.ts` |
| Modify | `src/components/providers.tsx` |
| Modify | `src/components/ExperienceModal.tsx` (neutralized stub) |
| Modify | `src/lib/experience.ts` (deprecated) |
| Modify | `src/components/CtaButtons.tsx` |
| Modify | `src/components/ProductCard.tsx` |
| Modify | `src/components/RealModelGrid.tsx` |
| Modify | `src/components/PublicModelPlaza.tsx` |
| Replace | `README.md` |
| Create | `.superpowers/sdd/task-10-report.md` |

## Smoke checklist

| # | Check | Result |
|---|--------|--------|
| 1 | `/` → `/studio` | Existing (Task 2); not re-broken |
| 2 | Login works | Existing LoginModal + account APIs; gate opens login on send |
| 3 | Stream chat works | Unchanged API/hook path; 401 → login |
| 4 | Skill injection works | Unchanged |
| 5 | write_artifact + preview works | Unchanged (Task 9) |
| 6 | Refresh keeps history | Unchanged session load |
| 7 | `npm test` passes | **44 passed** (6 files) |
| 8 | `npm run build` succeeds | **OK** (TS OK; known NFT warning on skills registry) |

## Commit

`feat(studio): auth gate, settings, and mock experience cleanup`
