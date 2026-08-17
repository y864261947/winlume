"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  ArrowUp,
  AtSign,
  Check,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Copy,
  FileText,
  Image as ImageIcon,
  ListOrdered,
  LoaderCircle,
  Paperclip,
  Scissors,
  RotateCw,
  Square,
  X,
} from "lucide-react";
import { fetchPlaza } from "@/lib/catalog";
import type { Artifact, SkillMeta } from "@/lib/agent/types";
import {
  composeOutboundMessage,
  createPastedBlock,
  fileToAttachment,
  fileToImageAttachment,
  fileToVideoAttachment,
  formatFileSize,
  hasComposerPayload,
  isImageFile,
  isVideoFile,
  MAX_FILES,
  MAX_IMAGES,
  MAX_PASTED_BLOCKS,
  MAX_VIDEOS,
  PASTED_COLLAPSED_PX,
  PASTED_EXPANDED_PX,
  resolveComposerPasteIntent,
  shouldCollapsePaste,
  type FileAttachment,
  type ImageAttachment,
  type PastedBlock,
  type VideoAttachment,
} from "@/lib/studio/composer-attachments";
import {
  clearComposerDraft,
  loadComposerDraft,
  saveComposerDraft,
} from "@/lib/studio/composer-draft";
import {
  startVideoAnalysis,
  uploadImageArtifact,
  uploadVideoArtifact,
} from "@/lib/studio/api";
import { REFERENCE_VIDEO_ACCEPT } from "@/lib/studio/video-upload";
import {
  buildMentionCandidates,
  filterMentionCandidates,
  nameLocalImageBatch,
  resolvePendingLocalMentions,
  resolveReferencedArtifactIds,
  type MentionCandidate,
} from "@/lib/studio/image-mentions";
import ArtifactMentionMenu, { detectAtMention } from "./ArtifactMentionMenu";
import MentionPromptEditor, {
  type MentionPromptEditorHandle,
} from "./MentionPromptEditor";
import { type StudioTool } from "@/lib/studio/tool-catalog";
import SkillChips from "./SkillChips";
import SkillSlashMenu, {
  activateSlashMenuItem,
  getSlashMenuItems,
  type MenuView,
  type SkillDepartment,
} from "./SkillSlashMenu";
import StudioViewTransition from "./StudioViewTransition";
import type { QueuedMessage } from "./useStudioChat";
import { MAX_MESSAGE_QUEUE_SIZE } from "./useStudioChat";

const FALLBACK_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "claude-3-5-sonnet",
  "deepseek-chat",
] as const;

const PLAZA_LIMIT = 30;
const DRAFT_DEBOUNCE_MS = 400;

export type ComposerSendMeta = {
  skillIds?: string[];
  /** Server artifact ids resolved from @图片N (and other @names) in the prompt. */
  referencedArtifactIds?: string[];
  /**
   * Local images to persist after the home page creates a session
   * (pre-session composer has no sessionId yet).
   */
  pendingImageUploads?: Array<{
    localId: string;
    name: string;
    dataUrl: string;
  }>;
  /** Files must stay in memory; they are uploaded after the home page creates a session. */
  pendingVideoUploads?: Array<{
    localId: string;
    file: File;
    authorized: true;
  }>;
};

export type ComposerProps = {
  value?: string;
  onChange?: (value: string) => void;
  onSend: (
    text: string,
    meta?: ComposerSendMeta,
  ) => void | Promise<void | string>;
  onStop?: () => void;
  streaming?: boolean;
  disabled?: boolean;
  model: string;
  onModelChange: (model: string) => void;
  placeholder?: string;
  allowCustomModel?: boolean;
  error?: string | null;
  onClearError?: () => void;
  skillIds?: string[];
  onSkillIdsChange?: (ids: string[]) => void;
  pinnedSkillIds?: string[];
  onPinnedSkillIdsChange?: (ids: string[]) => void;
  queue?: QueuedMessage[];
  onRemoveFromQueue?: (id: string) => void;
  onClearQueue?: () => void;
  /**
   * localStorage draft scope (e.g. session id or "home").
   * When set, text is auto-saved / restored (NewMax draft persistence).
   */
  draftKey?: string | null;
  /**
   * `hero` — floating pill for Apple-style workspace home (larger, no dock chrome).
   * `default` — sticky session composer.
   */
  variant?: "default" | "hero";
  /**
   * Name for the home→session shared-element morph. Two Composer instances
   * with the same name mounted at once (e.g. a duplicate responsive layout
   * tree) breaks View Transitions — pass `null` on any instance that isn't
   * the one participating in the morph to opt it out.
   */
  shareTransitionName?: string | null;
  /** Also carries canvas artifacts for @-mentions; prop name is retained for compatibility. */
  imageArtifacts?: Artifact[];
  /** Current session scope. Omitted by the pre-session home composer. */
  sessionId?: string;
  /** Called when an uploaded image finishes persisting as an Artifact. */
  onImageUploaded?: (artifact: Artifact) => void;
  /** Called after an authorized reference video becomes a source artifact. */
  onVideoUploaded?: (artifact: Artifact) => void;
  /** Called after a pending video-analysis artifact is created. */
  onVideoAnalysisStarted?: (artifact: Artifact) => void;
};

function PastedBlockCard({
  block,
  onRemove,
  disabled,
}: {
  block: PastedBlock;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLPreElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > PASTED_COLLAPSED_PX + 4);
  }, [block.full, expanded]);

  const title =
    block.name ||
    (block.source === "file"
      ? "文件"
      : `粘贴 · ${block.lineCount} 行 · ${formatFileSize(block.charCount)}`);

  return (
    <div className="group flex w-full max-w-full flex-col gap-1 rounded-[12px] border border-white/60 bg-white/40 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-sm">
      <div className="flex items-center gap-1.5 px-1 text-[11px] text-[#615A73]">
        <FileText className="h-3.5 w-3.5 shrink-0 text-[#0F172A]" />
        <span className="min-w-0 flex-1 truncate font-medium text-[#241E36]">
          {title}
        </span>
        <button
          type="button"
          title="复制全文"
          disabled={disabled}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(block.full);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* deny */
            }
          }}
          className="rounded p-0.5 text-[#8A8298] hover:bg-white hover:text-[#241E36] disabled:opacity-40"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          title="移除"
          disabled={disabled}
          onClick={onRemove}
          className="rounded p-0.5 text-[#8A8298] hover:bg-white hover:text-[#0F172A] disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <pre
        ref={contentRef}
        className="overflow-hidden whitespace-pre-wrap break-words rounded-[8px] bg-white/70 px-2.5 py-2 font-mono text-[11px] leading-4 text-[#241E36]"
        style={{
          maxHeight: expanded ? PASTED_EXPANDED_PX : PASTED_COLLAPSED_PX,
          overflowY: expanded ? "auto" : "hidden",
        }}
      >
        {expanded ? block.full : block.preview}
      </pre>
      {overflowing || block.preview !== block.full ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-0.5 self-start px-1 text-[11px] font-medium text-[#0F172A] hover:underline"
        >
          {expanded ? (
            <>
              <ChevronDown className="h-3 w-3" />
              收起
            </>
          ) : (
            <>
              <ChevronRight className="h-3 w-3" />
              展开全部
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

export default function Composer({
  value: controlledValue,
  onChange,
  onSend,
  onStop,
  streaming = false,
  disabled = false,
  model,
  onModelChange,
  placeholder = "描述你想完成的任务…",
  allowCustomModel = true,
  error,
  onClearError,
  skillIds: skillIdsProp,
  onSkillIdsChange,
  pinnedSkillIds: pinnedSkillIdsProp,
  onPinnedSkillIdsChange,
  queue = [],
  onRemoveFromQueue,
  onClearQueue,
  draftKey = null,
  variant = "default",
  shareTransitionName = "studio-composer",
  imageArtifacts = [],
  sessionId,
  onImageUploaded,
  onVideoUploaded,
  onVideoAnalysisStarted,
}: ComposerProps) {
  const isHero = variant === "hero";
  const promptId = useId();
  const modelId = useId();
  const menuId = useId();
  const fileInputId = useId();

  const [uncontrolled, setUncontrolled] = useState("");
  const [modelOptions, setModelOptions] = useState<string[]>([...FALLBACK_MODELS]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [customMode, setCustomMode] = useState(false);
  const [allSkills, setAllSkills] = useState<SkillMeta[]>([]);
  const [departments, setDepartments] = useState<SkillDepartment[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [internalSkillIds, setInternalSkillIds] = useState<string[]>([]);
  const [internalPinnedIds, setInternalPinnedIds] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState("");
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuView, setMenuView] = useState<MenuView>({ kind: "root" });
  const [slashRange, setSlashRange] = useState<{ start: number; end: number } | null>(
    null,
  );
  const [turnTool, setTurnTool] = useState<StudioTool | null>(null);
  const [watermarkRightsConfirmed, setWatermarkRightsConfirmed] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number } | null>(
    null,
  );

  const [pastedBlocks, setPastedBlocks] = useState<PastedBlock[]>([]);
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [videos, setVideos] = useState<VideoAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [submittingAttachments, setSubmittingAttachments] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(!draftKey);

  const editorRef = useRef<MentionPromptEditorHandle>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const mentionMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragCounter = useRef(0);
  const imagesRef = useRef<ImageAttachment[]>([]);
  const activeSessionIdRef = useRef(sessionId);

  const isControlled = controlledValue !== undefined;
  const draft = isControlled ? controlledValue : uncontrolled;

  const skillIdsControlled = skillIdsProp !== undefined;
  const selectedIds = skillIdsControlled ? skillIdsProp : internalSkillIds;

  const pinnedControlled = pinnedSkillIdsProp !== undefined;
  const pinnedIds = pinnedControlled ? pinnedSkillIdsProp : internalPinnedIds;

  const setDraft = useCallback(
    (next: string) => {
      if (isControlled) onChange?.(next);
      else setUncontrolled(next);
    },
    [isControlled, onChange],
  );

  useEffect(() => {
    activeSessionIdRef.current = sessionId;
  }, [sessionId]);

  const setComposerImages = useCallback(
    (
      next:
        | ImageAttachment[]
        | ((prev: ImageAttachment[]) => ImageAttachment[]),
    ) => {
      const resolved = typeof next === "function" ? next(imagesRef.current) : next;
      imagesRef.current = resolved;
      setImages(resolved);
    },
    [],
  );

  const setSelectedIds = useCallback(
    (next: string[] | ((prev: string[]) => string[])) => {
      const resolved = typeof next === "function" ? next(selectedIds) : next;
      if (!skillIdsControlled) setInternalSkillIds(resolved);
      onSkillIdsChange?.(resolved);
    },
    [selectedIds, skillIdsControlled, onSkillIdsChange],
  );

  const setPinnedIds = useCallback(
    (next: string[] | ((prev: string[]) => string[])) => {
      const resolved = typeof next === "function" ? next(pinnedIds) : next;
      if (!pinnedControlled) setInternalPinnedIds(resolved);
      onPinnedSkillIdsChange?.(resolved);
    },
    [pinnedIds, pinnedControlled, onPinnedSkillIdsChange],
  );

  // Hydrate draft from localStorage once per draftKey
  useEffect(() => {
    if (!draftKey) {
      setDraftHydrated(true);
      return;
    }
    const saved = loadComposerDraft(draftKey);
    if (saved) {
      if (isControlled) {
        // Only fill if parent has empty draft (don't clobber intentional URL prompt)
        if (!controlledValue?.trim()) onChange?.(saved);
      } else {
        setUncontrolled(saved);
      }
    }
    setDraftHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per key
  }, [draftKey]);

  // Debounced draft save (works for controlled + uncontrolled)
  useEffect(() => {
    if (!draftKey || !draftHydrated) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      saveComposerDraft(draftKey, draft);
    }, DRAFT_DEBOUNCE_MS);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [draft, draftKey, draftHydrated]);

  useEffect(() => {
    let cancelled = false;
    setModelsLoading(true);
    fetchPlaza()
      .then((data) => {
        if (cancelled) return;
        const names = [
          ...new Set(
            data.models
              .map((m) => m.model_name)
              .filter((n): n is string => Boolean(n?.trim())),
          ),
        ].slice(0, PLAZA_LIMIT);
        if (names.length) {
          // Always stay on the list control; inject current model if missing.
          setModelOptions((prev) => {
            const base = names;
            if (model && !base.includes(model)) {
              return [model, ...base.filter((n) => n !== model)];
            }
            return base;
          });
          setCustomMode(false);
        }
      })
      .catch(() => {
        /* keep fallback */
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSkillsLoading(true);
    fetch("/api/skills", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error("skills");
        return res.json() as Promise<{
          skills: SkillMeta[];
          departments?: SkillDepartment[];
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        setAllSkills(data.skills ?? []);
        setDepartments(data.departments ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setAllSkills([]);
          setDepartments([]);
        }
      })
      .finally(() => {
        if (!cancelled) setSkillsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep select list as primary UX — never auto-switch to free-text mode.
  useEffect(() => {
    if (model && !modelOptions.includes(model) && !customMode) {
      setModelOptions((prev) => [model, ...prev.filter((m) => m !== model)]);
    }
  }, [model, modelOptions, customMode]);

  const skillsById = useMemo(() => {
    const map = new Map<string, SkillMeta>();
    for (const s of allSkills) map.set(s.id, s);
    return map;
  }, [allSkills]);

  const menuItems = useMemo(
    () => getSlashMenuItems(allSkills, departments, menuQuery, menuView),
    [allSkills, departments, menuQuery, menuView],
  );

  useEffect(() => {
    setMenuIndex(0);
  }, [menuQuery, menuOpen, menuView]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery, mentionOpen]);

  useEffect(() => {
    if (menuItems.length === 0) return;
    if (menuIndex >= menuItems.length) setMenuIndex(0);
  }, [menuItems.length, menuIndex]);

  useEffect(() => {
    if (menuQuery.trim() && menuView.kind !== "root") {
      setMenuView({ kind: "root" });
    }
  }, [menuQuery, menuView.kind]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (editorRef.current?.containsNode(t)) return;
      setMenuOpen(false);
      setSlashRange(null);
      setMenuView({ kind: "root" });
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!mentionOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (mentionMenuRef.current?.contains(t)) return;
      if (editorRef.current?.containsNode(t)) return;
      setMentionOpen(false);
      setMentionRange(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [mentionOpen]);

  const queueFull = queue.length >= MAX_MESSAGE_QUEUE_SIZE;
  const canSend =
    hasComposerPayload({
      draft,
      pasted: pastedBlocks,
      images,
      files,
      videos,
    }) &&
    !disabled &&
    !submittingAttachments &&
    videos.every((video) => video.authorized) &&
    !(streaming && queueFull);

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  }, []);

  const toggleSkill = useCallback(
    (id: string) => {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    },
    [setSelectedIds],
  );

  const removeSkill = useCallback(
    (id: string) => {
      setSelectedIds((prev) => prev.filter((x) => x !== id));
    },
    [setSelectedIds],
  );

  const clearTurnSkills = useCallback(() => {
    setSelectedIds([]);
  }, [setSelectedIds]);

  const togglePin = useCallback(
    (id: string) => {
      setPinnedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    },
    [setPinnedIds],
  );

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuQuery("");
    setSlashRange(null);
    setMenuView({ kind: "root" });
  }, []);

  const pickSkillFromMenu = useCallback(
    (skill: SkillMeta) => {
      if (!slashRange) {
        toggleSkill(skill.id);
        return;
      }
      setSelectedIds((prev) =>
        prev.includes(skill.id) ? prev : [...prev, skill.id],
      );
      const editor = editorRef.current;
      if (editor) {
        const { text, cursor } = editor.replaceRange(slashRange, "");
        // Collapse accidental double spaces from removing /query
        const cleaned = text.replace(/\s{2,}/g, " ");
        if (cleaned !== text) {
          setDraft(cleaned);
          requestAnimationFrame(() => {
            editor.setCaretOffset(Math.min(cursor, cleaned.length));
          });
        } else {
          setDraft(text);
          requestAnimationFrame(() => editor.setCaretOffset(cursor));
        }
      }
      closeMenu();
    },
    [closeMenu, setDraft, setSelectedIds, slashRange, toggleSkill],
  );

  const pickToolFromMenu = useCallback(
    (tool: StudioTool) => {
      setTurnTool(tool);
      setWatermarkRightsConfirmed(false);
      const editor = editorRef.current;
      if (slashRange && editor) {
        const { text, cursor } = editor.replaceRange(slashRange, "");
        const cleaned = text.replace(/\s{2,}/g, " ").trimStart();
        const next = cleaned || tool.composerPrompt;
        setDraft(next);
        requestAnimationFrame(() => editor.setCaretOffset(Math.min(cursor, next.length)));
      } else if (!draft.trim()) {
        setDraft(tool.composerPrompt);
      }
      closeMenu();
    },
    [closeMenu, draft, setDraft, slashRange],
  );

  const openSkillMenu = useCallback(
    (query = "", range: { start: number; end: number } | null = null) => {
      setMenuQuery(query);
      setSlashRange(range);
      setMenuView({ kind: "root" });
      setMenuOpen(true);
    },
    [],
  );

  const detectSlash = useCallback(
    (text: string, cursor: number) => {
      const upto = text.slice(0, cursor);
      const match = upto.match(/(?:^|[\s\n])\/([^\s/]*)$/);
      if (!match) {
        setMenuOpen(false);
        setSlashRange(null);
        setMenuQuery("");
        setMenuView({ kind: "root" });
        return;
      }
      const token = match[0];
      const slashLocal = token.lastIndexOf("/");
      const start = cursor - token.length + slashLocal;
      const query = match[1] ?? "";
      openSkillMenu(query, { start, end: cursor });
    },
    [openSkillMenu],
  );

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

  const mentionCandidates = useMemo(
    () => buildMentionCandidates(images, imageArtifacts),
    [images, imageArtifacts],
  );

  const resolveMentionMeta = useCallback(
    (name: string) => {
      const hit = mentionCandidates.find((c) => c.name === name);
      if (!hit) return null;
      return {
        name: hit.name,
        thumbSrc: hit.thumbSrc,
        kind: hit.kind,
        artifactId: hit.artifactId,
        localId: hit.localId,
      };
    },
    [mentionCandidates],
  );

  const pickMentionCandidate = useCallback(
    (candidate: MentionCandidate) => {
      const editor = editorRef.current;
      if (editor) {
        editor.insertMention(
          {
            name: candidate.name,
            thumbSrc: candidate.thumbSrc,
            kind: candidate.kind,
            artifactId: candidate.artifactId,
            localId: candidate.localId,
          },
          mentionRange,
        );
      }
      setMentionOpen(false);
      setMentionRange(null);
      setMentionQuery("");
    },
    [mentionRange],
  );

  const onEditorCaretActivity = useCallback(
    (text: string, caret: number) => {
      detectSlash(text, caret);
      if (!menuOpen) detectMention(text, caret);
      else {
        setMentionOpen(false);
        setMentionRange(null);
      }
    },
    [detectSlash, detectMention, menuOpen],
  );

  const uploadOneImage = useCallback(
    (image: ImageAttachment) => {
      if (!sessionId) return;
      void uploadImageArtifact({ sessionId, name: image.name, dataUrl: image.dataUrl })
        .then((artifact) => {
          if (artifact.sessionId !== activeSessionIdRef.current) return;
          setComposerImages((prev) => prev.map((item) =>
            item.id === image.id ? { ...item, artifactId: artifact.id, uploadFailed: false } : item,
          ));
          onImageUploaded?.(artifact);
        })
        .catch(() => {
          if (sessionId !== activeSessionIdRef.current) return;
          setComposerImages((prev) => prev.map((item) =>
            item.id === image.id ? { ...item, uploadFailed: true } : item,
          ));
          setAttachError("图片上传失败，仍会随消息发送；发送前会再试一次以便 @ 引用");
        });
    },
    [onImageUploaded, sessionId, setComposerImages],
  );

  const retryImageUpload = useCallback((imageId: string) => {
    const image = imagesRef.current.find((item) => item.id === imageId);
    if (!image) return;
    setComposerImages((prev) => prev.map((item) =>
      item.id === imageId ? { ...item, uploadFailed: false } : item,
    ));
    uploadOneImage(image);
  }, [setComposerImages, uploadOneImage]);

  const addImages = useCallback(
    async (list: File[]) => {
      setAttachError(null);
      const candidates: ImageAttachment[] = [];
      for (const file of list) {
        try {
          candidates.push(await fileToImageAttachment(file));
        } catch (err) {
          setAttachError(err instanceof Error ? err.message : "添加图片失败");
        }
      }
      if (!candidates.length) return;

      const available = Math.max(0, MAX_IMAGES - imagesRef.current.length);
      const sliced = candidates.slice(0, available);
      if (sliced.length < candidates.length) {
        setAttachError(`最多 ${MAX_IMAGES} 张图片`);
      }
      if (!sliced.length) return;

      // Local 图片N names immediately — @ works before any session/upload.
      const accepted = nameLocalImageBatch(imagesRef.current, sliced);
      setComposerImages((prev) => [...prev, ...accepted]);

      if (!sessionId) return;

      accepted.forEach(uploadOneImage);
    },
    [sessionId, setComposerImages, uploadOneImage],
  );

  const addFiles = useCallback(async (list: File[]) => {
    setAttachError(null);
    for (const file of list) {
      try {
        if (isImageFile(file)) {
          await addImages([file]);
          continue;
        }
        if (isVideoFile(file)) {
          const video = fileToVideoAttachment(file);
          setVideos((prev) => {
            if (prev.length >= MAX_VIDEOS) {
              setAttachError(`一次最多添加 ${MAX_VIDEOS} 个参考视频`);
              return prev;
            }
            return [...prev, video];
          });
          continue;
        }
        const result = await fileToAttachment(file);
        if (result.pasted) {
          setPastedBlocks((prev) => {
            if (prev.length >= MAX_PASTED_BLOCKS) {
              setAttachError(`最多 ${MAX_PASTED_BLOCKS} 个粘贴块`);
              return prev;
            }
            return [...prev, result.pasted!];
          });
        } else if (result.file) {
          setFiles((prev) => {
            if (prev.length >= MAX_FILES) {
              setAttachError(`最多 ${MAX_FILES} 个附件`);
              return prev;
            }
            return [...prev, result.file!];
          });
        }
      } catch (err) {
        setAttachError(err instanceof Error ? err.message : "添加文件失败");
      }
    }
  }, [addImages]);

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      const intent = resolveComposerPasteIntent(e.clipboardData);
      if (intent.kind === "empty" || intent.kind === "short-text") {
        // let browser handle short text
        return;
      }

      if (intent.kind === "long-text") {
        e.preventDefault();
        setPastedBlocks((prev) => {
          if (prev.length >= MAX_PASTED_BLOCKS) {
            setAttachError(`最多 ${MAX_PASTED_BLOCKS} 个粘贴块`);
            return prev;
          }
          setAttachError(null);
          return [...prev, createPastedBlock(intent.text)];
        });
        return;
      }

      if (intent.kind === "images") {
        e.preventDefault();
        void addImages(intent.files);
        return;
      }

      if (intent.kind === "files") {
        e.preventDefault();
        void addFiles(intent.files);
        return;
      }

      if (intent.kind === "mixed") {
        e.preventDefault();
        if (intent.text) {
          if (shouldCollapsePaste(intent.text)) {
            setPastedBlocks((prev) =>
              prev.length >= MAX_PASTED_BLOCKS
                ? prev
                : [...prev, createPastedBlock(intent.text!)],
            );
          } else {
            // insert short text at caret (serialized)
            const editor = editorRef.current;
            if (editor && intent.text) {
              const caret = editor.getCaretOffset();
              editor.replaceRange({ start: caret, end: caret }, intent.text);
            } else if (intent.text) {
              setDraft(draft + intent.text);
            }
          }
        }
        if (intent.images.length) void addImages(intent.images);
        if (intent.files.length) void addFiles(intent.files);
      }
    },
    [addFiles, addImages, draft, setDraft],
  );

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer?.types?.includes("Files")) setDragOver(true);
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragOver(false);
    }
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);
    if (disabled || submittingAttachments) return;
    const list = Array.from(e.dataTransfer?.files ?? []);
    if (list.length) void addFiles(list);
  };

  const clearAttachments = useCallback(() => {
    setPastedBlocks([]);
    setComposerImages([]);
    setFiles([]);
    setVideos([]);
    setAttachError(null);
  }, [setComposerImages]);

  const submit = useCallback(() => {
    if (disabled || submittingAttachments) return;
    if (streaming && queueFull) return;
    if (
      !hasComposerPayload({
        draft,
        pasted: pastedBlocks,
        images,
        files,
        videos,
      })
    ) {
      return;
    }
    if (videos.some((video) => !video.authorized)) {
      setAttachError("请先确认你拥有该参考视频的使用授权");
      return;
    }
    if (turnTool?.id === "watermark-subtitle-removal" && !watermarkRightsConfirmed) {
      setAttachError("请先确认你拥有处理此图片及移除相关内容的必要权利");
      return;
    }
    onClearError?.();

    void (async () => {
      setSubmittingAttachments(true);
      try {
        let workingImages = images;

        // Session page: finish any @-mentioned uploads before resolving ids.
        if (sessionId) {
          const pending = resolvePendingLocalMentions(draft, workingImages);
          if (pending.length) {
            const uploaded: ImageAttachment[] = [...workingImages];
            for (const image of pending) {
              try {
                const artifact = await uploadImageArtifact({
                  sessionId,
                  name: image.name,
                  dataUrl: image.dataUrl,
                });
                const idx = uploaded.findIndex((i) => i.id === image.id);
                if (idx >= 0) {
                  uploaded[idx] = {
                    ...uploaded[idx]!,
                    artifactId: artifact.id,
                    uploadFailed: false,
                  };
                }
                onImageUploaded?.(artifact);
              } catch {
                const idx = uploaded.findIndex((i) => i.id === image.id);
                if (idx >= 0) {
                  uploaded[idx] = { ...uploaded[idx]!, uploadFailed: true };
                }
                setAttachError("部分图片上传失败，@ 引用可能不完整");
              }
            }
            workingImages = uploaded;
            setComposerImages(uploaded);
          }

          // Video work starts outside the chat process. Do this before the chat
          // turn so the Works panel has durable source + pending analysis rows.
          for (const video of videos) {
            try {
              const source = await uploadVideoArtifact({
                sessionId,
                file: video.file,
                authorized: video.authorized,
              });
              onVideoUploaded?.(source);
              const analysis = await startVideoAnalysis({
                sourceArtifactId: source.id,
                goal: "both",
              });
              onVideoAnalysisStarted?.(analysis.artifact);
            } catch (error) {
              setAttachError(
                error instanceof Error
                  ? error.message
                  : "参考视频上传或拆解任务创建失败",
              );
              return;
            }
          }
        }

        const toolDraft = turnTool && !draft.includes(turnTool.composerPrompt)
          ? `${turnTool.composerPrompt}\n${draft}`.trim()
          : draft;
        const outbound = composeOutboundMessage({
          draft:
            turnTool?.id === "watermark-subtitle-removal"
              ? `${toolDraft}\n我确认拥有处理此图片及移除相关内容的必要权利。`
              : toolDraft,
          pasted: pastedBlocks,
          images: workingImages,
          files,
          videos,
        });
        if (!outbound) return;

        const referencedArtifactIds = resolveReferencedArtifactIds(
          draft,
          workingImages,
          imageArtifacts,
        );

        const meta: ComposerSendMeta | undefined =
          selectedIds.length ||
          referencedArtifactIds.length ||
          (!sessionId && (workingImages.length || videos.length))
            ? {
                ...(selectedIds.length ? { skillIds: [...selectedIds] } : {}),
                ...(referencedArtifactIds.length
                  ? { referencedArtifactIds }
                  : {}),
                ...(!sessionId && workingImages.length
                  ? {
                      pendingImageUploads: workingImages.map((img) => ({
                        localId: img.id,
                        name: img.name,
                        dataUrl: img.dataUrl,
                      })),
                    }
                  : {}),
                ...(!sessionId && videos.length
                  ? {
                      pendingVideoUploads: videos.map((video) => ({
                        localId: video.id,
                        file: video.file,
                        authorized: true as const,
                      })),
                    }
                  : {}),
              }
            : undefined;

        void onSend(outbound, meta);
        setDraft("");
        editorRef.current?.clear();
        setSelectedIds([]);
        setTurnTool(null);
        setWatermarkRightsConfirmed(false);
        clearAttachments();
        closeMenu();
        setMentionOpen(false);
        setMentionRange(null);
        if (draftKey) clearComposerDraft(draftKey);
        focusComposer();
      } finally {
        setSubmittingAttachments(false);
      }
    })();
  }, [
    disabled,
    submittingAttachments,
    streaming,
    queueFull,
    draft,
    pastedBlocks,
    images,
    files,
    videos,
    sessionId,
    imageArtifacts,
    onImageUploaded,
    onVideoUploaded,
    onVideoAnalysisStarted,
    setComposerImages,
    onClearError,
    selectedIds,
    turnTool,
    watermarkRightsConfirmed,
    onSend,
    setDraft,
    setSelectedIds,
    clearAttachments,
    closeMenu,
    draftKey,
    focusComposer,
  ]);

  const runMenuActivate = useCallback(() => {
    const item = menuItems[menuIndex];
    activateSlashMenuItem(item, {
      onPickSkill: pickSkillFromMenu,
      onPickTool: pickToolFromMenu,
      onViewChange: setMenuView,
      onClearTurnSkills: clearTurnSkills,
      onHighlightIndexChange: setMenuIndex,
    });
  }, [menuItems, menuIndex, pickSkillFromMenu, pickToolFromMenu, clearTurnSkills]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (menuOpen && menuItems.length) {
      runMenuActivate();
      return;
    }
    submit();
  };

  const onEditorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (mentionOpen && !event.nativeEvent.isComposing) {
      const items = filterMentionCandidates(mentionCandidates, mentionQuery);
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
        if (items[mentionIndex]) pickMentionCandidate(items[mentionIndex]);
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
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (menuItems.length) {
          setMenuIndex((i) => (i + 1) % menuItems.length);
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (menuItems.length) {
          setMenuIndex((i) => (i - 1 + menuItems.length) % menuItems.length);
        }
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (menuItems.length) runMenuActivate();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (menuView.kind === "department" && !menuQuery.trim()) {
          setMenuView({ kind: "root" });
          setMenuIndex(0);
          return;
        }
        closeMenu();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        if (menuItems.length) runMenuActivate();
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const turnCount = selectedIds.length;
  const pinCount = pinnedIds.length;
  const hasAttachments =
    pastedBlocks.length > 0 ||
    images.length > 0 ||
    files.length > 0 ||
    videos.length > 0;

  return (
    <div
      className={
        isHero
          ? "relative z-[1] w-full px-0 py-0"
          : "studio-composer-dock"
      }
    >
      {error ? (
        <div
          role="alert"
          className={`mx-auto mb-3 flex items-start justify-between gap-3 rounded-[14px] border border-[rgba(239,71,112,0.25)] bg-[rgba(239,71,112,0.08)] px-3 py-2 text-sm text-[#0F172A] ${
            isHero ? "max-w-none" : "max-w-3xl"
          }`}
        >
          <p className="min-w-0 flex-1 leading-5">{error}</p>
          {onClearError ? (
            <button
              type="button"
              onClick={onClearError}
              className="shrink-0 text-xs text-[#0F172A] underline-offset-2 hover:underline"
            >
              关闭
            </button>
          ) : null}
        </div>
      ) : null}

      {queue.length > 0 ? (
        <div
          className={`mx-auto mb-3 rounded-[16px] border border-white/70 bg-white/50 px-3 py-2 shadow-[0_8px_24px_-16px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-xl ${
            isHero ? "max-w-none" : "max-w-3xl"
          }`}
        >
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[#0F172A]">
            <ListOrdered className="h-3.5 w-3.5" />
            排队中 {queue.length}/{MAX_MESSAGE_QUEUE_SIZE}
            {onClearQueue ? (
              <button
                type="button"
                onClick={onClearQueue}
                className="ml-auto text-[11px] font-normal text-[#8A8298] underline-offset-2 hover:text-[#0F172A] hover:underline"
              >
                清空
              </button>
            ) : null}
          </div>
          <ul className="space-y-1">
            {queue.map((item, index) => (
              <li
                key={item.id}
                className="flex items-start gap-2 rounded-[10px] bg-white/60 px-2 py-1.5 text-xs text-[#241E36]"
              >
                <span className="mt-0.5 shrink-0 tabular-nums text-[#8A8298]">
                  {index + 1}.
                </span>
                <span className="min-w-0 flex-1 line-clamp-2 whitespace-pre-wrap">
                  {item.content}
                </span>
                {onRemoveFromQueue ? (
                  <button
                    type="button"
                    onClick={() => onRemoveFromQueue(item.id)}
                    className="shrink-0 rounded p-0.5 text-[#8A8298] hover:bg-white hover:text-[#0F172A]"
                    title="移出队列"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <StudioViewTransition
        name={shareTransitionName ?? undefined}
        share="studio-morph"
        default="none"
      >
      <form
        className={`studio-liquid-glass relative mx-auto flex w-full flex-col gap-2 ${
          isHero ? "max-w-none p-3.5 sm:p-4" : "max-w-3xl p-2.5 sm:p-3"
        }`}
        data-variant={isHero ? "hero" : "session"}
        data-drag-over={dragOver ? "true" : "false"}
        onSubmit={onSubmit}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {dragOver ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-[rgba(15,23,42,0.06)] text-sm font-medium text-[#0F172A] backdrop-blur-[2px]">
            松开以添加文件、图片或参考视频
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 px-2 pt-1">
          <label htmlFor={modelId} className="sr-only">
            模型
          </label>
          {customMode && allowCustomModel ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
              <input
                id={modelId}
                type="text"
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                placeholder="输入模型名称"
                disabled={disabled}
                className="studio-liquid-chip min-w-0 flex-1 rounded-[10px] px-2.5 py-1 font-mono text-xs text-[#241E36] sm:w-48"
              />
              <button
                type="button"
                onClick={() => {
                  setCustomMode(false);
                  if (!modelOptions.includes(model) && modelOptions[0]) {
                    onModelChange(modelOptions[0]);
                  }
                }}
                className="text-xs text-[#8A8298] hover:text-[#241E36]"
              >
                列表
              </button>
            </div>
          ) : (
            <div className="relative">
              <select
                id={modelId}
                value={modelOptions.includes(model) ? model : modelOptions[0] ?? model}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setCustomMode(true);
                    return;
                  }
                  onModelChange(e.target.value);
                }}
                disabled={disabled || modelsLoading}
                className="studio-liquid-chip appearance-none rounded-[10px] py-1 pl-2.5 pr-7 font-mono text-xs text-[#241E36] disabled:opacity-60"
              >
                {modelOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                {allowCustomModel ? (
                  <option value="__custom__">自定义…</option>
                ) : null}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8A8298]" />
            </div>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || submittingAttachments}
            title="添加附件、图片或参考视频"
            className="studio-liquid-chip inline-flex items-center gap-1 rounded-[10px] px-2 py-1 text-xs text-[#615A73] disabled:opacity-50"
          >
            <Paperclip className="h-3.5 w-3.5" />
            附件
          </button>
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            multiple
            className="hidden"
            accept={`image/*,${REFERENCE_VIDEO_ACCEPT},.txt,.md,.json,.csv,.log,.html,.css,.js,.ts,.tsx,.py,.yml,.yaml`}
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (list.length) void addFiles(list);
            }}
          />

          <span className="text-[11px] text-[#8A8298]">
            {submittingAttachments
              ? "正在上传附件并创建拆解任务…"
              : streaming
                ? queueFull
                  ? `队列已满（${MAX_MESSAGE_QUEUE_SIZE}）· 可停止当前生成`
                  : "生成中 · Enter 加入队列 · 可粘贴/拖入附件"
                : videos.length > 0
                  ? "确认授权后发送 · 将在作品区生成可编辑拆解"
                  : images.length > 0
                    ? "输入 @ 引用图片（如 @图片1）· Enter 发送"
                    : "Enter 发送 · 粘贴长文自动折叠 · 可拖入文件"}
          </span>
        </div>

        {turnTool ? (
          <div className="flex flex-wrap items-center gap-1.5 px-2">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-[#8A8298]">
              本轮工具
            </span>
            <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-[rgba(15, 23, 42,0.2)] bg-[rgba(15, 23, 42,0.08)] py-0.5 pl-2.5 pr-1 text-xs text-[#0F172A]">
              <Scissors className="h-3 w-3 shrink-0" />
              <span className="truncate">{turnTool.name}</span>
              <Link
                href={`/studio/tools/${turnTool.id}`}
                className="rounded-full px-1.5 text-[10px] text-[#4F46E5] hover:bg-white/70"
              >
                表单
              </Link>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setTurnTool(null);
                  setWatermarkRightsConfirmed(false);
                }}
                className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/70 disabled:opacity-50"
                title="取消工具"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
            {turnTool.id === "watermark-subtitle-removal" ? (
              <label className="inline-flex items-center gap-1.5 text-xs text-[#615A73]">
                <input
                  type="checkbox"
                  checked={watermarkRightsConfirmed}
                  disabled={disabled}
                  onChange={(event) => {
                    setWatermarkRightsConfirmed(event.target.checked);
                    if (event.target.checked) setAttachError(null);
                  }}
                  className="h-3.5 w-3.5 accent-[#0F172A]"
                />
                我确认拥有处理此图片及移除相关内容的必要权利
              </label>
            ) : null}
          </div>
        ) : null}

        <SkillChips
          turnIds={selectedIds}
          pinnedIds={pinnedIds}
          skillsById={skillsById}
          onRemoveTurn={removeSkill}
          onTogglePin={togglePin}
          onClearTurn={clearTurnSkills}
          disabled={disabled}
        />

        {/* Attachment strip: images, reference videos, and binary file chips. */}
        {(images.length > 0 || videos.length > 0 || files.length > 0) && (
          <div className="flex flex-wrap gap-2 px-2">
            {images.map((img) => (
              <div
                key={img.id}
                className="group relative h-16 w-16 overflow-hidden rounded-[12px] border border-white/80 bg-white/70 shadow-sm"
              >
                <button
                  type="button"
                  className="h-full w-full"
                  title={img.uploadFailed ? "上传失败，点击重试" : `点击插入 @${img.name}`}
                  disabled={disabled}
                  onClick={() => {
                    if (img.uploadFailed) {
                      retryImageUpload(img.id);
                      return;
                    }
                    // Insert at caret as a real chip (ignore any open @query range).
                    editorRef.current?.insertMention(
                      {
                        name: img.name,
                        thumbSrc: img.dataUrl,
                        artifactId: img.artifactId,
                        localId: img.id,
                      },
                      null,
                    );
                    setMentionOpen(false);
                    setMentionRange(null);
                    setMentionQuery("");
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className={`h-full w-full object-cover ${img.uploadFailed ? "opacity-50" : ""}`}
                  />
                  {img.uploadFailed ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-rose-900/30">
                      <RotateCw className="h-4 w-4 text-white" />
                    </span>
                  ) : (
                    <span className="pointer-events-none absolute right-0.5 top-0.5 rounded-full bg-black/55 p-0.5 text-white opacity-0 transition group-hover:opacity-100">
                      <AtSign className="h-3 w-3" />
                    </span>
                  )}
                  <span className="absolute bottom-0 left-0 right-0 bg-black/55 px-0.5 py-0.5 text-center text-[10px] font-medium leading-tight text-white">
                    {img.uploadFailed ? "上传失败" : img.name}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    setComposerImages((prev) =>
                      prev.filter((item) => item.id !== img.id),
                    )
                  }
                  className="absolute right-0.5 top-0.5 z-[1] rounded-full bg-black/55 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                  title={`移除 ${img.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {videos.map((video) => (
              <div
                key={video.id}
                className="relative flex min-w-[15rem] max-w-full flex-col gap-1.5 rounded-[8px] border border-white/80 bg-white/65 px-2.5 py-2 text-[11px] text-[#241E36] shadow-sm"
              >
                <div className="flex min-w-0 items-center gap-1.5 pr-5">
                  <Clapperboard className="h-3.5 w-3.5 shrink-0 text-[#0F172A]" />
                  <span className="min-w-0 flex-1 truncate font-medium" title={video.name}>
                    {video.name}
                  </span>
                  <span className="shrink-0 text-[#8A8298]">
                    {formatFileSize(video.size)}
                  </span>
                </div>
                <label className="flex cursor-pointer items-start gap-1.5 leading-4 text-[#615A73]">
                  <input
                    type="checkbox"
                    checked={video.authorized}
                    disabled={disabled || submittingAttachments}
                    onChange={(event) => {
                      const authorized = event.target.checked;
                      setVideos((prev) =>
                        prev.map((item) =>
                          item.id === video.id ? { ...item, authorized } : item,
                        ),
                      );
                      if (authorized) setAttachError(null);
                    }}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#0F172A]"
                  />
                  <span>我确认拥有该视频的使用授权</span>
                </label>
                <button
                  type="button"
                  disabled={disabled || submittingAttachments}
                  onClick={() =>
                    setVideos((prev) => prev.filter((item) => item.id !== video.id))
                  }
                  className="absolute right-1.5 top-1.5 rounded p-0.5 text-[#8A8298] hover:bg-white hover:text-[#0F172A] disabled:opacity-40"
                  title={`移除 ${video.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {files.map((f) => (
              <div
                key={f.id}
                className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-[12px] border border-white/70 bg-white/60 px-2 py-1.5 text-[11px] text-[#241E36]"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-[#0F172A]" />
                <span className="min-w-0 flex-1 truncate" title={f.name}>
                  {f.name}
                </span>
                <span className="shrink-0 text-[#8A8298]">
                  {formatFileSize(f.size)}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    setFiles((prev) => prev.filter((x) => x.id !== f.id))
                  }
                  className="rounded p-0.5 text-[#8A8298] hover:text-[#0F172A]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pasted long-text cards */}
        {pastedBlocks.length > 0 ? (
          <div className="flex flex-col gap-2 px-1">
            {pastedBlocks.map((block) => (
              <PastedBlockCard
                key={block.id}
                block={block}
                disabled={disabled}
                onRemove={() =>
                  setPastedBlocks((prev) => prev.filter((b) => b.id !== block.id))
                }
              />
            ))}
          </div>
        ) : null}

        {attachError ? (
          <p className="px-2 text-[11px] text-[#0F172A]">{attachError}</p>
        ) : null}

        {hasAttachments ? (
          <div className="flex items-center gap-2 px-2">
            <span className="inline-flex items-center gap-1 text-[10px] text-[#8A8298]">
              {videos.length > 0 ? (
                <Clapperboard className="h-3 w-3" />
              ) : (
                <ImageIcon className="h-3 w-3" />
              )}
              {pastedBlocks.length > 0
                ? `${pastedBlocks.length} 粘贴块`
                : null}
              {pastedBlocks.length > 0 && images.length > 0 ? " · " : null}
              {images.length > 0 ? (
                <span className={images.length >= MAX_IMAGES ? "font-semibold text-rose-600" : images.length === MAX_IMAGES - 1 ? "font-medium text-amber-600" : undefined}>
                  {images.length}/{MAX_IMAGES} 图
                </span>
              ) : null}
              {(pastedBlocks.length > 0 || images.length > 0) && videos.length
                ? " · "
                : null}
              {videos.length > 0 ? (
                <span
                  className={
                    videos.some((video) => !video.authorized)
                      ? "font-medium text-amber-600"
                      : undefined
                  }
                >
                  {videos.length}/{MAX_VIDEOS} 视频
                </span>
              ) : null}
              {(pastedBlocks.length > 0 || images.length > 0 || videos.length > 0) &&
              files.length
                ? " · "
                : null}
              {files.length > 0 ? `${files.length} 文件` : null}
            </span>
            <button
              type="button"
              onClick={clearAttachments}
              disabled={disabled}
              className="text-[10px] text-[#8A8298] underline-offset-2 hover:text-[#0F172A] hover:underline"
            >
              清空附件
            </button>
          </div>
        ) : null}

        <div className="relative flex items-end gap-2">
          <label className="sr-only" htmlFor={promptId}>
            输入你的需求
          </label>
          <MentionPromptEditor
            ref={editorRef}
            id={promptId}
            value={draft}
            onChange={setDraft}
            onCaretActivity={onEditorCaretActivity}
            onPaste={handlePaste}
            onKeyDown={onEditorKeyDown}
            resolveMention={resolveMentionMeta}
            disabled={disabled}
            placeholder={
              streaming
                ? queueFull
                  ? "队列已满，请等待或停止生成…"
                  : "继续输入，将加入发送队列…"
                : videos.length > 0
                  ? "补充拆解目标，例如目标平台、时长或想保留的结构…"
                  : hasAttachments
                    ? "补充说明，或输入 @ 引用图片…"
                    : placeholder
            }
            maxHeight={isHero ? 220 : 160}
            minHeightClass={
              isHero ? "min-h-[4.5rem] py-3 text-[15px] leading-7" : "min-h-[2.75rem] py-2 text-sm leading-6"
            }
            className="disabled:opacity-60"
            aria-controls={menuOpen || mentionOpen ? menuId : undefined}
            aria-expanded={menuOpen || mentionOpen}
            aria-autocomplete="list"
          />
          {streaming ? (
            <>
              <button
                type="submit"
                disabled={!canSend}
                title={
                  submittingAttachments
                    ? "正在上传附件"
                    : queueFull
                      ? "队列已满"
                      : "加入队列"
                }
                className="studio-send-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] text-white transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submittingAttachments ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <ListOrdered className="h-4 w-4" />
                )}
                <span className="sr-only">加入队列</span>
              </button>
              <button
                type="button"
                onClick={() => onStop?.()}
                title="停止生成"
                className="studio-liquid-chip flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] text-[#615A73]"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                <span className="sr-only">停止</span>
              </button>
            </>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              title={submittingAttachments ? "正在上传附件" : "发送"}
              className="studio-send-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submittingAttachments ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
              <span className="sr-only">发送</span>
            </button>
          )}

          <SkillSlashMenu
            open={menuOpen}
            query={menuQuery}
            skills={allSkills}
            departments={departments}
            selectedIds={selectedIds}
            loading={skillsLoading}
            highlightIndex={menuIndex}
            onHighlightIndexChange={setMenuIndex}
            view={menuView}
            onViewChange={setMenuView}
            onPickSkill={pickSkillFromMenu}
            onPickTool={pickToolFromMenu}
            onClearTurnSkills={clearTurnSkills}
            menuId={menuId}
            menuRef={menuRef}
          />

          <ArtifactMentionMenu
            open={mentionOpen}
            query={mentionQuery}
            candidates={mentionCandidates}
            highlightIndex={mentionIndex}
            onHighlightIndexChange={setMentionIndex}
            onPick={pickMentionCandidate}
            onRetryUpload={(candidate) => {
              if (candidate.localId) retryImageUpload(candidate.localId);
            }}
            menuRef={mentionMenuRef}
          />
        </div>
      </form>
      </StudioViewTransition>
    </div>
  );
}
