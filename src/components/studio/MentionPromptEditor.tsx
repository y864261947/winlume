"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  deleteMentionChipBeforeCaret,
  getSerializedCaretOffset,
  insertMentionChipInEditor,
  renderSegmentsToEditor,
  replaceSerializedRangeWithText,
  serializeMentionEditor,
  setSerializedCaretOffset,
  textToSegments,
  type MentionChipMeta,
} from "@/lib/studio/mention-editor";

export type MentionPromptEditorHandle = {
  focus: () => void;
  blur: () => void;
  getSerializedText: () => string;
  getCaretOffset: () => number;
  setCaretOffset: (offset: number) => void;
  insertMention: (
    meta: MentionChipMeta,
    range: { start: number; end: number } | null,
  ) => { text: string; cursor: number };
  replaceRange: (
    range: { start: number; end: number },
    insert: string,
  ) => { text: string; cursor: number };
  clear: () => void;
  autoSize: () => void;
  containsNode: (node: Node | null) => boolean;
};

export type MentionPromptEditorProps = {
  id?: string;
  value: string;
  onChange: (serialized: string) => void;
  /** Fired after input/click/keyup with serialized text + caret offset. */
  onCaretActivity?: (text: string, caret: number) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  onPaste?: (event: ClipboardEvent<HTMLDivElement>) => void;
  resolveMention: (name: string) => MentionChipMeta | null | undefined;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  maxHeight?: number;
  minHeightClass?: string;
  "aria-controls"?: string;
  "aria-expanded"?: boolean;
  "aria-autocomplete"?: "list" | "none";
};

function isEmptyEditor(root: HTMLElement): boolean {
  const text = serializeMentionEditor(root).trim();
  if (text) return false;
  // only br / zwsp / whitespace
  return !root.querySelector("[data-mention-name]");
}

const MentionPromptEditor = forwardRef<
  MentionPromptEditorHandle,
  MentionPromptEditorProps
>(function MentionPromptEditor(
  {
    id,
    value,
    onChange,
    onCaretActivity,
    onKeyDown,
    onPaste,
    resolveMention,
    disabled = false,
    placeholder,
    className = "",
    maxHeight = 160,
    minHeightClass = "min-h-[2.75rem]",
    "aria-controls": ariaControls,
    "aria-expanded": ariaExpanded,
    "aria-autocomplete": ariaAutocomplete = "list",
  },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);
  const composingRef = useRef(false);

  const resolve = useCallback(
    (name: string) => resolveMention(name) ?? null,
    [resolveMention],
  );

  const autoSize = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [maxHeight]);

  const emitFromDom = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const text = serializeMentionEditor(el);
    lastEmitted.current = text;
    onChange(text);
    const caret = getSerializedCaretOffset(el);
    onCaretActivity?.(text, caret);
    autoSize();
    // placeholder visibility
    el.dataset.empty = isEmptyEditor(el) ? "true" : "false";
  }, [autoSize, onCaretActivity, onChange]);

  const syncCompositionVisualState = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    // IME input must not update the controlled value until composition ends,
    // but the provisional text should still hide the visual placeholder.
    el.dataset.empty = isEmptyEditor(el) ? "true" : "false";
    autoSize();
  }, [autoSize]);

  const hydrate = useCallback(
    (text: string) => {
      const el = rootRef.current;
      if (!el) return;
      const segments = textToSegments(text, resolve);
      renderSegmentsToEditor(el, segments);
      lastEmitted.current = text;
      el.dataset.empty = isEmptyEditor(el) ? "true" : "false";
      autoSize();
    },
    [autoSize, resolve],
  );

  // External value sync (skill cards, draft restore, clear after send).
  useEffect(() => {
    if (value === lastEmitted.current) return;
    const el = rootRef.current;
    if (!el) return;
    // Avoid clobbering during IME composition.
    if (composingRef.current) return;
    const current = serializeMentionEditor(el);
    if (current === value) {
      lastEmitted.current = value;
      return;
    }
    hydrate(value);
  }, [value, hydrate]);

  // Initial mount
  useEffect(() => {
    hydrate(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  // Refresh chip thumbnails when resolve map changes (upload finished).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.querySelectorAll<HTMLElement>("[data-mention-name]").forEach((chip) => {
      const name = chip.dataset.mentionName;
      if (!name) return;
      const meta = resolve(name);
      if (!meta) return;
      if (meta.kind) chip.dataset.mentionKind = meta.kind;
      if (meta.artifactId) chip.dataset.artifactId = meta.artifactId;
      if (meta.localId) chip.dataset.localId = meta.localId;
      const img = chip.querySelector("img");
      if (meta.thumbSrc && img && img.src !== meta.thumbSrc) {
        img.src = meta.thumbSrc;
      }
    });
  }, [resolve]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => rootRef.current?.focus(),
      blur: () => rootRef.current?.blur(),
      getSerializedText: () =>
        rootRef.current ? serializeMentionEditor(rootRef.current) : "",
      getCaretOffset: () =>
        rootRef.current ? getSerializedCaretOffset(rootRef.current) : 0,
      setCaretOffset: (offset: number) => {
        if (rootRef.current) setSerializedCaretOffset(rootRef.current, offset);
      },
      insertMention: (meta, range) => {
        const el = rootRef.current;
        if (!el) return { text: value, cursor: value.length };
        el.focus();
        const r =
          range ??
          (() => {
            const caret = getSerializedCaretOffset(el);
            return { start: caret, end: caret };
          })();
        const result = insertMentionChipInEditor(el, r, meta);
        lastEmitted.current = result.text;
        onChange(result.text);
        onCaretActivity?.(result.text, result.cursor);
        el.dataset.empty = "false";
        autoSize();
        return result;
      },
      replaceRange: (range, insert) => {
        const el = rootRef.current;
        if (!el) return { text: value, cursor: value.length };
        el.focus();
        const result = replaceSerializedRangeWithText(el, range, insert);
        lastEmitted.current = result.text;
        onChange(result.text);
        onCaretActivity?.(result.text, result.cursor);
        el.dataset.empty = isEmptyEditor(el) ? "true" : "false";
        autoSize();
        return result;
      },
      clear: () => {
        const el = rootRef.current;
        if (!el) return;
        el.replaceChildren();
        lastEmitted.current = "";
        onChange("");
        el.dataset.empty = "true";
        autoSize();
      },
      autoSize,
      containsNode: (node) =>
        Boolean(node && rootRef.current && rootRef.current.contains(node)),
    }),
    [autoSize, onCaretActivity, onChange, value],
  );

  const handleInput = (_e: FormEvent<HTMLDivElement>) => {
    if (composingRef.current) {
      syncCompositionVisualState();
      return;
    }
    emitFromDom();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Backspace" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const el = rootRef.current;
      const result = el ? deleteMentionChipBeforeCaret(el) : null;
      if (result) {
        e.preventDefault();
        lastEmitted.current = result.text;
        onChange(result.text);
        onCaretActivity?.(result.text, result.cursor);
        if (el) el.dataset.empty = isEmptyEditor(el) ? "true" : "false";
        autoSize();
        return;
      }
    }
    onKeyDown?.(e);
  };

  const handleKeyUp = () => {
    if (composingRef.current) return;
    const el = rootRef.current;
    if (!el) return;
    const text = serializeMentionEditor(el);
    const caret = getSerializedCaretOffset(el);
    onCaretActivity?.(text, caret);
  };

  const handleClick = () => {
    const el = rootRef.current;
    if (!el) return;
    const text = serializeMentionEditor(el);
    const caret = getSerializedCaretOffset(el);
    onCaretActivity?.(text, caret);
  };

  const handlePasteInternal = (e: ClipboardEvent<HTMLDivElement>) => {
    // Prefer Composer-level paste (images/files). If not prevented, plain text only.
    onPaste?.(e);
    if (e.defaultPrevented) return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    const doc = e.currentTarget.ownerDocument;
    const sel = doc.getSelection();
    if (!sel || !sel.rangeCount) return;
    sel.deleteFromDocument();
    const node = doc.createTextNode(text);
    const range = sel.getRangeAt(0);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    emitFromDom();
  };

  return (
    <div className="relative min-w-0 flex-1">
      <div
        ref={rootRef}
        id={id}
        role="textbox"
        aria-multiline="true"
        aria-controls={ariaControls}
        aria-expanded={ariaExpanded}
        aria-autocomplete={ariaAutocomplete}
        aria-placeholder={placeholder}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-empty="true"
        data-placeholder={placeholder ?? ""}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onClick={handleClick}
        onPaste={handlePasteInternal}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionUpdate={syncCompositionVisualState}
        onCompositionEnd={() => {
          composingRef.current = false;
          emitFromDom();
        }}
        className={`mention-prompt-editor relative w-full max-w-full overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-3 text-[#241E36] outline-none ring-0 focus:outline-none focus-visible:outline-none data-[empty=true]:before:pointer-events-none data-[empty=true]:before:absolute data-[empty=true]:before:left-3 data-[empty=true]:before:right-3 data-[empty=true]:before:top-2 data-[empty=true]:before:text-[#8A8298] data-[empty=true]:before:content-[attr(data-placeholder)] ${minHeightClass} ${className}`}
        style={{ maxHeight }}
      />
    </div>
  );
});

export default MentionPromptEditor;
