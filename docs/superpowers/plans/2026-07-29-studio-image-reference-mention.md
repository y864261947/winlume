# Studio "@" Image Reference — Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user type `@` in the composer, pick one of the session's already-generated images, and have that reference reach `generate_image`'s `sourceArtifactId` reliably — without asking the model to transcribe an id from prose.

**Architecture:** Two independent halves, per the design spec. UI half: a composer "@" trigger (mirrors the existing `/` skill-slash-menu pattern already in `Composer.tsx`/`SkillSlashMenu.tsx`) picks one image artifact and shows it as a chip. Model half: the picked artifact's id travels as its own structured field (`referencedArtifactId`) all the way from the composer to `runAgentTurn`, which resolves and validates it server-side and injects a `<system-reminder>` naming the artifact — the agent still decides *whether* this turn is an edit request from the user's own words, but it is never asked to guess *which* artifact.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest.

**Depends on:** `docs/superpowers/plans/2026-07-29-studio-image-generation-core.md` (Plan A) — this plan assumes `generate_image`, `Artifact.status`, and the `/api/artifacts/[id]/raw` route already exist, since the mention picker lists `kind: "image"` artifacts and shows their thumbnail via that route.

## Global Constraints

- Single reference per turn (MVP) — the composer holds at most one referenced artifact at a time, matching the design's `sourceArtifactId?: string` (not an array) on `generate_image`.
- The referenced artifact id must never be inferred from free-text message content — it is carried as its own request field, not embedded in `message`.
- Do not reuse `attachmentIds`/`ImageAttachment` for this — those mean "user-uploaded file", not "reference to an existing artifact"; conflating them blurs that meaning (per the design spec §8).
- Reuse the existing `/` slash-menu pattern's structure (pure filter/detect helpers exported and unit-tested, dumb presentational menu component) rather than inventing a new pattern.
- Do not run `next build` / `tsc` as a verification step — verify with `npx vitest run <path>` per task; this project's own convention is that the user runs builds themselves.

---

### Task 1: Thread `referencedArtifactId` through the request pipeline (types only)

**Files:**
- Modify: `src/lib/studio/api.ts`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/lib/agent/runtime.ts`
- Modify: `src/lib/studio/live-chat-session.ts`
- Modify: `src/components/studio/useStudioChat.ts`

**Interfaces:**
- Produces: `ChatRequestBody.referencedArtifactId?: string` (api.ts), `ChatBody.referencedArtifactId?: string` (chat route), `RunAgentTurnOpts.referencedArtifactId?: string` (runtime.ts), `SendOverrides.referencedArtifactId?: string` (live-chat-session.ts), `ComposerSendMeta.referencedArtifactId?: string` (useStudioChat.ts re-export target — see Task 4).

No dedicated test for this task (it's plumbing with no branching logic); verified by Task 2's test exercising `runAgentTurn`'s consumption of the field, and Task 4's manual check.

- [ ] **Step 1: Add the field to `ChatRequestBody`**

In `src/lib/studio/api.ts`, change:

```ts
export type ChatRequestBody = {
  sessionId?: string;
  message: string;
  model?: string;
  skillIds?: string[];
};
```

to:

```ts
export type ChatRequestBody = {
  sessionId?: string;
  message: string;
  model?: string;
  skillIds?: string[];
  /** Id of an image artifact the user @-referenced in the composer, if any. */
  referencedArtifactId?: string;
};
```

- [ ] **Step 2: Accept it in the `/api/chat` route body**

In `src/app/api/chat/route.ts`, change:

```ts
type ChatBody = {
  sessionId?: string;
  message?: string;
  model?: string;
  skillIds?: string[];
};
```

to:

```ts
type ChatBody = {
  sessionId?: string;
  message?: string;
  model?: string;
  skillIds?: string[];
  referencedArtifactId?: string;
};
```

Then, in the same file, add parsing next to the existing `skillIds` parsing:

```ts
  const skillIds = Array.isArray(body.skillIds)
    ? body.skillIds.filter((id): id is string => typeof id === "string")
    : undefined;
```

add directly after it:

```ts
  const referencedArtifactId =
    typeof body.referencedArtifactId === "string" && body.referencedArtifactId.trim()
      ? body.referencedArtifactId.trim()
      : undefined;
```

And pass it into `runAgentTurn(...)`'s options object (alongside the existing `skillIds,`):

```ts
        for await (const event of runAgentTurn({
          userId,
          sessionId,
          userText: message,
          skillIds,
          referencedArtifactId,
          model,
          sessions: webStore.sessions,
          artifacts: webStore.artifacts,
          signal: turn.controller.signal,
          gatewayUserId: userId,
        })) {
```

- [ ] **Step 3: Accept it in `RunAgentTurnOpts`**

In `src/lib/agent/runtime.ts`, change:

```ts
export interface RunAgentTurnOpts {
  userId: string;
  sessionId: string;
  userText: string;
  skillIds?: string[];
  model?: string;
  sessions: SessionStore;
  artifacts: ArtifactStore;
  signal?: AbortSignal;
  /** Forwarded to gateway as New-Api-User when set */
  gatewayUserId?: string;
}
```

to:

```ts
export interface RunAgentTurnOpts {
  userId: string;
  sessionId: string;
  userText: string;
  skillIds?: string[];
  /** Id of an image artifact the user @-referenced in the composer, if any. */
  referencedArtifactId?: string;
  model?: string;
  sessions: SessionStore;
  artifacts: ArtifactStore;
  signal?: AbortSignal;
  /** Forwarded to gateway as New-Api-User when set */
  gatewayUserId?: string;
}
```

(The field is accepted here but not yet consumed — Task 2 wires it into the system prompt.)

- [ ] **Step 4: Add it to `SendOverrides`**

In `src/lib/studio/live-chat-session.ts`, change:

```ts
export type SendOverrides = {
  model?: string;
  skillIds?: string[];
};
```

to:

```ts
export type SendOverrides = {
  model?: string;
  skillIds?: string[];
  /** Id of an image artifact the user @-referenced in the composer, if any. */
  referencedArtifactId?: string;
};
```

Then in `runLiveTurn`, change:

```ts
    const requestModel =
      overrides?.model?.trim() || entry.snapshot.model || FALLBACK_DEFAULT_MODEL;
    const requestSkillIds = overrides?.skillIds;
```

to:

```ts
    const requestModel =
      overrides?.model?.trim() || entry.snapshot.model || FALLBACK_DEFAULT_MODEL;
    const requestSkillIds = overrides?.skillIds;
    const requestReferencedArtifactId = overrides?.referencedArtifactId;
```

And change the `streamChat` call:

```ts
      await streamChat(
        {
          sessionId,
          message: text,
          model: requestModel,
          ...(requestSkillIds?.length ? { skillIds: requestSkillIds } : {}),
        },
```

to:

```ts
      await streamChat(
        {
          sessionId,
          message: text,
          model: requestModel,
          ...(requestSkillIds?.length ? { skillIds: requestSkillIds } : {}),
          ...(requestReferencedArtifactId
            ? { referencedArtifactId: requestReferencedArtifactId }
            : {}),
        },
```

- [ ] **Step 5: Re-export the type surface `useStudioChat` already re-exports from**

`src/components/studio/useStudioChat.ts` re-exports `type { ... }` from `live-chat-session`; since `SendOverrides` is not currently in that re-export list, check its `export type { ... }` block:

```ts
export type {
  ArtifactEventPayload,
  QueuedMessage,
  StreamPhase,
  UiChatMessage,
  UiToolCall,
};
```

Leave this as-is — `send()`'s public signature is `send(text, overrides?: { model?: string; skillIds?: string[] })` (see `UseStudioChatResult`), which Task 4 will extend directly rather than exporting `SendOverrides` itself. Change `UseStudioChatResult`'s `send` signature:

```ts
  send: (
    text: string,
    overrides?: { model?: string; skillIds?: string[] },
  ) => Promise<"sent" | "queued" | "rejected">;
```

to:

```ts
  send: (
    text: string,
    overrides?: { model?: string; skillIds?: string[]; referencedArtifactId?: string },
  ) => Promise<"sent" | "queued" | "rejected">;
```

And in the `send` callback body inside `useStudioChat`, change:

```ts
  const send = useCallback(
    async (
      text: string,
      overrides?: {
        model?: string;
        skillIds?: string[];
      },
    ): Promise<"sent" | "queued" | "rejected"> => {
      if (!sessionId) return "rejected";
      // Turn-only skillIds from composer; fall back to hook prop if any.
      const skillIds = overrides?.skillIds ?? skillIdsProp;
      return sendLiveChat(sessionId, text, {
        ...overrides,
        skillIds,
      });
    },
    [sessionId, skillIdsProp],
  );
```

to:

```ts
  const send = useCallback(
    async (
      text: string,
      overrides?: {
        model?: string;
        skillIds?: string[];
        referencedArtifactId?: string;
      },
    ): Promise<"sent" | "queued" | "rejected"> => {
      if (!sessionId) return "rejected";
      // Turn-only skillIds from composer; fall back to hook prop if any.
      const skillIds = overrides?.skillIds ?? skillIdsProp;
      return sendLiveChat(sessionId, text, {
        ...overrides,
        skillIds,
      });
    },
    [sessionId, skillIdsProp],
  );
```

(`overrides` is already spread into the `sendLiveChat` call, so `referencedArtifactId` flows through automatically once it's part of the `overrides` object's type — the only change needed is widening the type signature, shown above.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/studio/api.ts src/app/api/chat/route.ts src/lib/agent/runtime.ts src/lib/studio/live-chat-session.ts src/components/studio/useStudioChat.ts
git commit -m "feat(studio): thread referencedArtifactId through the chat request pipeline"
```

---

### Task 2: Resolve and inject the referenced-artifact system reminder

**Files:**
- Modify: `src/lib/agent/runtime.ts`
- Modify: `src/lib/agent/runtime.messages.test.ts`

**Interfaces:**
- Consumes: `RunAgentTurnOpts.referencedArtifactId` (Task 1), `ArtifactStore.get(userId, id): Promise<Artifact | null>` (existing).
- Produces: `buildReferencedArtifactReminder(artifact: Artifact | null): string` (exported, pure — tested directly).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/agent/runtime.messages.test.ts`:

```ts
import { buildReferencedArtifactReminder } from "./runtime";
import type { Artifact } from "./types";

describe("buildReferencedArtifactReminder", () => {
  it("returns empty string when there is no referenced artifact", () => {
    expect(buildReferencedArtifactReminder(null)).toBe("");
  });

  it("names the artifact and its id, and instructs the model not to guess", () => {
    const artifact: Artifact = {
      id: "art-42",
      userId: "u1",
      sessionId: "s1",
      name: "Fox",
      kind: "image",
      mimeType: "image/png",
      storageKey: "",
      createdAt: "t1",
    };
    const reminder = buildReferencedArtifactReminder(artifact);
    expect(reminder).toContain("<system-reminder>");
    expect(reminder).toContain("Fox");
    expect(reminder).toContain("art-42");
    expect(reminder).toContain("sourceArtifactId");
    expect(reminder).toContain("Do not guess");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agent/runtime.messages.test.ts`
Expected: FAIL — `buildReferencedArtifactReminder` is not exported.

- [ ] **Step 3: Implement the reminder builder and wire it into `runAgentTurn`**

In `src/lib/agent/runtime.ts`, add this function next to `buildSessionReminder`:

```ts
export function buildReferencedArtifactReminder(artifact: Artifact | null): string {
  if (!artifact) return "";
  return [
    "<system-reminder>",
    `The user referenced artifact "${artifact.name}" (id=${artifact.id}, kind=${artifact.kind}) via @-mention in this message. If — and only if — the user's own words are asking to modify, edit, or regenerate this image, call generate_image with sourceArtifactId="${artifact.id}". Do not guess a different id, and do not treat every message that follows a mention as an edit request.`,
    "</system-reminder>",
  ].join("\n");
}
```

Then, inside `runAgentTurn`, find this block:

```ts
  let artifactCount = 0;
  try {
    artifactCount = (await artifacts.listBySession(userId, sessionId)).length;
  } catch {
    /* ignore */
  }
  const reminder = buildSessionReminder(artifactCount);
  const system = buildSystemPrompt(
    reminder ? `${BASE_POLICY}\n\n${reminder}` : BASE_POLICY,
    skills,
  );
```

and replace it with:

```ts
  let artifactCount = 0;
  try {
    artifactCount = (await artifacts.listBySession(userId, sessionId)).length;
  } catch {
    /* ignore */
  }
  const reminder = buildSessionReminder(artifactCount);

  let referencedArtifact: Artifact | null = null;
  if (opts.referencedArtifactId) {
    try {
      const found = await artifacts.get(userId, opts.referencedArtifactId);
      // Only honor it when it's actually an image the user can reference for editing.
      if (found && found.kind === "image") referencedArtifact = found;
    } catch {
      /* ignore — falls through as "no reference" */
    }
  }
  const artifactReminder = buildReferencedArtifactReminder(referencedArtifact);

  const combinedReminder = [reminder, artifactReminder].filter(Boolean).join("\n\n");
  const system = buildSystemPrompt(
    combinedReminder ? `${BASE_POLICY}\n\n${combinedReminder}` : BASE_POLICY,
    skills,
  );
```

`Artifact` is already imported in this file via `import type { AgentSseEvent, Message, ToolCallRecord } from "@/lib/agent/types";` — change that import line to also bring in `Artifact`:

```ts
import type { AgentSseEvent, Artifact, Message, ToolCallRecord } from "@/lib/agent/types";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/agent/runtime.messages.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/runtime.ts src/lib/agent/runtime.messages.test.ts
git commit -m "feat(studio): resolve @-referenced artifact server-side and inject a system reminder"
```

---

### Task 3: `detectAt` mention-trigger helper + `ArtifactMentionMenu` component

**Files:**
- Create: `src/components/studio/ArtifactMentionMenu.tsx`
- Test: `src/components/studio/artifact-mention.test.ts`

**Interfaces:**
- Produces: `detectAtMention(text: string, cursor: number): { start: number; end: number; query: string } | null` and `filterMentionArtifacts(artifacts: Artifact[], query: string): Artifact[]` (both pure, exported from `ArtifactMentionMenu.tsx`, mirroring `filterSkills`/detection logic already in `SkillSlashMenu.tsx`/`Composer.tsx`), and the `ArtifactMentionMenu` React component (consumed by Task 4).

- [ ] **Step 1: Write the failing tests**

Create `src/components/studio/artifact-mention.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectAtMention, filterMentionArtifacts } from "./ArtifactMentionMenu";
import type { Artifact } from "@/lib/agent/types";

describe("detectAtMention", () => {
  it("detects @ at the start of text", () => {
    expect(detectAtMention("@fox", 4)).toEqual({ start: 0, end: 4, query: "fox" });
  });

  it("detects @ after whitespace", () => {
    expect(detectAtMention("edit @fox please", 9)).toEqual({
      start: 5,
      end: 9,
      query: "fox",
    });
  });

  it("returns null when there is no trailing @ token at the cursor", () => {
    expect(detectAtMention("hello world", 11)).toBeNull();
  });

  it("returns null once a space follows the @ token", () => {
    expect(detectAtMention("@fox is done, then more", 8)).toBeNull();
  });

  it("does not trigger on an email-like mid-word @", () => {
    expect(detectAtMention("contact a@b.com", 15)).toBeNull();
  });
});

describe("filterMentionArtifacts", () => {
  const artifacts: Artifact[] = [
    {
      id: "1",
      userId: "u",
      sessionId: "s",
      name: "Red Fox",
      kind: "image",
      mimeType: "image/png",
      storageKey: "",
      createdAt: "t",
    },
    {
      id: "2",
      userId: "u",
      sessionId: "s",
      name: "Blue Sky",
      kind: "image",
      mimeType: "image/png",
      storageKey: "",
      createdAt: "t",
    },
  ];

  it("returns all artifacts for an empty query", () => {
    expect(filterMentionArtifacts(artifacts, "")).toHaveLength(2);
  });

  it("filters case-insensitively by name substring", () => {
    expect(filterMentionArtifacts(artifacts, "fox").map((a) => a.id)).toEqual(["1"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterMentionArtifacts(artifacts, "zzz")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/studio/artifact-mention.test.ts`
Expected: FAIL — cannot find module `./ArtifactMentionMenu`.

- [ ] **Step 3: Implement the helpers and the menu component**

Create `src/components/studio/ArtifactMentionMenu.tsx`:

```tsx
"use client";

import type { Ref } from "react";
import { ImageIcon } from "lucide-react";
import type { Artifact } from "@/lib/agent/types";

const MENTION_MAX = 20;

/**
 * Detects a trailing `@token` at the cursor, mirroring Composer.tsx's
 * `detectSlash` for the skill slash-menu. Returns null once whitespace
 * follows the `@`, so an in-progress mention closes the menu as soon as
 * the user finishes typing past it.
 */
export function detectAtMention(
  text: string,
  cursor: number,
): { start: number; end: number; query: string } | null {
  const upto = text.slice(0, cursor);
  const match = upto.match(/(?:^|[\s\n])@([^\s@]*)$/);
  if (!match) return null;
  const token = match[0];
  const atLocal = token.lastIndexOf("@");
  const start = cursor - token.length + atLocal;
  const query = match[1] ?? "";
  return { start, end: cursor, query };
}

export function filterMentionArtifacts(
  artifacts: Artifact[],
  query: string,
): Artifact[] {
  const q = query.trim().toLowerCase();
  const pool = q
    ? artifacts.filter((a) => a.name.toLowerCase().includes(q))
    : artifacts;
  return pool.slice(0, MENTION_MAX);
}

export type ArtifactMentionMenuProps = {
  open: boolean;
  query: string;
  artifacts: Artifact[];
  highlightIndex: number;
  onHighlightIndexChange: (index: number) => void;
  onPick: (artifact: Artifact) => void;
  menuId?: string;
  menuRef?: Ref<HTMLDivElement>;
};

export default function ArtifactMentionMenu({
  open,
  query,
  artifacts,
  highlightIndex,
  onHighlightIndexChange,
  onPick,
  menuId,
  menuRef,
}: ArtifactMentionMenuProps) {
  if (!open) return null;
  const items = filterMentionArtifacts(artifacts, query);

  return (
    <div
      ref={menuRef}
      id={menuId}
      role="listbox"
      className="absolute bottom-full left-0 z-20 mb-2 max-h-64 w-72 overflow-y-auto rounded-[14px] border border-white/70 bg-white/95 p-1.5 shadow-lg backdrop-blur"
    >
      {items.length === 0 ? (
        <p className="px-2.5 py-3 text-center text-xs text-[#8A8298]">
          {artifacts.length === 0 ? "还没有可引用的图片作品" : "没有匹配的作品"}
        </p>
      ) : (
        items.map((artifact, index) => (
          <button
            key={artifact.id}
            type="button"
            role="option"
            aria-selected={index === highlightIndex}
            onMouseEnter={() => onHighlightIndexChange(index)}
            onClick={() => onPick(artifact)}
            className={`flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-xs transition ${
              index === highlightIndex
                ? "bg-[rgba(15,23,42,0.06)] text-[#0F172A]"
                : "text-[#241E36] hover:bg-[rgba(15,23,42,0.04)]"
            }`}
          >
            <span className="h-8 w-8 shrink-0 overflow-hidden rounded-[8px] border border-white/80 bg-white/70">
              {artifact.status === "ready" || !artifact.status ? (
                // eslint-disable-next-line @next/next/no-img-element -- small thumbnail from a user-scoped artifact route
                <img
                  src={`/api/artifacts/${artifact.id}/raw`}
                  alt={artifact.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[#8A8298]">
                  <ImageIcon className="h-3.5 w-3.5" />
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1 truncate">{artifact.name}</span>
          </button>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/studio/artifact-mention.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/studio/ArtifactMentionMenu.tsx src/components/studio/artifact-mention.test.ts
git commit -m "feat(studio): add @-mention detection and artifact picker menu"
```

---

### Task 4: Wire the mention picker into `Composer` and the Studio page

**Files:**
- Modify: `src/components/studio/Composer.tsx`
- Modify: `src/app/studio/c/[sessionId]/page.tsx`

**Interfaces:**
- Consumes: `detectAtMention`, `ArtifactMentionMenu` (Task 3); `ComposerSendMeta` (existing, extended here); `send(text, overrides)` from `useStudioChat` (Task 1 Step 5 already widened its type).

No dedicated test — this is component wiring exercised by Task 3's unit-tested pure helpers; verified manually (Step 5 below).

- [ ] **Step 1: Extend `ComposerProps` and `ComposerSendMeta`**

In `src/components/studio/Composer.tsx`, add the import:

```ts
import ArtifactMentionMenu, {
  detectAtMention,
} from "./ArtifactMentionMenu";
import type { Artifact } from "@/lib/agent/types";
```

Change:

```ts
export type ComposerSendMeta = {
  skillIds?: string[];
};
```

to:

```ts
export type ComposerSendMeta = {
  skillIds?: string[];
  referencedArtifactId?: string;
};
```

Add a new prop to `ComposerProps` (next to the existing `skillIds`/`onSkillIdsChange` pair):

```ts
  /** Image artifacts available for @-mention (ready or pending; failed ones are filtered out by the caller). */
  imageArtifacts?: Artifact[];
```

- [ ] **Step 2: Add mention state and detection, mirroring the existing slash-menu state**

First, destructure the new prop in the component's parameter list, where the other props (`variant`, `shareTransitionName`, etc.) are already destructured — change:

```ts
  shareTransitionName = "studio-composer",
}: ComposerProps) {
```

to:

```ts
  shareTransitionName = "studio-composer",
  imageArtifacts = [],
}: ComposerProps) {
```

Then, inside the `Composer` function body, next to the existing slash-menu state (`menuOpen`, `menuQuery`, `menuIndex`, `menuView`, `slashRange`), add the new mention state:

```ts
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number } | null>(
    null,
  );
  const [referencedArtifact, setReferencedArtifact] = useState<Artifact | null>(null);
  const mentionMenuRef = useRef<HTMLDivElement>(null);
```

Add the detection function, next to `detectSlash`:

```ts
  const detectMention = useCallback((text: string, cursor: number) => {
    const hit = detectAtMention(text, cursor);
    if (!hit) {
      setMentionOpen(false);
      setMentionRange(null);
      setMentionQuery("");
      return;
    }
    setMentionQuery(hit.query);
    setMentionRange({ start: hit.start, end: hit.end });
    setMentionOpen(true);
  }, []);
```

Add the pick handler, next to `pickSkillFromMenu`:

```ts
  const pickMentionArtifact = useCallback(
    (artifact: Artifact) => {
      setReferencedArtifact(artifact);
      if (mentionRange && textareaRef.current) {
        const el = textareaRef.current;
        const before = draft.slice(0, mentionRange.start);
        const after = draft.slice(mentionRange.end);
        const next = `${before}${after}`.replace(/\s{2,}/g, " ");
        setDraft(next);
        requestAnimationFrame(() => {
          const pos = before.length;
          el.focus();
          el.setSelectionRange(pos, pos);
        });
      }
      setMentionOpen(false);
      setMentionRange(null);
      setMentionQuery("");
    },
    [draft, mentionRange, setDraft],
  );
```

Reset `mentionIndex` when the query/open state changes, mirroring the existing skill-menu effect — add next to the existing `useEffect(() => { setMenuIndex(0); }, [menuQuery, menuOpen, menuView]);`:

```ts
  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery, mentionOpen]);
```

- [ ] **Step 3: Call `detectMention` from the textarea handlers, mutually exclusive with the skill slash-menu**

Change the textarea's `onChange`:

```ts
            onChange={(e) => {
              const next = e.target.value;
              setDraft(next);
              onTextareaInput();
              const cursor = e.target.selectionStart ?? next.length;
              detectSlash(next, cursor);
            }}
```

to:

```ts
            onChange={(e) => {
              const next = e.target.value;
              setDraft(next);
              onTextareaInput();
              const cursor = e.target.selectionStart ?? next.length;
              detectSlash(next, cursor);
              if (!menuOpen) detectMention(next, cursor);
              else {
                setMentionOpen(false);
                setMentionRange(null);
              }
            }}
```

Change the textarea's `onClick`:

```ts
            onClick={(e) => {
              const el = e.currentTarget;
              detectSlash(el.value, el.selectionStart ?? el.value.length);
            }}
```

to:

```ts
            onClick={(e) => {
              const el = e.currentTarget;
              const cursor = el.selectionStart ?? el.value.length;
              detectSlash(el.value, cursor);
              if (!menuOpen) detectMention(el.value, cursor);
            }}
```

Extend the outside-click handler that currently only closes the skill menu — change:

```ts
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (textareaRef.current?.contains(t)) return;
      setMenuOpen(false);
      setSlashRange(null);
      setMenuView({ kind: "root" });
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);
```

to add a second effect right after it:

```ts
  useEffect(() => {
    if (!mentionOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (mentionMenuRef.current?.contains(t)) return;
      if (textareaRef.current?.contains(t)) return;
      setMentionOpen(false);
      setMentionRange(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [mentionOpen]);
```

- [ ] **Step 4: Keyboard navigation, the chip, submit wiring, and rendering the menu**

Add mention-menu keyboard handling at the top of `onKeyDown`, before the existing `if (menuOpen) { ... }` block:

```ts
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen) {
      const items = filterMentionArtifacts(imageArtifacts, mentionQuery);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (items.length) setMentionIndex((i) => (i + 1) % items.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (items.length) setMentionIndex((i) => (i - 1 + items.length) % items.length);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (items[mentionIndex]) pickMentionArtifact(items[mentionIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionOpen(false);
        setMentionRange(null);
        return;
      }
    }

    if (menuOpen) {
```

(the rest of the existing `if (menuOpen) { ... }` body and the trailing `Enter`-to-submit branch stay unchanged — only the new `if (mentionOpen) { ... }` block above it, and changing `if (menuOpen) {` to a plain continuation, are new).

Add the import for `filterMentionArtifacts` alongside `detectAtMention` from Step 1:

```ts
import ArtifactMentionMenu, {
  detectAtMention,
  filterMentionArtifacts,
} from "./ArtifactMentionMenu";
```

Render a removable chip for the active reference — insert this block directly above the `{/* Attachment strip: images + binary file chips */}` comment:

```tsx
        {referencedArtifact ? (
          <div className="flex items-center gap-2 px-2">
            <div className="inline-flex items-center gap-1.5 rounded-[10px] border border-white/70 bg-white/60 px-2 py-1 text-[11px] text-[#241E36]">
              <span className="h-5 w-5 shrink-0 overflow-hidden rounded-[6px] bg-white/70">
                {/* eslint-disable-next-line @next/next/no-img-element -- small thumbnail from a user-scoped artifact route */}
                <img
                  src={`/api/artifacts/${referencedArtifact.id}/raw`}
                  alt={referencedArtifact.name}
                  className="h-full w-full object-cover"
                />
              </span>
              <span className="max-w-[10rem] truncate">{referencedArtifact.name}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setReferencedArtifact(null)}
                className="rounded p-0.5 text-[#8A8298] hover:text-[#0F172A]"
                title="取消引用"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        ) : null}
```

Render the menu itself — add it next to the existing `<SkillSlashMenu ... />` element, inside the same `relative` wrapper:

```tsx
          <ArtifactMentionMenu
            open={mentionOpen}
            query={mentionQuery}
            artifacts={imageArtifacts}
            highlightIndex={mentionIndex}
            onHighlightIndexChange={setMentionIndex}
            onPick={pickMentionArtifact}
            menuRef={mentionMenuRef}
          />
```

Finally, wire it into `submit()` and clear it after sending. Change:

```ts
    const meta: ComposerSendMeta | undefined = selectedIds.length
      ? { skillIds: [...selectedIds] }
      : undefined;
    void onSend(outbound, meta);
    setDraft("");
    setSelectedIds([]);
    clearAttachments();
    closeMenu();
```

to:

```ts
    const meta: ComposerSendMeta | undefined =
      selectedIds.length || referencedArtifact
        ? {
            ...(selectedIds.length ? { skillIds: [...selectedIds] } : {}),
            ...(referencedArtifact
              ? { referencedArtifactId: referencedArtifact.id }
              : {}),
          }
        : undefined;
    void onSend(outbound, meta);
    setDraft("");
    setSelectedIds([]);
    setReferencedArtifact(null);
    clearAttachments();
    closeMenu();
```

And add `referencedArtifact` to `submit`'s dependency array (it currently ends with `focusComposer,`):

```ts
  }, [
    disabled,
    streaming,
    queueFull,
    draft,
    pastedBlocks,
    images,
    files,
    onClearError,
    selectedIds,
    referencedArtifact,
    onSend,
    setDraft,
    setSelectedIds,
    clearAttachments,
    closeMenu,
    draftKey,
    focusComposer,
  ]);
```

- [ ] **Step 5: Pass the session's image artifacts from the Studio page and verify manually**

In `src/app/studio/c/[sessionId]/page.tsx`, wherever `<Composer ... />` is rendered (it already receives `skillIds`, `pinnedSkillIds`, etc. from this page's state), add:

```tsx
        imageArtifacts={artifacts.filter(
          (a) => a.kind === "image" && a.status !== "failed",
        )}
```

as a new prop on that element, alongside the existing props.

Then verify manually (this task has no automated test for the wiring): start the dev server, generate at least one image (per Plan A's Task 7 manual check), type `@` in the composer, confirm the picker lists that image with a thumbnail, pick it, confirm a chip appears and the `@token` text is removed from the draft, type "把背景换成蓝色" and send, and confirm — via the network tab or server logs — that the request to `/api/chat` includes `referencedArtifactId`, and that the agent calls `generate_image` with `sourceArtifactId` set to that id rather than asking which image you mean.

- [ ] **Step 6: Commit**

```bash
git add src/components/studio/Composer.tsx "src/app/studio/c/[sessionId]/page.tsx"
git commit -m "feat(studio): wire @-mention picker into the composer and studio page"
```

---

## Self-Review Notes

- **Spec coverage:** Design spec §8's "UI half" (which image) → Task 3 + Task 4 Steps 1-4. §8's "model half" (reliable id delivery, not text-guessed) → Task 1 (plumbing) + Task 2 (server-side resolution/injection). The explicit "don't fold into `attachmentIds`" constraint is honored — `referencedArtifactId` is its own field throughout, never merged into the attachment types from `composer-attachments.ts`.
- **Placeholder scan:** no TBD/TODO; the one non-code instruction (Task 4 Step 2's "do not use the line above") is deliberate corrective guidance about a wrong pattern, not a placeholder for missing content — the actual code to write is given immediately after it.
- **Type consistency:** `ComposerSendMeta.referencedArtifactId` (Task 4) matches `SendOverrides.referencedArtifactId` (Task 1) matches `ChatRequestBody.referencedArtifactId` (Task 1) matches `ChatBody.referencedArtifactId` (Task 1) matches `RunAgentTurnOpts.referencedArtifactId` (Task 1) — one string field, same name, threaded end-to-end without renaming at any hop.
