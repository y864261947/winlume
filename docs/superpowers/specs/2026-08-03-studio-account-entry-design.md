# Studio Account Entry Design

**Date:** 2026-08-03  
**Status:** Approved for planning  
**Scope:** Make the existing `/account` center discoverable from Studio without mixing it into the creation navigation.

## Goal

Give signed-in Studio users a clear, low-friction way to open the existing account center, which owns profile, wallet and usage, API keys, team access, and related account services.

## Information Architecture

`/studio` is a task-oriented workspace. Its primary sidebar navigation remains reserved for creation activities: starting work, skills, artifacts, and inspiration.

`/account` is a global identity and account-management surface. It does not belong in the primary creation navigation. The signed-in user identity block at the bottom of the Studio sidebar is the entry point because it already presents the user avatar, display name, and balance.

## Interaction Design

### Signed-in state

- Make the whole identity block containing the avatar, display name, and balance a `Link` to `/account`.
- Add a trailing `ChevronRight` icon on the identity row.
- On hover and keyboard focus, give the row a subtle surface highlight and preserve the existing sidebar geometry.
- Provide an accessible name that identifies the target, for example `进入账户中心`.
- Keep the existing actions below the identity block:
  - `设置` remains `/studio/settings` and is limited to Studio preferences, such as the default model.
  - `退出` keeps its existing sign-out behavior.

### Signed-out and loading states

- Do not show a dormant account-center control before authentication.
- Preserve the existing login and registration actions for signed-out users.
- Preserve the non-interactive loading skeleton while the account is being fetched.

## Rationale

The account card is the user’s persistent identity and balance representation, so it matches the mental model of account management. Keeping it out of the primary navigation prevents the creative workflow from being diluted by global administrative destinations. Keeping `设置` distinct prevents users from assuming that model preferences, identity, billing, keys, and teams are all one screen.

## Accessibility and Responsive Behavior

- Use a semantic link rather than a click handler on a generic container.
- The focus state must be at least as visible as the hover state.
- The full row is the tap target; the nested `设置` and `退出` controls remain separate, avoiding nested interactive elements.
- The collapsed/peek sidebar must continue to expose this control only when the full sidebar is visible, without changing the 52 px rail dimensions.

## Implementation Boundary

The change is limited to `src/components/studio/StudioSidebar.tsx`, plus focused tests if this component’s existing test conventions support them. It does not alter account routes, account APIs, account permissions, session behavior, or the Studio primary navigation.

## Validation

1. A signed-in user can activate the identity row by mouse, keyboard, and touch and reaches `/account`.
2. `设置` still opens `/studio/settings`; `退出` still signs out.
3. Signed-out and loading layouts remain unchanged in behavior.
4. The control works when the sidebar is normally expanded and when the collapsed sidebar is temporarily peeked open.
5. Run focused checks for the touched component, TypeScript validation, and a build before release.
