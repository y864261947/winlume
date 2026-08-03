# Studio Liquid Glass Library Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce stable WebGL liquid glass to Studio Headers while retaining the shared Composer's responsive CSS liquid-glass treatment.

**Architecture:** A small client wrapper owns lazy import, feature detection, initialization, and cleanup. Session and project Headers each become the wrapper's sole direct glass child; Composer stays CSS-only because its input mutations would otherwise trigger DOM recapture.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, `@ybouane/liquidglass`, `patch-package`.

---

### Task 1: Add the dependency and capability contract

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/components/studio/LiquidGlassSurface.tsx`
- Test: `src/components/studio/LiquidGlassSurface.test.ts`

- [ ] **Step 1: Write the failing eligibility test**

```ts
expect(isLiquidGlassEligible({ hasWebGl: false, reducedTransparency: false, coarsePointer: false })).toBe(false);
expect(isLiquidGlassEligible({ hasWebGl: true, reducedTransparency: false, coarsePointer: false })).toBe(true);
```

- [ ] **Step 2: Implement the wrapper and eligibility gate**

```tsx
export function isLiquidGlassEligible(capability: LiquidGlassCapability) {
  return capability.hasWebGl && !capability.reducedTransparency && !capability.coarsePointer;
}
```

- [ ] **Step 3: Run the focused test**

Run: `npx vitest run src/components/studio/LiquidGlassSurface.test.ts`

Expected: all eligibility cases pass.

### Task 2: Apply WebGL to stable Studio framing

**Files:**
- Modify: `src/app/studio/c/[sessionId]/page.tsx`
- Modify: `src/app/studio/p/[projectId]/page.tsx`

- [ ] **Step 1: Wrap the existing Header**

```tsx
<LiquidGlassSurface>
  <header className="studio-session-header studio-glass-soft" data-liquid-glass>
    {/* existing Header controls */}
  </header>
</LiquidGlassSurface>
```

- [ ] **Step 2: Run type and focused test checks**

Run: `npx tsc --noEmit; npx vitest run src/components/studio/LiquidGlassSurface.test.ts`

Expected: both commands exit successfully.

### Task 3: Validate the integration

**Files:**
- Verify: `src/components/studio/LiquidGlassSurface.tsx`
- Verify: `src/components/studio/Composer.tsx`

- [ ] **Step 1: Run full automated validation**

Run: `npm test; npm run build; git diff --check`

Expected: all tests, build, and whitespace validation pass.

- [ ] **Step 2: Browser smoke test**

Open `/studio`, verify the Composer accepts input, attachments, model selection, and Send; open a conversation and verify the Header's back, works, and list controls remain usable.
