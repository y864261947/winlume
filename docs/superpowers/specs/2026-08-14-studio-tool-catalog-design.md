# Studio Tool Catalog Design

**Status:** Draft, pending review
**Date:** 2026-08-14
**Scope:** Image-only, single-purpose AI tools, exposed through two entry surfaces: a fixed-form Tool page and the existing Composer. The first release is 抠图/背景移除, 水印或字幕清理, 路人移除, and AI 变清晰.
**Explicit non-goals:** video generation/reproduction, garment try-on, title generation, arbitrary-mask inpainting, infinite/node canvas tool composition, and migrating chat transport to AI SDK's native multi-step tool loop.

## 1. Outcome

Studio gains a "全部工具" catalog of single-purpose AI image operations, modeled on the reference competitor surface (left-nav tool list, per-tool fixed form, reference-image + description + parameters + generate). The first catalog contains background removal, watermark/subtitle cleanup, person removal, and image clarity; the larger image/video catalog follows only after this path has production evidence.

Every tool is implemented once as a backend capability and reachable through two independent entry surfaces that share it:

```text
Tool catalog entry -> ToolDefinition (schema + executor)
                    -> Tool page:  /studio/tools/[toolId]   (fixed form, direct call)
                    -> Composer:   function-calling tool     (model-invoked, chat)
```

There is no third, workflow-session-based entry surface. The existing Workflow Pack (Stage/AgentRun/approval) machinery is explicitly not reused — see §6.

## 2. Confirmed Product Decisions

- Each tool is defined once as a backend capability (schema + executor) and invoked identically from both entry surfaces. Neither surface re-implements a tool's business logic.
- Release-one deterministic tools (抠图/背景移除, 水印或字幕清理, 路人移除, AI变清晰) execute as a direct, synchronous-feeling call — no chat Session, no LLM reasoning round, no approval gate — when launched from the Tool page. They follow the existing `video-analyses` request/job/callback pattern, not the Workflow Pack session-binding pattern.
- Future semantic/generative tools (AI融图, 服装上身, 风格转换, 标题生成, 视频复刻, 侵权检测) will use ordinary agent function-calling (the `generate_image` pattern: pending artifact returned immediately, resolves asynchronously) only after each capability has an approved provider and product design.
- The Workflow Pack Stage/AgentRun/approval system is not extended or reused for this feature. Its every-transition-is-a-manual-click design and its total replacement of the Composer surface (§3.1 below) are why the prior workflow-in-Composer attempt read as bad UX; this is a different problem shape (lightweight, user-driven tool use) and gets a different, simpler mechanism.
- The Composer keeps its normal, general-purpose shell at all times. There is no Workflow-style mode swap. Tools are exposed to the model as ordinary OpenAI-compatible function schemas, added to the per-turn `tools` array either by explicit user selection or by lightweight keyword pre-filtering (§3.2) — never as a fixed, always-on set once the catalog exceeds a handful of entries.
- Chaining multiple tools in one user turn ("抠图、去水印、最后变清晰") relies on the existing `runAgentTurn` multi-round tool loop (`src/lib/agent/runtime.ts`, `MAX_TOOL_ROUNDS = 8`), which already streams the model, executes tool calls, feeds results back, and re-prompts — up to 8 rounds — within a single turn with no new user message required. No new runtime plumbing is needed for chaining itself.
- Each deterministic tool's executor must resolve its actual output synchronously within its tool-call round before the loop continues. Unlike `generate_image`'s "return a pending artifact id, render later" pattern (fine when the result is the end of the turn), a chained tool's output is the *input* to the next tool call, so the next round cannot proceed against a placeholder.
- **Supplier decision for image MVP:** Aliyun Visual Intelligence Open Platform (VIAPI) is the primary provider. Baidu AI Open Platform is retained as a benchmark and a future fallback candidate, but is not a release-one integration. This gives the MVP one account, one billing source, and four provider contracts to prove before introducing failover.
- The image MVP offers only provider-confirmed operations. "去水印" means the provider's watermark/subtitle removal operation, and "移除路人" means person removal; neither is marketed as arbitrary brush-mask inpainting. Generic local editing is deferred until a separate inpainting provider passes evaluation.
- Infinite-canvas / node-graph tool composition (nodes wired to nodes, ComfyUI-style) is a recognized future direction but explicitly out of scope for this phase.

## 3. Two Entry Surfaces

### 3.1 Tool Catalog and Tool Page

- `/studio/tools`: an initial 图片处理 catalog, independent of the existing `/studio/skills` Pack/Skill discovery list. 服装 / 文案 / 合规 categories are later additions, not empty release-one navigation.
- `/studio/tools/[toolId]`: a fixed-form page per tool. Reuses `WorkflowIntakeForm`'s field-type renderer (`text` / `url` / `number` / `select` / `multi_select` / `artifact`) for the majority of tools whose parameters fit those primitives — this is the same declarative intake schema Packs already use, just without the Session/Run wrapper.
- A later visual tool such as arbitrary-mask local editing may get a bespoke component slot in place of, or alongside, the generic field list. This does not expand the image MVP; the declarative field renderer is not stretched to cover freehand canvas interaction.
- Submitting a deterministic tool calls its executor directly — there is no "创建工作流会话" step, no Session is created, no chat thread is involved. The result renders inline as a before/after comparison.
- A future semantic/generative Tool page will still use the tool-calling path where it needs model reasoning, but the page remains a fixed form rather than a chat surface; the conversation, if any, is incidental plumbing, not the user-facing interaction.

### 3.2 Composer Integration

- `SkillSlashMenu` is extended (or paired with a sibling component reusing its UI/keyboard-nav/search) to also list Tools, so `/去水印` surfaces and selects a tool the same way `/` currently surfaces Skills.
- Explicit selection pins the chosen tool into the current turn's `tools` array; for a tool that needs no parameter extraction beyond an attached image, selection can force `tool_choice` to that function, skipping model deliberation about *which* tool to call.
- Implicit selection: a lightweight keyword/trigger match against the user's free text (independent of the Skill `triggers` field, which today is confirmed to be search-only — see §7) pulls in the relevant tool's schema for that turn without requiring `/`. Only matched tools are added; this stays important when the image catalog grows beyond the initial four tools.
- Image references reuse the existing artifact-mention mechanism (`image-mentions.ts`, `ArtifactMentionMenu`) — "帮我把 @刚生成的图 去水印" resolves the mention to an artifact id the same way `generate_image`'s `sourceArtifactIds` already works.
- The Composer never mounts a different visual shell for "tool mode." This is the deliberate contrast with the Workflow Composer variant (§6), which replaced the entire dock.

## 4. Backend Capability Model

### 4.1 Two Classes of Tool

| Class | Examples | Execution shape |
| --- | --- | --- |
| Deterministic / one-shot, release one | 抠图/背景移除, 水印或字幕清理, 路人移除, AI变清晰 | Direct OpenAPI call or async job+poll; no LLM reasoning is required for the operation itself, only (optionally) for parameter extraction when invoked via Composer free text |
| Semantic / generative, later | AI融图, arbitrary-mask local edit, 电商套图, 服装上身, 风格转换, 标题生成, 视频复刻, 侵权检测 | Not part of the image MVP. Each needs a separately evaluated provider and the existing function-calling/asynchronous-artifact path where model-side understanding is truly needed. |

### 4.2 Model / Provider Routing

Today only one generic image capability exists end to end: `generateImage()` (`src/lib/agent/provider/gateway.ts:503`), calling the new-api gateway's `/v1/images/generations` / `/v1/images/edits` with a single default model. The image MVP needs a dedicated provider adapter, analogous to `generateImage()` but not routed through new-api: VIAPI is not an OpenAI-compatible image-generation endpoint.

### 4.2.1 Aliyun Image MVP Capability Map

| Product capability | Aliyun VIAPI operation | Product constraint |
| --- | --- | --- |
| 背景移除 / 抠图 | `SegmentCommodity`, `SegmentHDCommonImage`, `SegmentHDBody`, or `SegmentCloth` selected from the explicit input type | The form must ask for product / person / garment / general image rather than silently guessing. |
| AI变清晰 | `MakeSuperResolutionImage` (standard) or `GenerateSuperResolutionImage` (generative) | Standard and generative are separate price/quality modes. The default is standard; generative is an explicit choice. |
| 水印或字幕清理 | `RemoveImageWatermark` or `RemoveImageSubtitles` | Do not label this a general-purpose erase brush. Product copy and abuse policy must state the user must have the necessary rights. |
| 路人移除 | `ErasePerson` | Limited to person removal, not arbitrary object removal. |

VIAPI's direct `ImageURL` route requires an image URL it can retrieve. The adapter therefore has a required five-step boundary: resolve the application's Artifact, stage its bytes in a private Shanghai OSS input bucket, generate a short-lived **standard** `bucket.oss-cn-shanghai.aliyuncs.com` signed URL, call the provider, then download the temporary provider result and persist it back to the application's Artifact store. It must not expose either provider URL as the durable user result. The contract must also retain polling support (`GetAsyncJobResult`) rather than assuming every operation is a synchronous HTTP response.

**Input-transfer constraint, verified 2026-08-15:** `SegmentCommodity` rejected an external URL and a Shenzhen OSS URL with `InvalidImage.URL`. It accepted a 10-minute signed URL from a private Shanghai OSS bucket when the URL used the standard OSS host. This account's public-access policy rejects object-level `public-read`, which is desirable: the production adapter must keep source objects private, use short-lived signatures, and never depend on a public or CDN/custom-domain URL. A tool run must fail before calling VIAPI if it cannot produce this constrained input URL.

The official OpenAPI references used for the integration are [SegmentCommodity](https://api.aliyun.com/document/imageseg/2019-12-30/SegmentCommodity), [SegmentCloth](https://api.aliyun.com/document/imageseg/2019-12-30/SegmentCloth), [SegmentHDCommonImage](https://api.aliyun.com/document/imageseg/2019-12-30/SegmentHDCommonImage), [MakeSuperResolutionImage](https://api.aliyun.com/document/imageenhan/2019-09-30/MakeSuperResolutionImage), and [GenerateSuperResolutionImage](https://api.aliyun.com/document/imageenhan/2019-09-30/GenerateSuperResolutionImage).

### 4.2.2 Supplier, Pricing, and Cost Controls

Aliyun is the release-one supplier. Baidu AI Open Platform is the next evaluation candidate, primarily for image repair, clarity enhancement, lossless upscale, style transfer, and portrait segmentation. It is deliberately not wired until the Aliyun path has measured quality, latency, error-rate, and actual-billing evidence.

The earlier indicative prices in this draft are **not a rate card** and must not be used for customer pricing or margin calculations. Aliyun's public calculator renders the applicable SKU only after account/product/region selection, so its static public page did not yield a trustworthy current unit price. Before implementation is enabled for users, an operator must activate the relevant products and record, for every enabled operation:

| Required rate-card field | Why it is required |
| --- | --- |
| Provider product, API operation, SKU, region, billing unit | One visual operation can have different modes and bills differently. |
| Official source URL or console screenshot, observed date, and tax treatment | Makes a later price change auditable rather than relying on memory. |
| `unitPriceFen` and effective date, stored with each run's price snapshot | Protects historical cost and customer pricing calculations when the vendor changes its rate. |
| Per-run ceiling, per-organization daily ceiling, and global monthly circuit breaker | Stops retries, a broken UI loop, or abuse from becoming an unbounded bill. |

The initial commercial decision is therefore: keep user-facing price/credit rules disabled until this rate card is approved. During the technical pilot, restrict access to staff/test organizations and apply the cost ceilings above. The previously discussed approximate values (cutout around `¥0.002`, standard upscale around `¥0.02`, generative upscale around `¥0.06` per call) remain planning-only estimates, unverified for the selected account/SKU/region as of 2026-08-15.

**Technical smoke evidence, 2026-08-15:** three successful `SegmentCommodity` calls returned downloadable RGBA PNG results; a product-image run produced `74.42%` fully transparent pixels and `2.91%` partial-alpha edge pixels, and was visually checked against a checkerboard composite. The CLI's `--estimate-cost` reported no pricing mapping, while the account balance stayed at `¥1.87` after the test. Neither result establishes a price or a free tier: provider billing can be quota-backed or delayed, so the rate-card gate above remains mandatory.

### 4.2.3 CLI and Credential Plan

Aliyun provides the official `aliyun` CLI. It is suitable for account/profile setup and harmless OpenAPI smoke tests; it is **not** the production execution mechanism. The production adapter remains TypeScript using the official OpenAPI SDK, so service behavior does not depend on a shell binary or a developer workstation profile.

The local environment has the official Linux `aliyun` CLI `v3.4.11` installed at `/home/user/.local/bin/aliyun`; a separate Windows `aliyun.exe` also exists but is not used by the WSL development environment. For a local technical pilot, configure the named `reizo-tools-dev` profile in `OAuth` mode and let the account owner complete the browser login themselves. This avoids transmitting a credential through chat and is not a production credential. For production, use this sequence:

1. Activate the required VIAPI products and accept their billing terms in the Alibaba Cloud console.
2. Create a least-privilege RAM role or short-lived STS credential for only the selected VIAPI operations and the narrowly scoped private Shanghai input bucket (`PutObject`, `GetObject`, and cleanup of the tool-run prefix). Do not use a root-account AccessKey.
3. Put production credentials in the deployment secret store, give the production service its own least-privilege identity, and run the TypeScript adapter smoke test there. Do not copy the OAuth CLI profile or a developer credential onto the server.

The CLI can automate steps 2--3 where the account grants it access. Product activation, billing agreements, real-name/enterprise verification, quota purchases, and some console-only permissions can still require the Alibaba Cloud console.

### 4.3 Contract Gaps to Close

- `capability-presets.ts` / the capability catalog currently enumerates a closed set (`chat`, `image.generate`, `canvas.generate`, `video.generate`). Adding tool-specific capabilities (or routing all of these through `image.generate` with per-tool metadata) needs a decision before `execution-policy.ts`-style intersection logic can gate them correctly.
- `STUDIO_TOOLS` (`src/lib/agent/tools/definitions.ts`) is a small, hand-maintained array always sent in full. It needs either a dynamic per-turn subset mechanism (§3.2) or an explicit statement that it will grow unbounded — the former is required once the catalog passes a handful of tools, both for token cost and for tool-selection accuracy.

### 4.4 Provider Abstraction Layer

Aliyun VIAPI is the fixed release-one supplier (§4.2.1). Every tool is nevertheless defined once against a `ToolProvider` interface, so adding a tested Baidu fallback later is additive rather than a rewrite and no Tool executor carries vendor-specific retry logic.

### 4.4.1 Types

```ts
// src/lib/agent/tools/providers/types.ts

export type ToolCapabilityId =
  | "image.background_removal"
  | "image.watermark_text_removal"
  | "image.person_removal"
  | "image.upscale";

export type ToolAsset = { bytes: Buffer; mimeType: string };

export type ToolInvocationInput = {
  images: ToolAsset[];        // ordered; first is primary/base
  params?: Record<string, string | number | boolean>;
};

export type ToolInvocationResult =
  | { status: "completed"; outputs: ToolAsset[] }
  | { status: "processing"; providerJobId: string; pollAfterMs: number };

export interface ToolProvider {
  readonly id: string;                              // "aliyun-viapi" | "baidu-ai" | ...
  readonly capabilities: readonly ToolCapabilityId[];
  invoke(capability: ToolCapabilityId, input: ToolInvocationInput): Promise<ToolInvocationResult>;
  pollJob?(capability: ToolCapabilityId, providerJobId: string): Promise<ToolInvocationResult>;
}
```

`ToolInvocationResult`'s two-state union exists because an enabled Aliyun operation can be submit-then-poll while another can complete during its initial call. Callers never need to know which; they branch on `status` once.

### 4.4.2 Registry, Weighted Routing, and Fallback

Fallback across providers is a capability-registry concern, not a tool concern. A tool's executor calls one function and never sees how many providers exist behind it or that a fallback happened — this mirrors new-api's own `Ability`/`Channel` model, where callers never implement channel failover themselves; the channel-selection layer does.

```ts
// src/lib/agent/tools/providers/registry.ts

export type ProviderBinding = {
  providerId: string;   // e.g. "aliyun-viapi"
  priority: number;     // lower tries first
  weight: number;        // random-weighted pick among same-priority entries
};

// Ordered provider list per capability, mirroring new-api's Ability table
// (priority + weight, not a single fixed provider). MVP config source is an
// env/JSON table; a DB-backed admin page is the natural upgrade path if
// routing needs to change without a redeploy, same as new-api's own channel UI.
export function bindingsFor(capability: ToolCapabilityId): ProviderBinding[];

/**
 * Tries providers for `capability` in priority order (weighted pick within a
 * priority tier). Only retries the next provider for retryable failures
 * (timeout, 5xx, rate limit) — a content-policy rejection or invalid-input
 * error is not retried against a different provider, since the input itself
 * is the problem, not the vendor.
 */
export async function invokeCapability(
  capability: ToolCapabilityId,
  input: ToolInvocationInput,
): Promise<ToolInvocationResult>;
```

A tool executor's entire dependency on this layer is one call:

```ts
// src/lib/agent/tools/execute.ts (sketch)
async function executeRemoveBackground(input: ToolInvocationInput) {
  const result = await invokeCapability("image.background_removal", input);
  // ... persist result.outputs as an artifact, or track result.providerJobId if "processing"
}
```

`executeRemoveBackground` never references Aliyun or Baidu by name and never contains retry logic — adding a second provider for a capability, reordering priority, or reacting to an outage is entirely a `bindingsFor` config change.

Adding Baidu after it passes evaluation, or switching to a local stub for development, is a config change. A trivial local/mock `ToolProvider` (e.g. backed by `sharp` for naive resize/crop) is enough to exercise the full pipeline end to end without incurring paid requests.

### 4.4.3 Custom / Composite Providers

`ToolProvider.invoke()` is an ordinary async function — the registry does not require it to be a single external HTTP call, so a provider we author ourselves is a first-class citizen, not a special case. Two shapes are expected to come up:

- **Pre-processing before the paid call.** A provider can run a cheap step first (e.g. a low-cost vision-model call to classify product category, detect garment type, or read core attributes) and use that to build the prompt/parameters it sends to the actual paid vendor. This is entirely inside one `invoke()` implementation — `invokeCapability` still sees "one provider, one call, one result," regardless of how many internal steps it took.
- **Composite capabilities built from primitive capabilities.** Once a future capability such as `"image.ecommerce_photoset"` is defined, its provider can call `invokeCapability("image.background_removal", ...)` and a separately registered product-shot capability internally instead of hardcoding a vendor SDK. This composes the §6 pattern directly out of primitives and inherits their priority/fallback chains.

A composite provider's internal steps are opaque to the registry: if anything inside `invoke()` throws, `invokeCapability` treats the whole call as that provider's failure and falls back to the next provider in the capability's priority list exactly as it would for a simple vendor wrapper — no special-casing needed. The one discipline to keep: primitive and composite capability ids should stay in separate namespaces so a composite provider's fallback chain can never resolve back to itself.

### 4.4.4 File Layout

```
src/lib/agent/tools/
  definitions.ts                 existing — new STUDIO_TOOLS entries per §4.1 tool
  execute.ts                     existing — new executeXxx(toolName, args), each:
                                    1. resolves referenced artifacts to ToolAsset[]
                                    2. invokeCapability(capability, input)
                                    3. status "completed" -> persist output artifact(s)
                                    4. status "processing" -> pending artifact + poll/callback
  providers/
    types.ts                     ToolProvider, ToolCapabilityId, invocation contract
    registry.ts                  resolveProvider(capability), env-driven
    aliyun-viapi.ts               image-MVP adapter
    baidu-ai.ts                   later fallback adapter, only after evaluation
    index.ts                      registers all adapters

src/app/api/tools/
  [toolId]/run/route.ts          Tool-page direct entry: calls the same executeXxx from
                                    execute.ts, bypassing runAgentTurn entirely (§3.1)
  [toolId]/jobs/[jobId]/callback/route.ts   webhook target for providers that push
                                    completion rather than being polled (mirrors the
                                    existing video-analyses callback route)
```

The Tool page route (`/api/tools/[toolId]/run`) and the Composer tool-calling path (`runAgentTurn`'s tool dispatch, per §3.2) both call the same `executeXxx` function in `execute.ts` — this is the concrete mechanism behind the "shared executor, two entry surfaces" decision in §2.

### 4.5 Provider Management Surface

`bindingsFor` (§4.4.2) needs an editable home once a capability has more than one provider — reordering priority, disabling a misbehaving provider, or rotating a credential should not require a redeploy. This needs a real design, not a placeholder, because it is the only place an operator can react to a vendor outage or cost spike.

**Placement: inside this app (winlume/Reizo), not inside new-api.** Two facts pushed this decision:

1. **Domain fit.** `ToolCapabilityId` / `ProviderBinding` and the vendors behind them (Aliyun VIAPI with access-key-signed REST calls, a future Baidu integration with its OAuth-style access token, and our own composite providers per §4.4.3) have nothing to do with new-api's `Channel`/`Ability` model, which is shaped around proxying OpenAI-compatible LLM/image-generation endpoints for chat. Forcing Tool providers into that schema means patching an externally-maintained gateway project with app-specific concepts, and complicates ever syncing upstream new-api changes again.
2. **The auth problem exists either way.** This surface needs staff-level authorization — someone who operates Reizo, not an end customer. Checked directly: `src/lib/console/types.ts`'s `ConsoleOrganizationRole` (`owner`/`admin`/`member`/`viewer`) is a *customer's own team* role model (API keys, wallet, usage — confirmed against the actual type definitions), not an internal-staff concept, and a repo-wide search for any staff/platform-admin authorization (`isStaff`, `platformAdmin`, etc.) found nothing. **No internal-staff admin surface exists anywhere in this codebase today.** Hosting Provider Management in new-api would not avoid building this — new-api's own admin login is a separate identity from this app's, so either way a new authorization concept has to be introduced. Given that cost is unavoidable, it should be paid once, next to the domain model it governs.

**Consequence:** this is a new area of the app (a staff-gated route group, e.g. `/ops/tools`), not an extension of the existing customer-facing `/account` console and not a page inside the separately-deployed new-api service. Building the staff-authorization primitive itself (who is Reizo staff, how they authenticate, what they're allowed to touch) is a prerequisite for this surface and should be scoped as its own task before the Provider Management UI is built — it is very likely needed by other future internal-admin needs too, not just this feature.

**Minimum surface, once built:**

- list providers bound to each capability, with priority/weight, editable without a redeploy;
- enable/disable a specific provider for a capability (the operational response to a vendor outage);
- credential storage per provider (Aliyun access identity, a future Baidu OAuth credential, etc. — distinct auth shapes, cannot all be one env var per capability once this is admin-editable);
- per-provider call volume/cost visibility, using the pricing data already gathered in §4.2.

**Sequencing:** do not build this before there are at least two real (non-mock) providers configured for some capability — until then `bindingsFor` as a static config file is sufficient, and a management UI would be solving a problem that does not exist yet, the same mistake §6 documents for the Workflow Pack.

**Scope going forward:** once the staff-authorization primitive exists, this becomes the general home for winlume-internal/operational configuration — Tool Provider bindings are its first section, not its whole purpose. Future internal-only settings (feature flags, other operational toggles specific to this app) should live as additional sections under the same staff-gated area rather than each growing its own bespoke admin surface and its own auth check. This does **not** extend to new-api's own scope — LLM channel/model configuration stays in new-api's admin, per the existing product boundary (this app ports user/team console features from new-api, not its admin channel/system-settings config). This area is for settings that belong to winlume's own product surface, not a general replacement for new-api's admin.

## 5. Chaining Multiple Tools in One Turn

No new runtime work is required for the chaining mechanic itself. `runAgentTurn` already loops model-stream → tool-execute → append-result → re-stream, up to `MAX_TOOL_ROUNDS = 8`, entirely within one user turn. Building "抠图 → 去水印 → 变清晰" is primarily a tool-definition exercise:

1. Define the four release-one tools with schemas the model can select correctly (see §4.3).
2. Ensure each deterministic tool's executor resolves synchronously within its round (§2), so the next round's tool call receives a real, usable artifact rather than a pending placeholder.
3. Each round's resulting artifact renders in the thread as it completes, giving the "progressive intermediate results, then final result" experience without additional UI work beyond normal artifact rendering.

## 6. Why the Workflow Pack System Is Not Reused

A prior retrospective of the Workflow Pack Composer integration surfaced concrete, avoidable friction that this design deliberately does not repeat:

- The Workflow "Composer mode" documented in `docs/superpowers/specs/2026-08-04-workflow-pack-studio-design.md` §7 was never actually a mode of the Composer — it is a separate component tree (`WorkflowControlBar`) that mimics the Composer's visual chrome while removing the text field, model picker, Skill picker, and attachments entirely.
- Free text is disallowed once a workflow session is bound; there is no path for a user to type a request and have it interpreted.
- Every Stage transition (`start`, `approve`, `requestChanges`, `startNext`, `retryStage`) requires an explicit button click by design — Stages never auto-advance, even when no review is needed.
- Tool sets are locked per Stage via Skill-declared `allowedTools` intersections (`execution-policy.ts`). Chaining unrelated tools requires either one Stage per tool (manual click between each, no free text ever) or cramming multiple tools into one Skill's allowlist, which loses the "show each intermediate result as it completes" property since intermediate progress is only visible between distinct Runs, not within one Run's tool loop.

This combination is well suited to resource-gated, human-reviewed production work, which is what Workflow Packs were designed for. It is the wrong shape for lightweight, user-driven single-turn tool use, which is why this design routes that need through ordinary Composer tool-calling instead (§3.2, §5).

## 7. Open Questions

- The exact Alibaba Cloud SKU/region/unit price for the account has to be recorded after product activation (§4.2.2); no customer-facing rate is approved before that check.
- Test whether each selected VIAPI operation is fully synchronous or uses `GetAsyncJobResult`, and record its p50/p95 latency and artifact-URL expiry behavior with real test assets.
- Establish an explicit image-use/rights policy for watermark/subtitle cleanup and an appropriate refusal path before exposing it outside the pilot.
- The exact keyword/trigger pre-filter mechanism for implicit Composer tool exposure (§3.2) is not yet designed in detail. It is confirmed to be a new mechanism — Skill `triggers` today are UI-side search filtering only (`filterSkills` in `SkillSlashMenu.tsx`), not automatic turn-level activation, and are not reused as-is.
- Whether to migrate `ai-sdk.ts`'s tool-calling path to attach `execute` functions and lean on the SDK's own step loop (`onStepFinish`, `stopWhen`) instead of `runAgentTurn`'s hand-rolled loop is a separate, independent initiative. AI SDK's step lifecycle does support persistence/SSE/cancellation hooks, so this is a real option, not a technical dead end — but it is out of scope here since the hand-rolled loop already satisfies the chaining requirement in §5.

## 8. Deferred Work

- Infinite-canvas / node-graph tool composition (nodes wired to nodes).
- Generic arbitrary-mask inpainting, AI融图, product scene generation, virtual try-on, style transfer, title generation, and all video tools. These are separate supplier evaluations, not hidden additions to the image MVP.
- Migrating tool execution to AI SDK's native multi-step loop, if ever pursued, as an infrastructure-only change independent of this feature.
- `video.generate` provider integration: the capability id already exists in the catalog but always reports `needs_setup`. The existing video pipeline (`video-analyses` → media-worker → callback) only performs analysis (ffprobe/ffmpeg), not generation; a 视频复刻/video-generation tool needs a new provider integration following the same artifact+job+callback shape, planned separately from this catalog design.
