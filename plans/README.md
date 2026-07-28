# Motion / UX plans

| # | Plan | Severity | Status | Area | Dependency |
| --- | --- | --- | --- | --- | --- |
| 001 | Hero pointer material | MEDIUM | TODO | Landing | None |
| 002 | Interruptible state swaps | MEDIUM | TODO | Landing | None |
| 003 | Direct control feedback | MEDIUM | TODO | Landing | None |
| 004 | Works rail single collapse chrome | HIGH | DONE | Studio works rail | None |
| 005 | Works rail silky open/close | HIGH | DONE | Studio works rail | Prefer after 004 |

## Studio works rail (user-requested)

**Recommended order:**

1. **`004-works-rail-single-collapse.md`** — resolve dual「收起」; one control closes the whole rail (header 作品); preview only closes preview.
2. **`005-works-rail-silky-open-close.md`** — keep shell mounted; animate `transform`/`opacity` only (≤280ms drawer ease); no width layout thrash; interruptible toggle.

Audit stamp: commit `7a68d60`.

## Landing enterprise plans (older)

1. `003` shared response tokens  
2. `001` hero pointer material  
3. `002` interruptible state swaps  

## Execute

Plans are self-contained. Run with any agent, e.g.:

- implement plan 004 then 005 on branch `feat/studio-workbench-ux`
- or `improve-animations execute plans/004-works-rail-single-collapse.md` if that variant is available

**This improve-animations pass does not modify product source** — only files under `plans/`.
