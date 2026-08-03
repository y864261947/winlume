# Studio Liquid Glass Library Integration

## Goal

Add true WebGL liquid glass to stable Studio framing surfaces while keeping the home and session Composer responsive with its existing CSS material.

## Scope

The first release uses `@ybouane/liquidglass` on the session and project Headers, which change infrequently. The shared Composer remains CSS glass on both `/studio` and `/studio/c/[sessionId]`: the library observes glass-subtree mutations and would otherwise re-rasterize on every keystroke.

## Design

`LiquidGlassSurface` is a client-only wrapper with one positioned root and one direct marked child. It dynamically imports the library only after hydration, checks WebGL, `prefers-reduced-transparency`, and fine-pointer capability, then initializes one instance with modest frosted settings. It destroys the instance during unmount and retains CSS if importing or initialization fails.

The wrapper is used around the low-frequency session and project Headers. The existing `.studio-liquid-glass` Composer treatment remains the visual language for high-frequency controls, so home and conversation Composer surfaces remain consistent without adding a capture loop to text entry.

## Dependency Reliability

Version `1.0.3` ships a `postinstall` command for `patch-package` but declares that binary only as its own development dependency. WinLume declares the matching `patch-package` version so normal `npm ci` lifecycle execution remains reproducible.

## Verification

Unit-test the eligibility gate and confirm TypeScript, focused Vitest, full tests, production build, and whitespace checks. Browser smoke tests verify both Composer input and Header navigation remain usable.
