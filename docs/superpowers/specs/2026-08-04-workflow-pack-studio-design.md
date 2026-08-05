# Workflow Pack Studio Design

**Status:** Approved product design, implementation pending
**Date:** 2026-08-04
**Scope:** Phase 3 of the Workflow Pack transformation
**Explicit non-goal:** `scheduleRun` / cron

## 1. Outcome

WinLume will expose a first-class professional Workflow experience without turning Studio into a fixed ecommerce or department dashboard.

The durable server model remains authoritative:

```text
WorkScene -> discovery lens
WorkflowPack -> versioned staged contract
Session.workflow -> selected Pack and normalized intake
AgentRun -> one Stage execution or revision
Artifact -> durable output and handoff boundary
```

Phase 3 adds the missing user-facing control surface:

1. Discover Workflow Packs above ordinary Skills.
2. Open a stable Pack detail URL and complete typed intake.
3. Create a Workflow Session without starting model execution.
4. Start and monitor each Stage from the existing Studio conversation/artifact shell.
5. Approve, request changes, advance, stop, retry, and recover through structured actions.

The Stage rail is a projection of persisted state. It never parses chat prose or invents progress locally.

## 2. Confirmed Product Decisions

- Use information architecture option A.
- Pack discovery remains under `/studio/skills`; no separate Workflow center is added.
- Pack detail and intake use the stable route `/studio/packs/[packId]`.
- Submitting intake creates and binds a Session but does not start the first Stage.
- The user explicitly starts every Stage that can consume model resources.
- Ordinary Sessions keep the existing Composer unchanged.
- Workflow Sessions use the same Composer dock and visual shell in a state-aware `workflow` mode.
- Workflow execution settings remain server-owned. The Workflow composer does not expose model, Skill, attachment, or message-queue controls while a Stage is executing.
- Generated Workflow prompts remain durable for audit/model history but render as compact Workflow execution records instead of long JSON-like user bubbles.
- Failed or cancelled Stages receive a structured `retry_stage` recovery action that creates a successor Run and preserves the failed Run.
- Queued or running Stages expose `stop` in the sanitized projection; the UI does not infer cancellation authority from Run status alone.
- Artifact-first behavior remains unchanged: conversation shows intent and execution; Artifacts are the inspectable deliverables.

## 3. Information Architecture

### 3.1 Routes

| Route | Purpose |
| --- | --- |
| `/studio/skills?scene=<sceneId>` | Discover matching Packs above matching Skills |
| `/studio/packs/[packId]?scene=<sceneId>` | Pack detail, availability, stages, outputs, and intake |
| `/studio/c/[sessionId]` | Existing Studio Session with Stage rail and Workflow Composer mode |

`scene` is a discovery/back-navigation hint only. It does not become execution authority.

### 3.2 Navigation

- The existing sidebar entry remains "全部能力" and continues to link to `/studio/skills`.
- No Pack-specific or industry-specific top-level sidebar entry is added.
- Pack cards are normal links so open-in-new-tab, copy-link, refresh, and browser history work.
- Pack detail preserves the originating `scene` in its back link.
- Successful launch uses `router.push('/studio/c/<sessionId>')` and does not create a pending first chat message.

## 4. Pack Discovery

The Skills page adds a compact "专业工作流" band above the ordinary Skill results.

### 4.1 Filtering

- `scene` filters both Packs and Skills.
- The search query filters Pack title/summary and Skill metadata.
- Department/category filters apply only to Skills.
- Packs remain visible when unavailable so users can understand the professional workflow and its missing capability.

### 4.2 Pack Card

Each Pack card shows:

- title and concise summary;
- number of Stages;
- number or short list of expected Artifact outputs;
- available/unavailable status;
- a direct link to the Pack detail route.

Cards use the existing restrained Studio surface language, a maximum 8px radius unless an existing shared token requires otherwise, and no marketing illustration or oversized copy.

### 4.3 Discovery States

- Loading: stable skeleton rows that do not resize the Skills grid.
- Empty: omit the Pack band when no Pack matches, while retaining the existing Skills empty state.
- Error: show a retryable inline Pack error without making ordinary Skills unusable.
- Unauthorized: use the existing login flow; do not silently present an empty catalog.

## 5. Pack Detail and Intake

The Pack page is a quiet work surface, not a landing page.

### 5.1 Desktop Layout

- Main column: typed intake form.
- 320-360px supporting column: numbered Stage outline, expected Artifacts, and capability availability.
- The supporting column is unframed or separated by a simple border; it is not a nested card stack.
- The page heading includes Pack title, summary, and version at normal workspace scale.

### 5.2 Mobile Layout

- One column.
- Pack summary and a compact Stage outline appear before the form.
- Long Stage lists collapse behind a clearly labeled disclosure.
- The submit action stays reachable without covering form fields or browser safe areas.

### 5.3 Intake Renderer

| Contract type | UI control |
| --- | --- |
| `text` | Text input |
| `url` | URL input with `http`/`https` validation |
| `number` | Numeric input |
| `select` | Select menu |
| `multi_select` | Checkbox option list |
| `artifact` | Artifact picker constrained by declared kinds |

Every field renders its Pack-authored label and description. Required fields have programmatic and visible required state. Validation errors are attached to their field and summarized at submit only when necessary for focus recovery.

### 5.4 Artifact Picker

The picker lists the current user's Artifacts before Session creation and supports:

- search by name;
- declared-kind filtering;
- selection and clear-selection actions;
- preview/open for each result;
- loading, empty, unauthorized, and retryable error states.

Client filtering improves usability, but the launch API remains authoritative for ownership and kind validation.

### 5.5 Optional Project

The form includes an optional Project selector populated from the existing Project API. A `projectId` supplied by a trusted Studio navigation context may preselect the Project, but the launch API validates it again.

### 5.6 Draft and Launch

- Intake draft state is stored in `sessionStorage` by Pack id/version so login or a recoverable navigation does not discard work.
- A successful launch clears the draft.
- The submit label is "创建工作流", not "开始执行".
- Pending submission disables duplicate clicks.
- The response creates no Run and returns the initial `start` projection.

### 5.7 Launch Errors

- `401`: open login and preserve the draft.
- `404`: show Pack unavailable and a path back to all capabilities.
- `pack_unavailable`: show capability reasons and disable launch.
- `pack_version_unavailable`: refetch the Pack, preserve fields that still exist and have compatible types, then require another explicit submit.
- Artifact ownership/kind errors: focus the Artifact field and retain all other values.
- Network/5xx: show retry without clearing the form.

## 6. Studio Workflow Shell

### 6.1 Stage Rail Placement

The Stage rail sits below the existing Session header and above the chat/artifact work area. It spans the available Session width so its state does not belong only to chat or only to Artifacts.

Desktop behavior:

- fixed compact height;
- horizontal sequence of stable-width Stage items;
- horizontal overflow for up to the contract maximum of 20 Stages;
- current Stage scrolls into view without moving the rest of the page;
- completed Stage items can open their Stage detail and output Artifacts;
- future Stage items are non-interactive.

Mobile behavior:

- one compact row containing current index, Stage title, and status;
- activating the row opens a modal/sheet with all Stages, outputs, review state, and available actions;
- the existing Chat/Works mobile switch remains unchanged.

### 6.2 Derived Display State

The client derives labels only from the sanitized Workflow projection. It does not infer state from message text, Artifact timestamps, or local completion assumptions.

| Projection | Display | Primary actions |
| --- | --- | --- |
| no Run, `actions: ['start']` | 尚未开始 | 开始第一阶段 |
| Run `queued` | 等待执行 | 停止 |
| Run `running`, phase `executing` | 执行中 | 停止 |
| phase `awaiting_approval` | 等待审核 | 通过, 要求修改 |
| phase `ready_for_next` | 本阶段完成 | 开始下一阶段 |
| phase `needs_revision` | 返工待恢复 | 重新启动返工 |
| phase `workflow_completed` | 工作流完成 | 查看最终产物 |
| Run `failed` or `cancelled` | 失败或已停止 | 重试本阶段 |
| projection request failed | 状态暂不可用 | 重新加载, 返回 Pack |

The UI renders Workflow transition/cancellation buttons only when the server projection exposes the corresponding action. Artifact navigation comes from sanitized output references rather than the action list. Loading disables repeated commands without optimistically inventing a new Workflow state.

## 7. Workflow Composer Mode

The existing Composer remains the visual foundation. Workflow Sessions switch its internal content to a Workflow-specific variant rather than mounting a differently styled product surface.

### 7.1 Ready to Start

The dock shows current Stage, a concise objective/output summary, and "开始第一阶段". No text field, model picker, Skill picker, attachment button, or queue is shown.

### 7.2 Queued or Running

The dock shows current Stage, elapsed activity state, and the existing explicit stop action. Arbitrary messages cannot be queued behind a Workflow Run.

### 7.3 Awaiting Approval

The dock shows:

- output access;
- optional approval note;
- "通过" action;
- required revision note and "要求修改并返工" action.

The revision action validates a non-empty note before calling the structured command API. It never turns free text into a Workflow transition implicitly.

### 7.4 Ready for Next Stage

The dock names the next Stage and its expected outputs. "开始下一阶段" is an explicit model-consuming action.

### 7.5 Completed

The dock shows Workflow completion and opens the final expected Artifact. Ordinary free chat is not silently re-enabled inside the bound Workflow Session in Phase 3.

### 7.6 Failed or Cancelled

The dock shows the durable failure/cancellation state, a reason when public, and "重试本阶段" when the server exposes `retry_stage`.

## 8. Structured Workflow Transcript

Workflow execution inputs are canonical server prompts and must remain durable for model history and audit. They should not render as ordinary user-authored bubbles.

Persisted Workflow-trigger messages gain presentation metadata containing only public execution identity, for example:

```ts
type WorkflowMessagePresentation = {
  workflowId: string;
  runId: string;
  stageId: string;
  stageTitle: string;
  iteration: number;
  intent: "stage_start" | "revision_start" | "retry_start";
};
```

`ChatThread` renders such a message as a compact execution record such as "已开始阶段：需求澄清". The canonical message content remains persisted and is still passed to the model, but is not shown as a long user bubble.

Legacy messages without this metadata retain their existing rendering.

## 9. Commands, Streaming, and Reconnection

The public Workflow action union is extended with `stop` and `retry_stage`. `stop` is projected for the current queued/running head and uses the existing explicit Session cancellation endpoint. `retry_stage` is handled by the authenticated Workflow command endpoint.

### 9.1 First Stage

A dedicated Workflow start path in the live-chat client sends:

```json
{ "sessionId": "...", "workflowAction": "start" }
```

It omits client-selected model, Skills, tools, capability preset, attachments, and arbitrary message text. The existing `/api/chat` SSE response drives live Chat and Artifact updates.

### 9.2 Approval

`approve` uses the existing Workflow command endpoint and refreshes the projection. It does not start the next Stage automatically.

### 9.3 Revision and Next Stage

`request_changes` and `start_next` may return `startedRunId`. The client attaches to that Run through the existing durable Run event API and feeds replayed Agent events through the same live-chat reducer used by the first Stage.

The attachment keeps an event cursor, stops at a terminal Run status, refreshes the Workflow projection, Session messages, and Artifacts, and can restart after route remount or browser focus.

### 9.4 Projection Refresh

Refresh on:

- Session load;
- Workflow command completion;
- live Run terminal event;
- browser focus after a stale interval;
- explicit retry.

Poll only while a known Run is queued/running or while reconnecting. Do not add permanent background polling to ordinary Studio Sessions.

## 10. Manual Retry Contract

Phase 3 adds `retry_stage` because stopped/failed Runs otherwise have no recoverable user action.

Server rules:

- valid only for the current head Run when status is `failed` or `cancelled`;
- creates or reuses a new successor Run for the same Stage;
- uses a stable idempotency scope/key;
- increments the Stage execution iteration;
- preserves the failed/cancelled predecessor Run and its events;
- carries forward canonical Stage inputs and completed outputs from earlier Stages;
- does not treat partial Artifacts from the failed Run as outputs of the retry;
- resolves model, Skills, allowed tools, and capability availability again on the server;
- exposes the action through the sanitized projection rather than accepting client-supplied Stage authority.

Stopping remains explicit. A browser disconnect still only detaches streaming and does not cancel the Run.

## 11. Artifact Interaction

- Stage output references come only from the Workflow projection.
- Clicking an available output opens the existing Works rail and selects that Artifact.
- Completed Stage detail lists declared outputs and their available Artifact references.
- Missing optional output is shown as absent, not failed.
- Missing required output is a server-side failed Run and uses the failed/retry state.
- The Stage rail never replaces ArtifactPreview or introduces Pack-specific renderers.

## 12. Error, Empty, and Blocked States

- Workflow projection loading uses a stable skeleton with the same rail height.
- A Session with a binding and no Run is a valid ready state, not an empty error.
- Projection corruption or unavailable snapshots fail closed and show a retryable blocked state.
- A command `409` triggers projection refresh before showing a stale-state message.
- Idempotent command replays are treated as success and display the returned authoritative projection.
- Unauthorized state opens login while retaining the current route.
- Every clickable control has a destination, modal, Artifact selection, or explicit confirmation/result state.

## 13. Accessibility and Motion

- Stage sequence uses ordered-list semantics and exposes current/completed state to assistive technology.
- Status is communicated by text and icon, never color alone.
- All action buttons have stable dimensions, disabled/pending state, visible focus, and meaningful accessible names.
- Dialog focus is trapped and restored to its trigger.
- Validation moves focus only on submit, not while typing.
- Stage progress and Run status updates use an appropriate live region without announcing every token.
- Motion is limited to current-step emphasis, rail scrolling, and existing panel transitions.
- All motion respects `prefers-reduced-motion`; no layout-heavy continuous animation is added.

## 14. Component and Ownership Boundaries

Expected boundaries, subject to the implementation plan:

- `WorkflowPackSection`: Pack discovery and independent retry state on the Skills page.
- `WorkflowPackPage`: route-level Pack loading, draft, intake, and launch orchestration.
- `WorkflowIntakeForm`: contract-driven fields and field errors.
- `WorkflowArtifactPicker`: user Artifact selection and preview.
- `useSessionWorkflow`: projection load, commands, event attachment, and refresh lifecycle.
- `WorkflowStageRail`: projection-only desktop/mobile progress surface.
- `WorkflowComposerControls`: Workflow variant rendered inside the existing Composer dock.
- `WorkflowRunNotice`: compact rendering for structured Workflow transcript messages.

Pack authority, transition legality, idempotency, execution policy, and Artifact provenance remain in the existing server modules.

## 15. Verification and Acceptance

### 15.1 Contract and API Tests

- list/detail/launch client mappings;
- Workflow projection action mapping;
- authenticated approve/revise/start-next/retry commands;
- retry-stage legality, idempotency, predecessor, inputs, iteration, and partial-output exclusion;
- structured Workflow message presentation metadata;
- no regression for ordinary chat, direct Skill use, or non-Workflow Sessions.

### 15.2 Component Tests

- Pack ordering above Skills and independent Pack failure;
- every intake field type and validation state;
- Artifact picker kind filtering and selection;
- launch preserves draft on errors and clears it on success;
- Stage rail state/action matrix;
- Workflow Composer variants;
- approval/revision dialogs and pending/error states;
- compact Workflow transcript rendering;
- output click opens the correct Artifact;
- mobile Stage sheet behavior.

### 15.3 Integration Tests

1. Open a scene-filtered Skills page and select a Pack.
2. Complete intake, select an Artifact/Project, and create a Session without a Run.
3. Reload the Session and confirm the `start` state survives.
4. Start the first Stage and observe live execution and Artifact output.
5. Approve a gated Stage, reload, and explicitly start the next Stage.
6. Request changes with a note and observe a new revision Run.
7. Stop a Run and retry it without losing the predecessor record.
8. Disconnect/remount during a Run and recover from durable events/projection.
9. Complete the final Stage and open the final Artifact.

### 15.4 Responsive and Visual Verification

Use Playwright at representative desktop and mobile viewports to verify:

- no overlap among sidebar, header, Stage rail, Chat, Composer, and Works rail;
- long Pack/Stage/field names wrap or truncate intentionally;
- 20-Stage overflow remains usable;
- all modal and mobile-sheet controls remain reachable;
- no horizontal page overflow;
- reduced-motion behavior;
- ordinary Studio Sessions remain visually unchanged.

### 15.5 Repository Checks

Run focused tests throughout implementation, then changed-file ESLint, production build, `git diff --check`, and the full suite with known parallel-load timeouts classified separately rather than hidden.

## 16. Deferred Work

- Structured blocking-review model output and deterministic quality checks remain Phase 4.
- Artifact lineage beyond current Workflow provenance remains Phase 4.
- The first commerce-specific Pack remains Phase 4.
- Marketplace publishing, Profiles, Connectors, external side effects, and schedule/cron remain out of Phase 3.
