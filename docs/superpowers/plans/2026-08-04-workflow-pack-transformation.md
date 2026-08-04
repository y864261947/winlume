# Workflow Pack Transformation Plan

**Goal:** Evolve WinLume from free chat plus small Skills into an artifact-first AI workbench where professional scenarios are delivered as observable, versioned Workflow Packs.

**Non-goals:** `scheduleRun`/cron, external publishing, arbitrary generated UI, a broad marketplace, and fixed ecommerce dashboards.

## Product Model

- `WorkScene` is a discovery and recommendation lens.
- `WorkflowPack` is a versioned, staged production contract.
- `Skill` supplies stage instructions, tools, inputs, outputs, and quality rules.
- `Tool/App` is a focused capability that creates or transforms Artifacts.
- `Connector` owns external data and side effects.
- `Artifact` is the durable stage output and handoff boundary.
- `AgentRun` represents one actual Stage execution or revision and remains its recovery boundary.

The invariant is:

```text
conversation = intent and control
artifact = work and delivery
session = workflow identity, pre-execution selection, and intake
run = one active Stage execution or revision
```

## Correct Launch Boundary

Pack selection and intake happen before execution, so launch must not create a placeholder Run.

```text
Pack detail
  -> validate Pack version, availability, intake, Project, and input Artifacts
  -> create or reuse Session
  -> persist Session.workflow { workflowId, packId, packVersion, intakeValues }
  -> return Session plus initial stage projection

First stage start
  -> reload and validate the Session binding
  -> create AgentRun idempotently
  -> copy immutable launch data and first Stage state into run.metadata.production
  -> enqueue the first real stage
```

This separates configuration from execution and prevents empty Runs from appearing in recovery, billing, cancellation, or activity views.

Each later Stage or requested revision creates a new Run with a stable idempotency key and `predecessorRunId`. Existing terminal Run semantics remain unchanged. Approval waiting is production state between Runs; Phase 1 does not keep a Run in the infrastructure `waiting_approval` status.

## State Ownership

### Session-owned before execution

`Session.workflow` is an optional, validated binding:

- `packId`
- `packVersion`
- `workflowId`
- `intakeValues`
- `inputArtifactIds`
- `boundAt`

The server resolves Pack stages, Skills, tools, capabilities, and policy. The client cannot persist those authority-bearing values.

### Run-owned during execution

Each `AgentRun.metadata.production` contains an immutable snapshot for one execution:

- Pack id/version and immutable intake snapshot
- current and completed Stage ids
- selected server-resolved Skill ids
- predecessor Run id and iteration number
- Stage input and output Artifact ids
- structured reviews and revision counts
- append-only user/system decisions

The production iteration count is distinct from the infrastructure Run `revision`, which advances for leases and persisted events. Ordinary non-Pack Runs remain valid without `metadata.production`.

## Delivery Sequence

### Phase 1: Stable server foundation

1. Extend Pack manifests with typed intake, expected deliverables, and stage handoff summaries.
2. Add typed Session workflow binding and backward-compatible file persistence.
3. Add Pack list/detail/launch APIs with server-side ownership and availability validation.
4. Add typed per-execution production metadata and pure workflow transition helpers.
5. Create the first real AgentRun only when the first Stage starts; create later Runs per Stage or revision.

Exit criteria:

- Existing content-office Pack remains valid after migration.
- A validated Pack can be bound to a user-owned Session without creating a Run.
- Invalid intake, unavailable capabilities, wrong Pack version, and cross-user Artifacts are rejected.
- Production metadata can derive the next Run from persisted JSON and rejects malformed transitions.
- Direct Skill launch and ordinary chat behavior remain unchanged.

Phase 1 implementation status on `codex/workflow-pack-transformation`:

- Implemented: versioned Pack contract, graph validation, Session binding, list/detail/launch APIs, first-stage Run creation, typed production metadata, pure approval/next-stage transitions, and server-owned model/Skill/tool execution policy.
- Enforced at runtime: Workflow Skills replace Project/Session pins; effective tools must be allowed by the Pack Stage, referenced Skill contracts, available capabilities, and the platform tool catalog; every emitted tool call is checked again by the coordinator.
- Superseded by Phase 2: runtime Artifact output mapping, Stage finalization, approval/revision/next-stage commands, successor Runs, and durable recovery are now server-side behavior. Studio workflow UI remains Phase 3 work.

### Phase 2: Canonical execution and handoff

Server implementation status: delivered and verified on 2026-08-04. The implementation boundary is intentionally server-first and does not include the Phase 3 Studio UI.

1. Artifact provenance and declared output ids
   - `write_artifact`, `generate_image`, and `generate_canvas` accept a Pack-compatible `outputId` and write the durable Workflow provenance tuple: `workflowId`, `runId`, `stageId`, and `outputId`.
   - A non-Workflow Run cannot supply `outputId`. In a Workflow Run the server selects the only compatible output when unambiguous, and rejects an omitted id when multiple compatible declared outputs exist.
   - The runtime injects the server-owned output contract into the system prompt, including every output id, allowed kind, and required flag. The model is told to set `outputId`; the server remains the authority and verifies it again.

2. Atomic Stage finalization and asynchronous Artifact semantics
   - `completeRun` finds Artifacts only through matching provenance, then validates owner/session scope, Project, Workflow/Run/Stage/output ids, declared kind, required outputs, and `ready` state. It never infers a Stage result from Artifact names, timestamps, or chat prose.
   - After those durable Artifact checks, the Run's production metadata, terminal status, and status event are committed by one `transitionRun` write. Revision conflicts caused by infrastructure writes are re-read and retried during finalization rather than immediately turning a completed executor turn into a failure.
   - Invalid, missing, wrong-kind, cross-Project, or non-ready outputs terminally fail the Run with structured production state and a non-retryable error.
   - A Workflow image call waits for its generation jobs and rereads their persisted state before returning to the Stage; ordinary chat image calls keep their existing immediate-pending behavior. A Workflow canvas is a new Artifact whose Mermaid source is the durable deliverable and is marked ready without waiting for browser-side Excalidraw hydration. Workflow canvas updates do not modify an older Run's output Artifact.

3. Durable decisions, concurrency, and new Run chains
   - `POST /api/sessions/[id]/workflow` provides strict, authenticated `approve`, `request_changes`, and `start_next` commands and requires `Idempotency-Key`. Client-supplied authority fields such as Stage, model, Skills, and tools are rejected by the strict command schema.
   - The production `decisions` array is the durable command ledger: the idempotency key is stored as a decision id with action, actor, and note semantics. Reusing it for a different action, actor, or note is rejected. Revision-CAS updates re-read and retry concurrent decisions, while successor creation uses stable `workflow:<workflowId>` plus `stage:<stageId>:iteration:<n>` Run keys.
   - `approve` finishes an approval-gated Stage; `request_changes` records a structured review decision and creates or reuses the next iteration of the same Stage; `start_next` creates or reuses the following Stage. Every revision or next Stage is a new Run with `predecessorRunId`, canonical input Artifact ids, and server-resolved Pack/Skill/capability/platform-tool execution policy.
   - `request_changes` is deliberately recoverable as a two-step action. If the parent has already persisted `needs_revision` but creation of its successor is interrupted, the head exposes `request_changes` again; resubmitting the same change request reuses the stable Stage/iteration Run key instead of creating a duplicate. This is not claimed as a cross-Run all-or-nothing transaction.

4. Durable recovery, Pack snapshots, and strict projection
   - On local-worker restart, a running Workflow Run with a durable `agent.event` `done(completed)` event is finalized from its persisted Artifacts without replaying model execution. A running Run without that proof follows the normal interrupted-worker terminal path.
   - New Session bindings and production Runs persist an immutable Pack snapshot. Resolution prefers that snapshot, so a later registry publication cannot change the contract of an already launched Workflow. Legacy records without a snapshot retain the exact-version registry fallback and fail when that version is unavailable.
   - `GET /api/sessions/[id]/workflow` rebuilds a sanitized projection from persisted state only. It fails rather than guessing when the Pack/version or Stage is unavailable, matching Runs have multiple heads, an output is undeclared, or a persisted output Artifact has the wrong owner/session/Project, Workflow/output provenance, kind, or readiness. It exposes only public Pack metadata, current Stage, Run state, displayable output refs, review, and available actions.

5. Review boundary and deferred UI
   - Until Phase 4 produces structured blocking-review results, both `required` and `on-blocking-review` conservatively enter `awaiting_approval` and require an explicit human `approve` or `request_changes` decision. No Markdown review text is parsed to decide whether a Stage may advance.
   - `scheduleRun`/cron remains outside this Phase and is unchanged.
   - Phase 3 is not implemented: there is no Pack discovery/intake screen, Studio stage rail, or Studio approve/revise/recovery control surface yet. The current APIs and projection are the server contract those views will consume.

### Phase 3: First-class Studio workflow

1. Show Pack cards above ordinary Skills for matching scenes.
2. Add Pack detail and intake UI with stable deep links.
3. Add a compact stage rail to the existing conversation/artifact Studio shell.
4. Add structured approve, revise, stop, blocked, empty, and recovery states.

The stage rail is a projection of persisted state, not a new domain dashboard.

### Phase 4: Lineage, review, and first commerce Pack

1. Extend Phase 2 Workflow provenance with Artifact parent/source/version lineage across transformations.
2. Add deterministic checks plus structured AI review records.
3. Ship `growth-commerce-launch`:

```text
intake
  -> market-research
  -> unit-economics
  -> listing
  -> claim-review
```

Outputs include a research brief, economics/comparison Artifact, listing copy, visual direction, and structured claim review. Human approval is required before describing output as publish-ready. External publishing remains out of scope.

### Phase 5: Profiles and unified capability catalog

After the first Pack works end to end:

1. Add reusable, server-governed Agent Profiles.
2. Distinguish Skills, Packs, Tools, Profiles, and Connectors in discovery.
3. Ensure every catalog action has a real destination or setup state.

## Phase 1 File Plan

### Pack contract

- Modify `src/lib/agent/production-packs/contracts.ts`
- Modify `src/lib/agent/production-packs/contracts.test.ts`
- Modify `src/lib/agent/production-packs/registry.ts`
- Modify `src/lib/agent/production-packs/registry.test.ts`
- Modify `content/production-packs/content-office/pack.json`
- Verify `src/lib/agent/production-packs/content-office-assets.test.ts`

Contract requirements:

- Strict bounded intake field types: `text`, `url`, `number`, `select`, `multi_select`, `artifact`.
- Unique intake ids and type-correct options.
- Pack-level expected Artifacts.
- Stage-level human-readable handoff summary.
- Public metadata never includes Skill prompt bodies.

### Session binding

- Modify `src/lib/agent/types.ts`
- Modify `src/lib/host/ports.ts`
- Modify `src/lib/host/web/file-store.ts`
- Modify `src/lib/host/web/file-store.test.ts`
- Create `src/lib/agent/production-packs/session-binding.ts`
- Create `src/lib/agent/production-packs/session-binding.test.ts`

Binding requirements:

- Parse and normalize untrusted intake by Pack schema.
- Reject unknown fields, missing required values, wrong types, invalid options, and duplicate Artifact ids.
- Persist only normalized values.
- Preserve legacy Session JSON with no workflow binding.

### Pack APIs

- Create `src/app/api/packs/route.ts`
- Create `src/app/api/packs/route.test.ts`
- Create `src/app/api/packs/[id]/route.ts`
- Create `src/app/api/packs/[id]/route.test.ts`
- Create `src/app/api/packs/[id]/launch/route.ts`
- Create `src/app/api/packs/[id]/launch/route.test.ts`
- Modify `src/lib/studio/api.ts`

API requirements:

- Follow current Next.js App Router route-handler conventions; dynamic `params` are asynchronous.
- Authenticate every endpoint.
- List/detail return validated public Pack metadata only.
- Launch validates the requested Pack/version and capability availability on the server.
- Project, existing Session, and Artifact ids are checked in the current user's stores.
- Repeated launch against the same Session and same normalized binding is idempotent.
- Rebinding a Session with messages or an active Run is not silently allowed.
- Launch returns no `runId`; the initial stage is a derived projection.

### Production run state

- Create `src/lib/agent/production-packs/run-metadata.ts`
- Create `src/lib/agent/production-packs/run-metadata.test.ts`
- Modify `src/lib/agent/infrastructure/types.ts` only if a shared typed metadata hook is required.
- Modify coordinator/service and tests only at the first-stage start integration point.

State requirements:

- Validate persisted JSON before use.
- Keep Stage transitions pure and idempotent; callers provide time and decision ids.
- Enforce required input Artifacts and declared outputs.
- Record reviews, iterations, predecessor Run ids, and decisions structurally.
- Let each Run complete normally; represent approval waiting between Runs in production state.
- Use stable workflow/stage/iteration idempotency keys when submitting the next Run.
- Leave ordinary Run lifecycle semantics unchanged.

## Verification

Run focused tests per slice, then:

```powershell
npm test
npm run lint
npm run build
```

The historical baseline below had two known parallel-load-only 5-second timeouts (`skills/registry` and `gateway/server`); both passed when rerun independently. A changed test must pass in focused mode and full-suite failures must be classified rather than hidden by increasing global timeouts.

Historical Phase 1 verification snapshot from 2026-08-04. These figures are not Phase 2 sign-off and must be refreshed after the final Phase 2 code review:

- Focused Workflow Pack/runtime suite: 13 files, 65 tests passed.
- Full suite: 367 of 370 tests passed in one parallel run; the three failures were the known 5-second timeouts in `skills/registry` and `gateway/server`, and both files passed independently (4/4 and 8/8).
- Changed-file ESLint: passed with no errors or warnings.
- Production build: passed, including Next.js TypeScript and route generation for `/api/packs`, `/api/packs/[id]`, and `/api/packs/[id]/launch`.
- Independent `tsc --noEmit --incremental false`: only the three pre-existing `services/media-worker/src/config.test.ts` `ProcessEnv.NODE_ENV` errors remain.
- `git diff --check`: passed; only expected Windows line-ending notices were emitted.

Phase 2 final verification on 2026-08-04:

- Focused Workflow Pack/runtime/infrastructure/API suite: 19 files, 114 tests passed at `--maxWorkers=1`.
- Full suite: 384 of 388 tests passed in one parallel run. Four 5-second timeouts occurred under load: Coordinator Workflow finalization (1), Skill registry (2), and Gateway server (1). Those three files passed together at low load: 3 files, 24 tests.
- Changed-file ESLint: passed with no errors or warnings.
- Production build: passed, including Next.js TypeScript, static generation, and route generation for `/api/packs`, `/api/packs/[id]`, `/api/packs/[id]/launch`, and `/api/sessions/[id]/workflow`.
- Independent `tsc --noEmit --incremental false`: only the three pre-existing `services/media-worker/src/config.test.ts` `ProcessEnv.NODE_ENV` errors remain.
- `git diff --check`: passed after the final documentation refresh; only expected Windows line-ending notices were emitted.

## Key Risks

- Treating Pack launch as execution would pollute Run history and billing semantics.
- Trusting client-supplied Skills/tools/capabilities would bypass server policy.
- Parsing chat prose for progress would make resume and review nondeterministic.
- Treating the persisted decision ledger as a cross-Run transaction would hide the recoverable `needs_revision` handoff boundary.
- Treating the server projection as a delivered Studio workflow would overstate Phase 3; the interaction surface is still pending.
- Putting ecommerce-specific fields on Artifact renderers would break the general workbench direction.
- Expanding the first batch into lineage, marketplace, Profiles, and publishing would prevent the core state boundary from stabilizing.
