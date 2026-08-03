# Production Skill Platform Design

## Status

Proposed design. This document defines the implementation boundary for the
next Skill-platform release; it does not change the current Studio runtime.

## Context

WinLume already has three independent product dimensions:

| Dimension | What it controls |
| --- | --- |
| Artifact kind | Preview, editing, storage, and export behavior for Markdown, image, canvas, video, and other artifacts |
| Work scene | Discovery and starting context for a task, such as content-office or video-creation |
| Capability preset | A validated launch configuration, including the effective chat or media model and supported tools |

The current `content/skills/*/SKILL.md` collection is useful for discovery,
but its runtime contract is intentionally narrow: a selected Skill is parsed
as metadata plus a prompt body and appended to the Studio system prompt. It
does not declare which tools it needs, which artifacts it produces, how output
is checked, when a human approval is required, or how work resumes after an
interruption. Long generic role prompts therefore do not turn into reliable
workflows.

The reference projects point to a stronger model: capability-aware,
stage-specific instruction packs; declarative workflow definitions; canonical
artifacts between stages; evidence-based review; and persistent run state.
WinLume will recreate those mechanisms natively. It will not copy third-party
source, prompt text, or branded materials, and it will not execute unreviewed
third-party Skills.

## Goal

Turn selected work scenes into observable, resumable production workflows while
keeping Studio Artifact-first and general-purpose:

- A scene helps a user begin with the right Skills and expected deliverables.
- An Artifact remains usable according to its own kind, regardless of scene.
- A production Skill declares its real inputs, outputs, capability needs, and
  quality bar.
- A production Pack advances through explicit stages, records decisions, and
  asks for approval where proceeding autonomously would be consequential.
- The UI shows the state actually held by a run and its artifacts; it is not a
  second manually maintained workflow dashboard.

## Non-goals

- Do not turn the five work scenes into mutually exclusive industries or
  vertical products.
- Do not rewrite all existing bundled Skills before the new platform proves
  itself on the first Packs.
- Do not imply that selecting a chat model also changes the effective model for
  image, audio, or future video generation.
- Do not import upstream repositories as executable Skill packages, grant
  third-party instructions credentials, or expose arbitrary global tools.
- Do not build a separate job system. Reuse the existing durable run, event,
  lease, retry, and `waiting_approval` infrastructure.

## Options Considered

### 1. Expand the existing prompt body only

Add more detailed role instructions to the current Skills and retain the
current prompt-concatenation runtime.

This has the least code cost but does not solve the core reliability gap:
there is still no tool contract, output validation, approval state, or
structured resume point. It is not selected.

### 2. Copy or install third-party Skill libraries

Bring whole upstream repositories into `content/skills` and expose every
instruction as an installed capability.

This would make quality and ownership opaque, creates unbounded prompt/tool
authority, and would mix license and provenance concerns into the product.
The curated repository is an index rather than an audited runtime package. It
is not selected.

### 3. Native Production Packs over compatible Skill Packages

Keep existing v1 Skills working, add structured v2 manifests for selected
first-party Skills, and compose them in declarative Production Packs executed
by the existing run infrastructure.

This is selected. It gives a useful first release without a risky mass
migration, preserves current Studio behavior for ordinary conversations, and
creates a clear path for production quality.

## Product Model

### Work scenes and Production Packs

The five homepage work scenes remain the first discovery layer:

| Scene ID | Label | Initial Pack outcomes |
| --- | --- | --- |
| `content-office` | 内容与办公 | researched brief, document or presentation outline, review record |
| `growth-commerce` | 增长与电商 | campaign brief, product copy, listing image direction, review record |
| `video-creation` | 视频创作 | concept, script, storyboard canvas, visual-reference brief |
| `developer-api` | 开发与 API | implementation plan, API contract, code or patch, validation record |
| `agent-automation` | Agent 自动化 | agent brief, workflow design, integration plan, operational checklist |

A scene may recommend several Packs and a Pack may be discoverable from one or
more scenes. Scene membership never controls Artifact renderers or disables
ordinary Studio controls.

Each Pack follows the same high-level lifecycle:

```text
intake -> proposal -> produce -> review -> approve or revise -> next stage / complete
```

Stages may be skipped only when their manifest condition says their required
input is absent or unnecessary. A production run always records why a stage was
skipped, completed, revised, or blocked.

### Skill Package v2

Each production Skill has a short entry instruction and an adjacent structured
manifest. Large reference material lives in relative resource files and is
loaded only by a stage that needs it.

```text
content/skills/<skill-id>/
  SKILL.md
  skill.json
  resources/
    <focused-reference>.md
```

`SKILL.md` remains the human-readable operating instruction. `skill.json` is
the machine-readable contract, validated when the registry loads it. Existing
v1 Skill directories that have only `SKILL.md` remain valid and receive a
compatibility contract with no production guarantees.

The v2 manifest has this logical shape:

```ts
type ProductionSkillManifest = {
  schemaVersion: 2;
  id: string;
  version: string;
  title: string;
  description: string;
  stability: "experimental" | "stable";
  scenes: string[];
  provenance: {
    owner: "winlume";
    source: "first-party" | "reviewed-import";
    upstream?: { repository: string; revision: string; license: string };
  };
  entryInstruction: "SKILL.md";
  resources?: Array<{ path: string; when: string }>;
  requiredCapabilities: string[];
  allowedTools: string[];
  inputs: ArtifactRequirement[];
  outputs: ArtifactExpectation[];
  qualityChecks: QualityCheck[];
  approvalPolicy: "none" | "on-blocking-review" | "required";
};
```

The parser rejects path traversal, unknown capability ids, unsupported tool
ids, duplicated output ids, and malformed JSON. It does not trust a manifest
to grant access to a tool. A manifest declares intent; the runtime makes the
allow decision.

### Capability Registry

Capability names and their real availability become a central server-side
registry. The registry is the single source for homepage API choices, Pack
launch eligibility, and stage tool selection.

```ts
type CapabilityAvailability = "available" | "degraded" | "needs_setup" | "unavailable";

type CapabilityRecord = {
  id: string;
  label: string;
  availability: CapabilityAvailability;
  effectiveModel?: string;
  supportedTools: string[];
  reason?: string;
  setupHint?: string;
};
```

For a stage, the executable tool set is the intersection of:

1. tools globally implemented by Studio,
2. tools allowed by the selected Pack stage,
3. tools permitted by selected Skills, and
4. tools backed by capabilities that are currently `available`.

This prevents the UI from offering a model or a video-generation stage merely
because its label exists. `video-creation` initially produces research,
script, storyboard, and visual-plan artifacts. It can add actual generation or
render stages only after the corresponding capability registry entry is live.

### Production Pack manifest

A Pack is a first-party declarative workflow. It does not contain free-form
business logic and does not directly invoke providers.

```ts
type ProductionPackManifest = {
  schemaVersion: 1;
  id: string;
  version: string;
  sceneIds: string[];
  title: string;
  summary: string;
  expectedArtifacts: ArtifactExpectation[];
  requiredCapabilities: string[];
  stages: Array<{
    id: string;
    title: string;
    objective: string;
    skillIds: string[];
    requiredInputs: ArtifactRequirement[];
    outputs: ArtifactExpectation[];
    allowedTools: string[];
    qualityChecks: QualityCheck[];
    approvalPolicy: "none" | "on-blocking-review" | "required";
    maxAutomaticRevisions: number;
  }>;
};
```

Each stage selects narrow, task-specific instruction packs rather than one
generic expert persona. For example, video creation uses separate brief,
script, storyboard, and review Skills. A stage passes canonical Artifact ids
and recorded decisions forward, not only an unbounded transcript.

### Run state and recovery

The existing `AgentRun` model remains the durable envelope. A namespaced
`metadata.production` object records:

```ts
type ProductionRunMetadata = {
  packId: string;
  packVersion: string;
  currentStageId: string;
  completedStageIds: string[];
  selectedSkillIds: string[];
  capabilitySnapshot: Array<{ id: string; availability: string; effectiveModel?: string }>;
  decisions: Array<{ id: string; stageId: string; summary: string; decidedAt: string }>;
  stageArtifacts: Record<string, string[]>;
  reviews: Record<string, ReviewResult>;
  revisionCounts: Record<string, number>;
};
```

The event stream receives typed production events for stage start, output
written, review completed, approval requested, approval decided, and stage
completed. A worker resumes from persisted metadata and artifact ids after a
lease handoff or retry; it does not infer progress from chat text. The existing
idempotency key and revision checks protect stage transitions from duplicates.

### Quality checks and review

Every stage runs checks before it can advance:

1. **Deterministic checks** validate required inputs, expected Artifact kinds,
   required structured fields, and actual capability availability.
2. **Structured review** evaluates the declared quality criteria and emits
   evidence, severity, and a concrete correction for each finding.

```ts
type ReviewResult = {
  outcome: "pass" | "revise" | "blocked";
  findings: Array<{
    severity: "blocking" | "major" | "minor";
    criterion: string;
    evidence: string;
    requiredFix: string;
  }>;
};
```

The runtime permits at most two automatic revision attempts per stage. A
blocking result, exhausted revision limit, or a manifest policy of `required`
transitions the existing run to `waiting_approval`. The user can approve the
current output, request revision with notes, or stop the run. Resume uses the
same run and the same completed artifacts.

## User Experience

### Homepage and Skills hub

The homepage design already defines `/studio?preset=<id>` for valid capability
presets and `/studio/skills?scene=<id>` for work scenes. The Pack platform
extends the latter:

- The Skills hub shows the selected scene, recommended Packs, expected output
  artifacts, required capabilities, stability, and review/approval policy.
- Search intersects with the scene filter; a direct Skill start remains
  available for ordinary, non-Pack use.
- A Pack that needs an unavailable capability is visible but marked with its
  concrete setup state and cannot begin a stage that would falsely claim it is
  executable.

### Studio

Starting a Pack opens Studio with a deliberate starting state, not an
auto-executing agent:

- intake fields and selected inputs appear before the run starts;
- a compact stage rail reflects the persisted current stage;
- generated artifacts are shown in the normal Artifact area and can still be
  edited, exported, or referenced independently;
- review findings name the failed criterion and the evidence, rather than
  showing a generic error;
- approval, revise, and stop controls are available only while the run is in
  the corresponding persisted state.

The Studio page does not need a separate Pack dashboard. Its rail, artifact
list, and controls are projections of `AgentRun`, run events, and Artifact
state.

## Initial Pack Content

The first production release creates first-party, stage-specific Skills for
the following Packs. These are new focused operating instructions with
contracts and resources, not copies of external prompts.

| Pack | Required stages | Canonical outputs |
| --- | --- | --- |
| Content and office | intake, research, outline/draft, editorial review | Markdown brief and document/presentation outline |
| Growth and commerce | intake, audience/product analysis, campaign or listing production, claim review | Markdown plan, copy sheet, optional image direction |
| Video creation | intake, creative direction, script, storyboard, visual-plan review | Markdown script, canvas storyboard, reference-image brief |
| Developer and API | intake, architecture/API contract, implementation, validation review | Markdown plan/API contract, code or patch Artifact, validation record |
| Agent automation | intake, workflow design, tool/integration mapping, operational review | agent brief, workflow Artifact, operations checklist |

Actual image, canvas, and video actions occur only where their capability
record supports the relevant existing Studio tool. A Pack can complete with
Markdown and canvas artifacts without pretending that a future video renderer
exists.

## Source and Ownership Policy

The initially shipped Packs are first-party and versioned with WinLume.
External examples can inform a reviewed intake queue later, but they are not
installed directly into production.

Any future reviewed import must pin an upstream repository and revision,
record its applicable license and checksum, identify a WinLume owner, declare
all requested capabilities/tools, pass static content review, and be converted
into the native manifest/resource layout before enabling. No imported content
can receive secrets, provider credentials, filesystem-wide authority, or a
tool that its native contract and capability registry do not allow.

## Migration Plan

### Phase 1: contracts and discovery

- Add v2 manifest types, validation, capability registry, and Pack registry.
- Keep v1 `SKILL.md` discovery and ordinary prompt injection fully compatible.
- Extend the Skills API and page to expose scene/Packs and capability state.
- Finish the homepage API-preset and work-scene handoffs from the preceding
  design as the entry point.

### Phase 2: one end-to-end Pack

- Implement the content-office Pack on the existing durable run coordinator.
- Add stage events, deterministic checks, structured review, approval, and
  resume behavior.
- Validate its Studio rail and Artifact flow before duplicating the runtime
  for additional Packs.

### Phase 3: remaining first-party Packs

- Add growth-commerce, video-creation, developer-api, and agent-automation
  manifests and stage-specific Skills.
- Reuse the same contracts, reviewer output, and runtime paths rather than
  adding per-scene executors.
- Enable media stages only as backed capabilities become available.

### Phase 4: controlled external intake

- Build an internal review queue only after the first-party model is proven.
- Preserve source/revision/license/checksum and approval history for every
  candidate. No marketplace auto-install or arbitrary code execution is in
  scope for this phase.

## Expected Implementation Scope

The implementation plan should verify current APIs and narrow the final file
list, but the expected areas are:

- `src/lib/agent/skills/parse.ts`, `registry.ts`, and `inject.ts`
- new Skill manifest/contracts and capability-registry modules under
  `src/lib/agent/`
- Pack definitions and stage execution adapters under `src/lib/agent/`
- `src/lib/agent/infrastructure/types.ts` and coordinator/event consumers
- `src/app/api/skills/route.ts` and the existing run APIs
- `src/components/ModelMarket.tsx`, `src/app/studio/skills/page.tsx`, and
  `src/app/studio/page.tsx`
- focused unit, route, runtime, and browser-flow tests

No bulk edit of all `content/skills/**/SKILL.md` files is part of Phase 1.
Unrelated dirty files remain out of scope.

## Acceptance Criteria

- Existing v1 Skills continue to load, list, filter, and inject exactly as
  before when a Pack is not selected.
- A v2 manifest with an invalid capability, tool, resource path, or output
  contract fails validation and is not launchable.
- A scene URL shows the corresponding recommended Packs and Skill set after a
  reload; search still intersects predictably with the scene filter.
- A Pack never offers a stage whose required capability is unavailable, and
  its UI states the real reason.
- A completed stage records expected Artifact ids and a review result before
  the coordinator advances.
- A blocking review, approval-required stage, or exhausted revision limit puts
  the same run into `waiting_approval`; approval/revision resumes it without
  duplicate stage outputs.
- Run recovery after retry or worker lease handoff resumes from persisted
  stage/artifact metadata rather than replaying the whole conversation.
- Homepage model choices and media presets remain validated against the same
  capability registry used by Pack stages.
- Artifact rendering and editing remain determined by Artifact kind, never by
  scene or Pack id.
