# Workflow Pack Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first user-facing professional Workflow Pack experience in Studio, from discovery and typed intake through durable Stage execution, review, stop, retry, reconnection, and Artifact opening.

**Architecture:** Keep Pack and transition authority in the existing production-pack server modules. Add a pure public Workflow projection contract, a contract-driven Pack launch surface, and a Session-scoped controller that renders persisted Workflow state through a compact Stage rail and Workflow control bar while reusing the existing chat/Artifact shell and live event reducer. Ordinary Sessions continue to mount the existing Composer unchanged, and `scheduleRun` remains out of scope.

**Tech Stack:** Next.js 16.2 App Router, React 19 Client Components, TypeScript, Zod, Vitest in Node environment, Tailwind CSS, Lucide icons, existing durable AgentRun event API, Playwright for rendered desktop/mobile verification.

---

## File Map

### Shared contracts and server behavior

- Create `src/lib/agent/production-packs/workflow-contract.ts`: browser-safe action, projection, command, and response types.
- Modify `src/lib/agent/production-packs/workflow-execution.ts`: consume the shared contract; project `stop`/`retry_stage`; create idempotent retry successor Runs.
- Modify `src/lib/agent/production-packs/workflow-execution.test.ts`: retry legality, idempotency, predecessor, iteration, inputs, and partial-output exclusion.
- Modify `src/app/api/sessions/[id]/workflow/route.ts`: accept the strict `retry_stage` command.
- Modify `src/app/api/sessions/[id]/workflow/route.test.ts`: authenticated retry response and authority-field rejection.

### Structured Workflow transcript

- Modify `src/lib/agent/types.ts`: define `WorkflowMessagePresentation` and add optional `Message.presentation`.
- Modify `src/lib/agent/executor/types.ts`: carry server-derived Workflow presentation into executors.
- Modify `src/lib/agent/production-packs/run-metadata.ts`: persist execution intent for stage, revision, and retry starts.
- Modify `src/lib/agent/production-packs/run-metadata.test.ts`: intent defaults and successor intent tests.
- Modify `src/lib/agent/production-packs/workflow-execution.ts`: expose stage title, iteration, and intent in execution context.
- Modify `src/lib/agent/infrastructure/coordinator.ts`: pass the server-derived presentation context to the executor.
- Modify `src/lib/agent/runtime.ts`: persist presentation metadata on Workflow user messages.
- Modify `src/lib/agent/runtime.workflow.test.ts`: canonical content remains available while presentation metadata is persisted.
- Modify `src/lib/agent/executor/codex.ts`: persist the same metadata in the Codex executor path.
- Modify `src/lib/agent/executor/codex.test.ts`: verify Workflow presentation persistence.
- Modify `src/lib/studio/live-chat-session.ts`: retain `presentation` when mapping persisted messages.
- Modify `src/lib/studio/live-chat-session.test.ts`: mapping regression coverage.
- Create `src/components/studio/workflow/WorkflowRunNotice.tsx`: compact execution record.
- Modify `src/components/studio/ChatThread.tsx`: render Workflow user messages through the notice.

### Pack discovery and launch

- Create `src/lib/studio/workflow-intake.ts`: pure draft keys, compatible-draft reconciliation, normalization, and field validation.
- Create `src/lib/studio/workflow-intake.test.ts`: all six Intake field types and launch-error preservation.
- Modify `src/lib/studio/api.ts`: typed Workflow list/detail/launch/projection/command/Run-event helpers with server error codes.
- Create `src/components/studio/workflow/WorkflowPackSection.tsx`: independently loaded Pack band and retry state.
- Modify `src/app/studio/skills/page.tsx`: place Packs above Skills and apply scene/search filtering without applying department filters to Packs.
- Create `src/app/studio/packs/[packId]/page.tsx`: await dynamic route/search params and render the Client work surface.
- Create `src/app/studio/packs/[packId]/loading.tsx`: dimensionally stable route skeleton.
- Create `src/components/studio/workflow/WorkflowPackPage.tsx`: detail fetch, draft lifecycle, optional Project, launch, and navigation.
- Create `src/components/studio/workflow/WorkflowIntakeForm.tsx`: contract-driven fields and submit focus recovery.
- Create `src/components/studio/workflow/WorkflowArtifactPicker.tsx`: kind-constrained Artifact search, selection, clear, and preview.

### Session Workflow execution surface

- Create `src/lib/studio/workflow-state.ts`: pure projection-to-view-state/action mapping.
- Create `src/lib/studio/workflow-state.test.ts`: state/action matrix and stale projection behavior.
- Create `src/lib/studio/live-agent-events.ts`: one pure Agent event reducer shared by direct SSE and durable replay.
- Create `src/lib/studio/live-agent-events.test.ts`: text/tool/Artifact/done reducer coverage.
- Modify `src/lib/studio/live-chat-session.ts`: use the shared reducer; expose first-stage start and durable Run attachment without ordinary message queue semantics.
- Modify `src/components/studio/useStudioChat.ts`: expose Workflow start/attach operations.
- Create `src/components/studio/workflow/useSessionWorkflow.ts`: projection loading, commands, stop, reconnect, focus refresh, and terminal reconciliation.
- Create `src/components/studio/workflow/WorkflowStageRail.tsx`: desktop ordered rail and mobile detail dialog.
- Create `src/components/studio/workflow/WorkflowControlBar.tsx`: ready/running/review/next/completed/failure controls using the existing Composer dock surface.
- Modify `src/app/studio/c/[sessionId]/page.tsx`: conditionally mount the Workflow rail/control bar and route output clicks into the existing Artifact panel.

## Task 0: Checkpoint the Verified Phase 1/2 Baseline

**Files:**
- Stage the existing Phase 1/2 server implementation, `CONTEXT.md`, the transformation plan, the approved Phase 3 spec, and this implementation plan.
- Exclude every file outside the current isolated worktree and every `scheduleRun`/cron path.

- [x] **Step 1: Re-run the focused server baseline**

Run:

```powershell
npx vitest run src/lib/agent/production-packs src/app/api/packs src/app/api/sessions/[id]/workflow src/app/api/runs/[id]/events src/lib/agent/runtime.workflow.test.ts --maxWorkers=1
git diff --check
```

Expected: the previously verified Phase 1/2 suite passes and diff check reports no whitespace errors.

- [x] **Step 2: Create the baseline commit before overlapping Phase 3 edits**

Stage the exact current Phase 1/2 and planning paths shown by `git status --short`, inspect `git diff --cached --stat`, confirm no cron path is present, and commit:

```powershell
git commit -m "feat: establish durable workflow pack execution"
```

Expected: the worktree is clean immediately after the commit and Phase 3 can make small self-contained commits even when it modifies Phase 2 files such as `workflow-execution.ts` and `api.ts`.

## Task 1: Public Workflow Contract and Recovery Actions

**Files:**
- Create: `src/lib/agent/production-packs/workflow-contract.ts`
- Modify: `src/lib/agent/production-packs/workflow-execution.ts`
- Modify: `src/lib/agent/production-packs/workflow-execution.test.ts`
- Modify: `src/app/api/sessions/[id]/workflow/route.ts`
- Modify: `src/app/api/sessions/[id]/workflow/route.test.ts`

- [x] **Step 1: Write failing projection and retry tests**

Add tests that assert queued/running heads expose only `stop`, failed/cancelled heads expose only `retry_stage`, and retry creates or reuses a successor Run with the same Stage, `iteration + 1`, the failed Run as `predecessorRunId`, earlier completed inputs, no partial outputs from the failed Run, and server-resolved execution policy.

```ts
expect(queuedProjection.actions).toEqual(["stop"]);
expect(failedProjection.actions).toEqual(["retry_stage"]);
expect(retry.startedRun).toMatchObject({
  sessionId: "session-1",
  idempotencyScope: "user:user-1:workflow:workflow-1",
  idempotencyKey: "stage:brief:iteration:1",
  metadata: {
    production: {
      execution: {
        stageId: "brief",
        iteration: 1,
        predecessorRunId: failedRun.id,
      },
      artifacts: { inputs: { source: ["approved-input"] }, outputs: {} },
    },
  },
});
```

- [x] **Step 2: Run the focused tests and confirm the missing behavior**

Run:

```powershell
npx vitest run src/lib/agent/production-packs/workflow-execution.test.ts src/app/api/sessions/[id]/workflow/route.test.ts --maxWorkers=1
```

Expected: failures show `stop`/`retry_stage` are absent and the retry command is rejected.

- [x] **Step 3: Add the browser-safe contract**

Define the full public union in `workflow-contract.ts`; do not import Run stores or server services from this file.

```ts
import type { ArtifactKind } from "@/lib/agent/types";
import type { ProductionPackMeta } from "./contracts";

export type ProductionWorkflowAction =
  | "start"
  | "stop"
  | "approve"
  | "request_changes"
  | "start_next"
  | "retry_stage";

export type ProductionWorkflowCommand =
  | { action: "approve"; runId: string; note?: string }
  | { action: "request_changes"; runId: string; note: string }
  | { action: "start_next"; runId: string }
  | { action: "retry_stage"; runId: string };

export interface ProductionWorkflowProjection {
  workflowId: string;
  pack: ProductionPackMeta;
  currentStage: { id: string; title: string; index: number; total: number };
  run?: {
    id: string;
    status:
      | "queued"
      | "running"
      | "waiting_approval"
      | "completed"
      | "failed"
      | "cancelled";
    phase:
      | "executing"
      | "awaiting_approval"
      | "ready_for_next"
      | "needs_revision"
      | "workflow_completed"
      | "failed";
    iteration: number;
    predecessorRunId?: string;
    error?: { code: string; message: string };
  };
  outputs: Record<
    string,
    Array<{ id: string; name: string; kind: ArtifactKind; status?: string }>
  >;
  review?: {
    status: "pending" | "approved" | "changes_requested";
    decidedBy?: string;
    decidedAt?: string;
    note?: string;
  };
  actions: ProductionWorkflowAction[];
}
```

- [x] **Step 4: Implement retry and strict projection actions**

Import the shared types into `workflow-execution.ts`. Validate `retry_stage` against the current head and terminal status, prepare the same Stage with incremented iteration and stable idempotency keys, resolve policy again, submit a successor, and leave the predecessor untouched. Include public Run errors only from the sanitized Run error fields.

- [x] **Step 5: Extend the strict command route**

Add exactly this Zod branch; `.strict()` must continue rejecting model, Stage, Skill, tool, and capability fields.

```ts
z.object({
  action: z.literal("retry_stage"),
  runId: idSchema,
}).strict()
```

- [x] **Step 6: Run focused tests and commit the slice**

Run:

```powershell
npx vitest run src/lib/agent/production-packs/workflow-execution.test.ts src/app/api/sessions/[id]/workflow/route.test.ts --maxWorkers=1
git add src/lib/agent/production-packs/workflow-contract.ts src/lib/agent/production-packs/workflow-execution.ts src/lib/agent/production-packs/workflow-execution.test.ts src/app/api/sessions/[id]/workflow/route.ts src/app/api/sessions/[id]/workflow/route.test.ts
git commit -m "feat: add workflow stop and retry contracts"
```

Expected: focused tests pass; no `scheduleRun` files are staged.

## Task 2: Structured Workflow Message Presentation

**Files:**
- Modify: `src/lib/agent/types.ts`
- Modify: `src/lib/agent/executor/types.ts`
- Modify: `src/lib/agent/production-packs/run-metadata.ts`
- Modify: `src/lib/agent/production-packs/run-metadata.test.ts`
- Modify: `src/lib/agent/production-packs/workflow-execution.ts`
- Modify: `src/lib/agent/infrastructure/coordinator.ts`
- Modify: `src/lib/agent/runtime.ts`
- Modify: `src/lib/agent/runtime.workflow.test.ts`
- Modify: `src/lib/agent/executor/codex.ts`
- Modify: `src/lib/agent/executor/codex.test.ts`
- Modify: `src/lib/studio/live-chat-session.ts`
- Modify: `src/lib/studio/live-chat-session.test.ts`
- Create: `src/components/studio/workflow/WorkflowRunNotice.tsx`
- Modify: `src/components/studio/ChatThread.tsx`

- [ ] **Step 1: Write failing persistence and mapping tests**

Assert a Workflow turn persists canonical prompt text together with public presentation metadata and that `toUiMessages` preserves it; assert ordinary messages remain unchanged.

```ts
expect(userMessage).toMatchObject({
  role: "user",
  content: expect.stringContaining("阶段目标"),
  presentation: {
    kind: "workflow_run",
    workflowId: "workflow-1",
    runId: "run-1",
    stageId: "brief",
    stageTitle: "需求澄清",
    iteration: 0,
    intent: "stage_start",
  },
});
expect(toUiMessages([userMessage])[0].presentation).toEqual(
  userMessage.presentation,
);
```

- [ ] **Step 2: Run tests and verify presentation is dropped**

Run:

```powershell
npx vitest run src/lib/agent/runtime.workflow.test.ts src/lib/agent/executor/codex.test.ts src/lib/studio/live-chat-session.test.ts --maxWorkers=1
```

Expected: failures identify the missing `presentation` contract and mapping.

- [ ] **Step 3: Add the message contract and execution intent**

Add a discriminated presentation field and persist execution intent as `stage_start`, `revision_start`, or `retry_start`. Legacy production metadata without an intent must parse and derive `stage_start` for iteration zero and `revision_start` for later iterations.

```ts
export type WorkflowMessagePresentation = {
  kind: "workflow_run";
  workflowId: string;
  runId: string;
  stageId: string;
  stageTitle: string;
  iteration: number;
  intent: "stage_start" | "revision_start" | "retry_start";
};

export interface Message {
  id: string;
  sessionId: string;
  role: Role;
  content: string;
  presentation?: WorkflowMessagePresentation;
  createdAt: string;
}
```

- [ ] **Step 4: Derive presentation only on the server**

Extend the Workflow execution context returned by `workflow-execution.ts` with the public fields needed by the executor. The coordinator forwards that context; both Studio runtime and Codex executor attach the resulting `Message.presentation` to the persisted user message. No browser request may supply these fields.

- [ ] **Step 5: Render a compact execution notice**

`WorkflowRunNotice` receives only `WorkflowMessagePresentation` and renders an icon, stage title, iteration/retry label, and accessible text. `ChatThread` checks `message.presentation?.kind === "workflow_run"` before the ordinary user-bubble branch; canonical content is not rendered in that branch.

- [ ] **Step 6: Run focused tests and commit**

Run:

```powershell
npx vitest run src/lib/agent/production-packs/run-metadata.test.ts src/lib/agent/runtime.workflow.test.ts src/lib/agent/executor/codex.test.ts src/lib/studio/live-chat-session.test.ts --maxWorkers=1
git add src/lib/agent/types.ts src/lib/agent/executor/types.ts src/lib/agent/production-packs/run-metadata.ts src/lib/agent/production-packs/run-metadata.test.ts src/lib/agent/production-packs/workflow-execution.ts src/lib/agent/infrastructure/coordinator.ts src/lib/agent/runtime.ts src/lib/agent/runtime.workflow.test.ts src/lib/agent/executor/codex.ts src/lib/agent/executor/codex.test.ts src/lib/studio/live-chat-session.ts src/lib/studio/live-chat-session.test.ts src/components/studio/workflow/WorkflowRunNotice.tsx src/components/studio/ChatThread.tsx
git commit -m "feat: present workflow runs as structured notices"
```

Expected: Workflow prompt content remains persisted and model-visible; UI mapping contains presentation metadata.

## Task 3: Studio Workflow API and Intake State

**Files:**
- Modify: `src/lib/studio/api.ts`
- Create: `src/lib/studio/workflow-intake.ts`
- Create: `src/lib/studio/workflow-intake.test.ts`

- [ ] **Step 1: Write failing pure Intake tests**

Cover required text, `http`/`https` URLs, finite numbers, select options, deduplicated multi-select arrays, Artifact ids, unknown-key removal, and compatible draft reconciliation after a Pack version change.

```ts
expect(validateWorkflowIntake(fields, {
  brief: "  Launch in Japan  ",
  sourceUrl: "ftp://example.com",
  channels: ["web", "web", "retail"],
})).toEqual({
  ok: false,
  values: { brief: "Launch in Japan", channels: ["web", "retail"] },
  errors: { sourceUrl: "请输入 http 或 https 地址" },
});
```

- [ ] **Step 2: Run the Intake test and confirm the helper is absent**

Run:

```powershell
npx vitest run src/lib/studio/workflow-intake.test.ts --maxWorkers=1
```

Expected: module-not-found failure for `workflow-intake.ts`.

- [ ] **Step 3: Implement pure draft and validation helpers**

Export `workflowDraftKey(packId, version)`, `initialWorkflowIntake(fields)`, `validateWorkflowIntake(fields, raw)`, and `reconcileWorkflowIntake(previousFields, nextFields, previousValues)`. The module must not access `window`; the Client page owns `sessionStorage` calls.

- [ ] **Step 4: Add typed Workflow API helpers**

Add `getSessionWorkflow`, `executeSessionWorkflowCommand`, and `getRunEvents`, and improve `StudioApiError` with an optional public `code` so `pack_unavailable`, `pack_version_unavailable`, stale `409`, Artifact-field errors, and auth can be handled without string parsing.

```ts
export type WorkflowCommandResult = {
  command: { sourceRunId: string; startedRunId?: string; created: boolean };
  workflow: ProductionWorkflowProjection;
};

export async function executeSessionWorkflowCommand(
  sessionId: string,
  command: ProductionWorkflowCommand,
  idempotencyKey: string,
): Promise<WorkflowCommandResult>;
```

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npx vitest run src/lib/studio/workflow-intake.test.ts --maxWorkers=1
git add src/lib/studio/api.ts src/lib/studio/workflow-intake.ts src/lib/studio/workflow-intake.test.ts
git commit -m "feat: add workflow studio contracts and intake state"
```

Expected: all Intake helper tests pass and browser API types import only browser-safe contracts.

## Task 4: Pack Discovery Above Skills

**Files:**
- Create: `src/components/studio/workflow/WorkflowPackSection.tsx`
- Modify: `src/app/studio/skills/page.tsx`

- [ ] **Step 1: Implement independent Pack loading**

`WorkflowPackSection` accepts `scene` and `query`, calls `listWorkflowPacks(scene)`, filters title/summary client-side by the debounced search query, omits itself when the filtered list is empty, and renders its own fixed-height skeleton, retryable inline error, and unavailable reasons. Each card is a normal `Link` to `/studio/packs/<id>?scene=<scene>`.

- [ ] **Step 2: Place Packs above the ordinary Skill result block**

Mount the Pack section inside the main scroll area before the Skills count/grid. Pass `scene` and `debouncedQ`, never `department`. Keep Skill loading/error/empty behavior independent so Pack failure cannot erase Skills and Skill failure cannot erase Packs.

- [ ] **Step 3: Verify static behavior and commit**

Run:

```powershell
npx eslint src/components/studio/workflow/WorkflowPackSection.tsx src/app/studio/skills/page.tsx
npx tsc --noEmit --incremental false
git add src/components/studio/workflow/WorkflowPackSection.tsx src/app/studio/skills/page.tsx
git commit -m "feat: surface workflow packs above skills"
```

Expected: ESLint passes; TypeScript reports no new errors beyond the three pre-existing media-worker `ProcessEnv.NODE_ENV` errors.

## Task 5: Pack Detail Route and Typed Intake Form

**Files:**
- Create: `src/app/studio/packs/[packId]/page.tsx`
- Create: `src/app/studio/packs/[packId]/loading.tsx`
- Create: `src/components/studio/workflow/WorkflowPackPage.tsx`
- Create: `src/components/studio/workflow/WorkflowIntakeForm.tsx`
- Create: `src/components/studio/workflow/WorkflowArtifactPicker.tsx`

- [ ] **Step 1: Add the awaited dynamic route and stable loading state**

The Server page awaits both `params` and `searchParams`, passes plain strings to the narrow Client component, and does not read browser storage.

```tsx
export default async function WorkflowPackRoute({
  params,
  searchParams,
}: {
  params: Promise<{ packId: string }>;
  searchParams: Promise<{ scene?: string; projectId?: string }>;
}) {
  const [{ packId }, query] = await Promise.all([params, searchParams]);
  return (
    <WorkflowPackPage
      packId={packId}
      scene={query.scene?.trim() || undefined}
      requestedProjectId={query.projectId?.trim() || undefined}
    />
  );
}
```

- [ ] **Step 2: Render every Intake contract type**

Use text/URL/number inputs, a native select, checkbox option list, and `WorkflowArtifactPicker`. Labels, descriptions, visible/programmatic required state, `aria-describedby`, field errors, and stable input ids come from the Pack contract. On submit, validate all fields and focus the first invalid control.

- [ ] **Step 3: Implement Artifact and Project selection**

Load `listArtifacts()` and `listProjects()` independently. Artifact rows are filtered by search and declared kinds, expose select/clear/open actions, and preview through a `Modal` containing the existing Artifact metadata/content. Project is optional and a valid requested Project preselects after the list resolves.

- [ ] **Step 4: Implement durable draft and launch errors**

Read and write `sessionStorage` under `workflowDraftKey(pack.id, pack.version)` only after Pack detail loads. Preserve the draft on every failure; clear only after `launchWorkflowPack` succeeds. A version conflict refetches Pack metadata, reconciles compatible fields, and requires a second click. Auth opens the existing login dialog while preserving route/draft. Success calls `router.push('/studio/c/' + session.id)` without a pending chat message.

- [ ] **Step 5: Verify the route and commit**

Run:

```powershell
npx eslint src/app/studio/packs/[packId]/page.tsx src/app/studio/packs/[packId]/loading.tsx src/components/studio/workflow/WorkflowPackPage.tsx src/components/studio/workflow/WorkflowIntakeForm.tsx src/components/studio/workflow/WorkflowArtifactPicker.tsx
npx next build
git add src/app/studio/packs/[packId]/page.tsx src/app/studio/packs/[packId]/loading.tsx src/components/studio/workflow/WorkflowPackPage.tsx src/components/studio/workflow/WorkflowIntakeForm.tsx src/components/studio/workflow/WorkflowArtifactPicker.tsx
git commit -m "feat: add workflow pack intake and launch"
```

Expected: the build generates `/studio/packs/[packId]`; launch remains Session-only with no Run creation.

## Task 6: Pure Workflow View State and Shared Agent Event Reducer

**Files:**
- Create: `src/lib/studio/workflow-state.ts`
- Create: `src/lib/studio/workflow-state.test.ts`
- Create: `src/lib/studio/live-agent-events.ts`
- Create: `src/lib/studio/live-agent-events.test.ts`
- Modify: `src/lib/studio/live-chat-session.ts`
- Modify: `src/lib/studio/live-chat-session.test.ts`

- [ ] **Step 1: Write the Workflow state matrix tests**

Assert labels and primary actions for ready, queued, running, approval, next, revision recovery, completion, failure, cancellation, blocked, and loading. Every transition button must be gated by the projection action union rather than inferred from status.

```ts
expect(toWorkflowViewState(readyProjection)).toMatchObject({
  kind: "ready",
  label: "尚未开始",
  primaryAction: "start",
});
expect(toWorkflowViewState({
  ...failedProjection,
  actions: [],
})).toMatchObject({ kind: "failed", primaryAction: undefined });
```

- [ ] **Step 2: Write failing shared event reducer tests**

Start from one streaming assistant message and assert `plan`, `thinking`, `text_delta`, `tool_call`, `tool_result`, `artifact`, `error`, and `done` produce the same folded UI state that direct chat currently produces.

- [ ] **Step 3: Extract and use the pure reducer**

Move event-to-assistant logic out of `runLiveTurn` into `reduceLiveAgentEvent(state, event)`, returning the next assistant message and side effects (`artifact`, `error`, `terminal`). Direct `/api/chat` SSE and durable replay must call the same function.

- [ ] **Step 4: Run tests and commit**

Run:

```powershell
npx vitest run src/lib/studio/workflow-state.test.ts src/lib/studio/live-agent-events.test.ts src/lib/studio/live-chat-session.test.ts --maxWorkers=1
git add src/lib/studio/workflow-state.ts src/lib/studio/workflow-state.test.ts src/lib/studio/live-agent-events.ts src/lib/studio/live-agent-events.test.ts src/lib/studio/live-chat-session.ts src/lib/studio/live-chat-session.test.ts
git commit -m "refactor: share workflow live event reduction"
```

Expected: direct chat tests remain green and the reducer reports side effects without touching React or browser globals.

## Task 7: First-Stage Start and Durable Run Attachment

**Files:**
- Modify: `src/lib/studio/api.ts`
- Modify: `src/lib/studio/live-chat-session.ts`
- Modify: `src/lib/studio/live-chat-session.test.ts`
- Modify: `src/components/studio/useStudioChat.ts`

- [ ] **Step 1: Write failing Workflow live-store tests**

Assert `startWorkflow` sends only `{ sessionId, workflowAction: "start" }`, never queues, and creates a compact temporary Workflow notice plus one streaming assistant. Assert `attachWorkflowRun` replays after a cursor, deduplicates sequences, terminates on a terminal Run, and does not call cancellation when aborted by unmount.

- [ ] **Step 2: Implement direct first-stage start**

Add `startWorkflowLiveChat(sessionId, stage)` as a separate exported operation. It bypasses ordinary text validation and queue state, calls `streamChat` with `message` omitted and `workflowAction: "start"`, and uses the shared reducer for returned events.

- [ ] **Step 3: Implement cursor-based durable attachment**

Add `attachWorkflowRun(sessionId, runId, stage)` with one attachment per Session/Run. Poll `/api/runs/<id>/events?after=<cursor>` only while queued/running or reconnecting, fold `agent.event.payload.event` through the shared reducer, delay with an abortable 1-second timer when no events arrive, and stop without cancellation on terminal/unmount. Return a cleanup function and a terminal promise to the hook.

- [ ] **Step 4: Expose operations from `useStudioChat`**

Add `startWorkflow(stage)` and `attachWorkflowRun(runId, stage)` while preserving the existing `send` signature for ordinary Sessions.

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npx vitest run src/lib/studio/live-agent-events.test.ts src/lib/studio/live-chat-session.test.ts --maxWorkers=1
git add src/lib/studio/api.ts src/lib/studio/live-chat-session.ts src/lib/studio/live-chat-session.test.ts src/components/studio/useStudioChat.ts
git commit -m "feat: reconnect workflow runs in studio"
```

Expected: disconnect only detaches; it never invokes `/api/chat/stop`.

## Task 8: Session Workflow Controller

**Files:**
- Create: `src/components/studio/workflow/useSessionWorkflow.ts`

- [ ] **Step 1: Implement authoritative projection lifecycle**

The hook accepts Session identity, `useStudioChat` Workflow operations, Session/message refresh, Artifact refresh, and unauthorized handling. It loads projection on mount, refreshes after commands and terminal attachment, refreshes on focus after a 30-second stale interval, and polls only while a known head is queued/running or an attachment is reconnecting.

- [ ] **Step 2: Implement structured actions**

Expose `start`, `stop`, `approve(note?)`, `requestChanges(note)`, `startNext`, `retryStage`, and `refresh`. Use a fresh client idempotency key per explicit click and reuse it only while retrying the same in-flight request. A `409` refreshes projection before surfacing a stale-state message. `requestChanges` rejects blank notes before network access. `startedRunId` triggers durable attachment.

- [ ] **Step 3: Verify static behavior and commit**

Run:

```powershell
npx eslint src/components/studio/workflow/useSessionWorkflow.ts
git add src/components/studio/workflow/useSessionWorkflow.ts
git commit -m "feat: orchestrate workflow session state"
```

Expected: the hook contains no Pack transition inference and exposes server errors separately from chat errors.

## Task 9: Stage Rail, Workflow Control Bar, and Session Integration

**Files:**
- Create: `src/components/studio/workflow/WorkflowStageRail.tsx`
- Create: `src/components/studio/workflow/WorkflowControlBar.tsx`
- Modify: `src/app/studio/c/[sessionId]/page.tsx`

- [ ] **Step 1: Build the projection-only Stage rail**

Use `<ol>` semantics, stable-width desktop items, horizontal overflow, `aria-current="step"`, text+icon status, and reduced-motion-aware `scrollIntoView`. Completed/current stages with output refs open a detail dialog; future stages are non-interactive. Mobile renders one compact trigger row and a `Modal` with all stages, review state, outputs, and only projected actions.

- [ ] **Step 2: Build the Workflow control bar**

Reuse `studio-composer-dock` and `studio-liquid-glass` so the Workflow mode occupies the same dock and visual foundation as Composer without mounting Composer's text/model/Skill/attachment/queue controls. Render fixed-size icon+text actions for ready, running/stop, approval note and revision dialog, next, completed output, failed/cancelled retry, and blocked refresh. Revision note is required; approval note is optional.

- [ ] **Step 3: Integrate with the existing Session shell**

Only Sessions with `session.workflow` load `useSessionWorkflow`. Mount `WorkflowStageRail` below the persistent Session header and above both mobile and desktop work areas. In `renderChatColumn`, render `WorkflowControlBar` for Workflow Sessions and the existing `Composer` unchanged for ordinary Sessions. Output clicks set `selectedId`, open the Works rail, and switch mobile to Works.

- [ ] **Step 4: Reconcile terminal state**

After terminal events, refetch the Session bundle and Artifacts before clearing streaming indicators. Preserve the existing Chat/Works mobile switch, View Transition names, ArtifactPreview, retry-generation behavior for ordinary messages, and ordinary Composer queue.

- [ ] **Step 5: Run focused static checks and commit**

Run:

```powershell
npx eslint src/components/studio/workflow/WorkflowStageRail.tsx src/components/studio/workflow/WorkflowControlBar.tsx src/app/studio/c/[sessionId]/page.tsx
npx vitest run src/lib/studio/workflow-state.test.ts src/lib/studio/live-agent-events.test.ts src/lib/studio/live-chat-session.test.ts --maxWorkers=1
git add src/components/studio/workflow/WorkflowStageRail.tsx src/components/studio/workflow/WorkflowControlBar.tsx src/app/studio/c/[sessionId]/page.tsx
git commit -m "feat: add workflow controls to studio sessions"
```

Expected: ordinary Sessions still render the original Composer; Workflow Sessions cannot submit arbitrary chat turns.

## Task 10: End-to-End Verification and Visual Acceptance

**Files:**
- Modify only files that fail a check within the Phase 3 scope.

- [ ] **Step 1: Run the complete focused Workflow suite**

Run:

```powershell
npx vitest run src/lib/agent/production-packs src/app/api/packs src/app/api/sessions/[id]/workflow src/app/api/runs/[id]/events src/lib/agent/runtime.workflow.test.ts src/lib/studio/workflow-intake.test.ts src/lib/studio/workflow-state.test.ts src/lib/studio/live-agent-events.test.ts src/lib/studio/live-chat-session.test.ts --maxWorkers=1
```

Expected: all focused tests pass.

- [ ] **Step 2: Run repository verification**

Run separately so load-only timeouts can be classified:

```powershell
npm test
npm run lint
npm run build
npx tsc --noEmit --incremental false
git diff --check
```

Expected: tests/lint/build pass; independent TypeScript has only the three pre-existing media-worker `ProcessEnv.NODE_ENV` errors; diff check passes apart from Windows line-ending warnings.

- [ ] **Step 3: Start a local server and run Playwright desktop acceptance**

Use an unused port and verify `/studio/skills`, `/studio/packs/content-office`, and a launched Workflow Session at 1440x900. Check Pack band ordering, unavailable state, every Intake field, draft survival, Session-only launch, Stage rail, explicit first start, stop, review/revision, next, retry, Workflow notice, and Artifact opening. Inspect browser console and failed requests.

- [ ] **Step 4: Run Playwright mobile acceptance**

At 390x844, verify no text/control overlap, one-column Pack form, reachable submit, compact Stage trigger, focus-trapped Stage dialog, unchanged Chat/Works switch, Workflow control bar safe-area spacing, and final Artifact opening. Capture screenshots for both viewports.

- [ ] **Step 5: Final scope and history audit**

Run:

```powershell
git status --short
git diff --stat origin/master...HEAD
git log --oneline --decorate origin/master..HEAD
```

Expected: only Workflow Pack Phase 1-3 files and docs are present; `scheduleRun`/cron files and unrelated original-checkout changes are absent.

## Acceptance Traceability

- Discovery IA, scene/search filtering, independent failures: Tasks 4 and 10.
- Stable Pack route, typed Intake, Artifact/Project selectors, draft/error handling: Tasks 3, 5, and 10.
- Session creation without a Run and explicit first start: Tasks 5, 7, and 10.
- Persisted-state Stage rail and Artifact-first output opening: Tasks 6, 8, 9, and 10.
- Approve, required revision note, explicit next, stop, retry, stale `409`: Tasks 1, 8, 9, and 10.
- Durable Run replay and remount/focus recovery: Tasks 6, 7, 8, and 10.
- Canonical prompt persistence with compact transcript presentation: Task 2 and Task 10.
- Ordinary Session/Composer non-regression: Tasks 6, 7, 9, and 10.
- Accessibility, reduced motion, desktop/mobile layout: Tasks 4, 5, 9, and 10.
- `scheduleRun` exclusion: every task and final scope audit.
