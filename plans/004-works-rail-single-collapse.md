# 004 — Unify works-rail collapse chrome (one clear close control)

- **Status**: DONE
- **Commit**: `7a68d60`
- **Severity**: HIGH
- **Category**: Purpose & frequency / Cohesion (UX structure; required before silky motion)
- **Estimated scope**: 3 files (session page + ArtifactPanel + ArtifactPreview)

## Problem

Desktop works rail currently exposes **three** controls that all collapse the **same** full rail, plus a fourth open path:

| Control | Location | What it does |
| --- | --- | --- |
| Header **作品** (active) | `src/app/studio/c/[sessionId]/page.tsx` ~574–601 | `closeWorksRail()` |
| List **收起** | `ArtifactPanel` ~137–150 | `onClose` → `closeWorksRail()` |
| Preview **收起** | `ArtifactPreview` ~789–804 | `onClose` → `closeWorksRail()` |
| Edge **作品** tab | page ~719–734 | open only |

```tsx
// page.tsx:685-710 — both panels wired to the same close
<ArtifactPanel
  ...
  onClose={closeWorksRail}
/>
...
<ArtifactPreview
  ...
  onClose={closeWorksRail}
/>
```

```tsx
// ArtifactPanel.tsx:137-150 — list chrome "收起"
{onClose ? (
  <button type="button" onClick={...} title="收起作品区">
    <PanelRightClose ... />
    <span>收起</span>
  </button>
) : null}
```

```tsx
// ArtifactPreview.tsx:789-804 — preview chrome also "收起" / same close
{onClose ? (
  <button type="button" onClick={...} title="收起作品区">
    <PanelRightClose ... />
    <span className="hidden sm:inline">收起</span>
  </button>
) : null}
```

Users see two adjacent **收起** labels (list header + preview header) and do not know which is list vs whole rail. There is no independent “close preview only” path in the preview header (header “预览” only re-opens when `!previewOpen`).

Frequency: tens of times per session while reviewing artifacts — chrome confusion is high-leverage.

## Target

**Single responsibility for each control:**

1. **Primary collapse (whole rail)**  
   - **Only** the top session header **作品** toggle (already `aria-pressed`).  
   - Optional: keep edge tab for **open only** when collapsed.

2. **ArtifactPanel**  
   - **Remove** `onClose` / **收起** button entirely from the list header.  
   - Keep refresh only.

3. **ArtifactPreview**  
   - Change close control to **close preview only** (not whole rail): call `onClosePreview` → `setPreviewOpen(false)` only.  
   - Label: **关闭预览** (icon `X` or `PanelRightClose`).  
   - Do **not** call `closeWorksRail`.  
   - When preview is closed, list stays open; header already has **预览** to re-open (`page.tsx` ~602–614).

4. **Mobile**  
   - List `onClose` currently switches to chat (`setMobileTab("chat"); closeWorksRail()`). Replace with: **only** `setMobileTab("chat")` (no dual “收起” copy on mobile list if panel is full-screen tab).  
   - Preview on mobile: same as desktop — close preview only if both are stacked; or omit preview close and use “对话” tab. Prefer: mobile works column keeps one **返回对话** in list header only (not labeled 收起 twice).

Wire page as:

```tsx
// Desktop list — no onClose
<ArtifactPanel ... /* no onClose */ />

// Desktop preview — close preview only
<ArtifactPreview
  onClose={() => setPreviewOpen(false)}
  ...
/>

// Header 作品 remains the only full-rail toggle
```

## Repo conventions to follow

- Session chrome language: Chinese short labels (`作品`, `预览`, `关闭预览`).
- Icon set: `lucide-react` (`PanelLeftClose` / `PanelRight` already used on header).
- Do not reintroduce localStorage force-open for the rail (intentionally removed).

## Steps

1. **`ArtifactPanel.tsx`**: Make `onClose` optional and **stop rendering** the 收起 button when a new prop `hideCollapse?: boolean` is true **or** simply remove the button and the `onClose` prop entirely if no mobile need. Prefer:
   - Remove `onClose` prop and button from `ArtifactPanel` completely.
   - Mobile: parent already has 对话 / 作品 tabs — no list collapse needed.

2. **`page.tsx`**:
   - Desktop `ArtifactPanel`: drop `onClose={closeWorksRail}`.
   - Mobile `worksColumn` `ArtifactPanel`: drop `onClose` that set chat tab (use mobile tabs only).
   - Desktop `ArtifactPreview`: `onClose={() => setPreviewOpen(false)}` only.
   - Mobile `ArtifactPreview`: either omit `onClose` or same preview-only close.

3. **`ArtifactPreview.tsx`**: Change button `title` / visible text from **收起** to **关闭预览**; keep `sr-only` aligned. Do not call whole-rail close.

4. **Header**: Leave **作品** as sole full-rail control. Ensure `title` stays `收起作品区` / `打开作品区` (already correct).

5. Smoke: open works → confirm only one collapse affordance for the rail (header); preview X closes preview only; list remains; header **预览** restores preview.

## Boundaries

- Do NOT change artifact load/save APIs, resize handles, or auto-open-on-write logic.
- Do NOT re-add localStorage `WORKS_RAIL_KEY` open restore.
- Do NOT implement motion in this plan — that is plan **005**.
- Do NOT add new dependencies.

## Verification

- **Mechanical**: `npx tsc --noEmit`; open session page, create/open works rail.
- **Feel / UX check**:
  - With list + preview open: **exactly one** control that collapses the entire works area (header 作品).
  - Preview header shows **关闭预览**, not a second **收起作品区**.
  - List header has refresh only (no 收起).
  - After 关闭预览, list (~256px) remains; header **预览** reopens preview.
- **Done when**: no two identical “收起” labels visible on desktop works chrome; roles match the table in Target.
