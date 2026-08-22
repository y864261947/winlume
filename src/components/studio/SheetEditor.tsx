"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import sheetsZhCN from "@univerjs/preset-sheets-core/locales/zh-CN";
import { CommandType, createUniver, defaultTheme, LocaleType } from "@univerjs/presets";
import {
  compactToUniverSnapshot,
  parseSheetContent,
  replaceUniverSnapshot,
  serializeSheetContent,
  type SheetArtifactContent,
} from "@/lib/agent/sheet-content";
import { registerSheetFlusher } from "@/lib/studio/sheet-flush";
import { publishSheetSelection } from "@/lib/studio/sheet-selection";
import { useStudioTheme } from "./StudioShell";

import "@univerjs/preset-sheets-core/lib/index.css";

type UniverRange = unknown;

type UniverWorksheet = {
  getSheetName: () => string;
  getRange: (
    range: UniverRange,
  ) => { getA1Notation: (withSheet?: boolean) => string };
};

type UniverEventPayload = {
  type?: number;
  worksheet?: UniverWorksheet;
  selections?: UniverRange[];
};

type UniverAPI = {
  Event: { CommandExecuted: string; SelectionChanged: string; SelectionMoving: string };
  addEvent: (
    event: string,
    callback: (payload: UniverEventPayload) => void,
  ) => { dispose: () => void };
  createWorkbook: (data: Record<string, unknown>) => { save: () => unknown };
};

const studioDarkUniverTheme = {
  ...defaultTheme,
  white: "#101722",
  black: "#F8FAFC",
  primary: {
    ...defaultTheme.primary,
    50: "#111B2B",
    100: "#15243A",
    200: "#233654",
    300: "#3A5C84",
    400: "#7DD3FC",
    500: "#38BDF8",
    600: "#0EA5E9",
    700: "#0284C7",
    800: "#0369A1",
    900: "#075985",
  },
  gray: {
    ...defaultTheme.gray,
    50: "#101722",
    100: "#172131",
    200: "#263246",
    300: "#52627A",
    400: "#718096",
    500: "#94A3B8",
    600: "#CBD5E1",
    700: "#D1D5DB",
    800: "#E5E7EB",
    900: "#F8FAFC",
  },
};

type Props = {
  artifactId: string;
  artifactName: string;
  content: string;
  locked?: boolean;
};

async function persistSheet(artifactId: string, serialized: string): Promise<void> {
  const response = await fetch(`/api/artifacts/${encodeURIComponent(artifactId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ content: serialized }),
  });
  if (response.ok) return;

  let message = "保存表格失败";
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) message = body.error;
  } catch {
    // Keep the generic message when the server returns a non-JSON body.
  }
  const error = new Error(message) as Error & { status?: number };
  error.status = response.status;
  throw error;
}

/** After a 409 revision conflict, adopt the server's revision so the next save doesn't immediately conflict again. */
async function fetchLatestRevision(artifactId: string): Promise<number | null> {
  try {
    const response = await fetch(`/api/artifacts/${encodeURIComponent(artifactId)}`, {
      credentials: "same-origin",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { content?: unknown };
    if (typeof body.content !== "string") return null;
    return parseSheetContent(body.content)?.revision ?? null;
  } catch {
    return null;
  }
}

function disposeUniverLater(
  univer: { dispose: () => void } | null,
  host: HTMLElement | null,
): void {
  const instance = univer;
  window.setTimeout(() => {
    try {
      instance?.dispose();
    } catch {
      // Univer mounts its own React roots; disposing during a parent render races.
    }
    if (!host?.isConnected) return;
    while (host.firstChild) {
      try {
        host.removeChild(host.firstChild);
      } catch {
        break;
      }
    }
  }, 0);
}

export default function SheetEditor({
  artifactId,
  artifactName,
  content,
  locked = false,
}: Props) {
  const studioTheme = useStudioTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const parsedRef = useRef<SheetArtifactContent | null>(parseSheetContent(content));
  const nameRef = useRef(artifactName);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeFlushRef = useRef<Promise<boolean> | null>(null);
  const hydratingRef = useRef(true);
  const dirtyRef = useRef(false);
  const dirtyVersionRef = useRef(0);
  const lockedRef = useRef(locked);
  const workbookRef = useRef<{ save: () => unknown } | null>(null);
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const savedPulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => Promise<boolean>>(async () => false);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    nameRef.current = artifactName;
  }, [artifactName]);

  const captureContent = useCallback((): string | null => {
    const current = parsedRef.current;
    const workbook = workbookRef.current;
    if (!current || !workbook) return null;
    try {
      const snapshot = workbook.save();
      const next = replaceUniverSnapshot(current, snapshot);
      parsedRef.current = next;
      return serializeSheetContent(next);
    } catch {
      return null;
    }
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (activeFlushRef.current) {
      return activeFlushRef.current.then(() =>
        dirtyRef.current ? flushRef.current() : false,
      );
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (lockedRef.current || hydratingRef.current || !dirtyRef.current) return false;
    const dirtyVersion = dirtyVersionRef.current;
    // Start on the next microtask so activeFlushRef is populated even when
    // captureContent returns early, then always release it for the next flush.
    const pending = Promise.resolve()
      .then(async () => {
        const serialized = captureContent();
        if (!serialized) return false;
        await persistSheet(artifactId, serialized);
        // Edits can land while a previous autosave is in flight. Only clear
        // the dirty marker when this snapshot is still the latest one.
        dirtyRef.current = dirtyVersionRef.current !== dirtyVersion;
        setSaveError(null);
        setJustSaved(true);
        if (savedPulseTimer.current) clearTimeout(savedPulseTimer.current);
        savedPulseTimer.current = setTimeout(() => setJustSaved(false), 2000);
        return true;
      })
      .catch(async (error: unknown) => {
        if ((error as { status?: number }).status === 409) {
          const latestRevision = await fetchLatestRevision(artifactId);
          if (latestRevision != null && parsedRef.current) {
            parsedRef.current = { ...parsedRef.current, revision: latestRevision };
          }
        }
        throw error;
      })
      .finally(() => {
        activeFlushRef.current = null;
      });
    activeFlushRef.current = pending;
    return pending;
  }, [artifactId, captureContent]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => registerSheetFlusher(() => flushRef.current()), [artifactId]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (savedPulseTimer.current) clearTimeout(savedPulseTimer.current);
    },
    [],
  );

  const retrySave = useCallback(() => {
    setRetrying(true);
    flushRef
      .current()
      .catch((error: unknown) => {
        setSaveError(error instanceof Error ? error.message : "保存表格失败");
      })
      .finally(() => setRetrying(false));
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const parsed = parsedRef.current ?? parseSheetContent(content);
    if (!host || !parsed) {
      setInitError("表格内容无法打开");
      return;
    }

    parsedRef.current = parsed;
    hydratingRef.current = true;
    dirtyRef.current = false;
    dirtyVersionRef.current = 0;
    setReady(false);
    setInitError(null);

    let disposed = false;
    let univer: { dispose: () => void } | null = null;
    let commandSub: { dispose: () => void } | null = null;
    let selectionSub: { dispose: () => void } | null = null;
    let selectionMovingSub: { dispose: () => void } | null = null;
    let hydrateTimer: ReturnType<typeof setTimeout> | null = null;
    let started = false;

    const start = () => {
      if (disposed) return;
      if (started) {
        window.dispatchEvent(new Event("resize"));
        return;
      }
      if (host.clientWidth < 80 || host.clientHeight < 240) return;
      started = true;

      try {
        const created = createUniver({
          locale: LocaleType.ZH_CN,
          locales: {
            [LocaleType.ZH_CN]: sheetsZhCN,
          },
          theme: studioTheme === "dark" ? studioDarkUniverTheme : defaultTheme,
          presets: [
            UniverSheetsCorePreset({
              container: host,
              header: true,
              toolbar: true,
              formulaBar: true,
              footer: { sheetBar: true, statisticBar: true, menus: true, zoomSlider: true },
            }),
          ],
        });
        univer = created.univer;
        const univerAPI = created.univerAPI as unknown as UniverAPI;
        const snapshot = (
          parsed.univerSnapshot && typeof parsed.univerSnapshot === "object"
            ? parsed.univerSnapshot
            : compactToUniverSnapshot(parsed, nameRef.current)
        ) as Record<string, unknown>;
        workbookRef.current = univerAPI.createWorkbook(snapshot);
        window.dispatchEvent(new Event("resize"));

        // Loading the initial snapshot fires its own MUTATION events. Rather than
        // guessing a fixed duration for that to finish, keep pushing the
        // "hydration complete" timer out as long as those events keep arriving,
        // so a large workbook that takes longer to load doesn't get its tail end
        // mistaken for a real user edit. Cap the total wait low: Univer can also
        // emit background MUTATION commands unrelated to the initial load (e.g.
        // formatting/recalc passes), and those must not routinely stretch every
        // open out to the cap.
        let hydrateDeadline: number | null = null;
        const scheduleHydrationComplete = () => {
          if (hydrateTimer) clearTimeout(hydrateTimer);
          if (hydrateDeadline == null) hydrateDeadline = Date.now() + 1200;
          const delay = Math.max(0, Math.min(150, hydrateDeadline - Date.now()));
          hydrateTimer = setTimeout(() => {
            hydratingRef.current = false;
            window.dispatchEvent(new Event("resize"));
            if (!disposed) setReady(true);
          }, delay);
        };

        commandSub = univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => {
          if (disposed || lockedRef.current) return;
          if (event.type !== CommandType.MUTATION) return;
          if (hydratingRef.current) {
            scheduleHydrationComplete();
            return;
          }
          dirtyRef.current = true;
          dirtyVersionRef.current += 1;
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            void flushRef.current().catch((error: unknown) => {
              setSaveError(error instanceof Error ? error.message : "保存表格失败");
            });
          }, 600);
        });

        // Mirror the user's active cell-range selection out to the composer as
        // a "pin to reference" preview. It stays until replaced by a new
        // selection, pinned, dismissed, or the sheet closes — no hover timing.
        const publishPreview = (event: UniverEventPayload) => {
          if (disposed || hydratingRef.current) return;
          try {
            const range = event.selections?.[0];
            const worksheet = event.worksheet;
            if (!range || !worksheet) return;
            publishSheetSelection({
              artifactId,
              range: worksheet.getRange(range).getA1Notation(),
              sheetName: worksheet.getSheetName(),
            });
          } catch {
            // Best-effort UX only — never let a facade API mismatch throw
            // inside Univer's own event dispatch loop.
          }
        };
        selectionSub = univerAPI.addEvent(univerAPI.Event.SelectionChanged, publishPreview);
        selectionMovingSub = univerAPI.addEvent(univerAPI.Event.SelectionMoving, publishPreview);

        scheduleHydrationComplete();
      } catch (error) {
        setInitError(error instanceof Error ? error.message : "表格编辑器未能启动");
      }
    };

    const startTimer = window.setTimeout(() => {
      const ro = new ResizeObserver(() => start());
      ro.observe(host);
      start();
      resizeObserver = ro;
    }, 0);

    let resizeObserver: ResizeObserver | null = null;

    return () => {
      // A theme switch recreates Univer. Snapshot a dirty workbook first so
      // the recreated instance starts from the user's latest grid state.
      if (!lockedRef.current && dirtyRef.current) {
        const serialized = captureContent();
        if (serialized) {
          void persistSheet(artifactId, serialized).catch((error: unknown) => {
            if (!disposed) {
              setSaveError(error instanceof Error ? error.message : "保存表格失败");
            }
          });
        }
      }
      disposed = true;
      workbookRef.current = null;
      window.clearTimeout(startTimer);
      if (hydrateTimer) clearTimeout(hydrateTimer);
      resizeObserver?.disconnect();
      commandSub?.dispose();
      selectionSub?.dispose();
      selectionMovingSub?.dispose();
      publishSheetSelection(null);
      disposeUniverLater(univer, host);
    };
    // Recreate when the workbook identity/revision or Studio theme changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifactId, studioTheme]);

  if (initError) {
    return <p className="px-4 py-6 text-sm text-rose-600">{initError}</p>;
  }

  return (
    <div className="reizo-sheet-editor min-h-[36rem] min-w-0 flex-1">
      {!ready ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-white/70 text-sm text-ink-400">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          正在打开表格…
        </div>
      ) : null}
      {locked ? (
        <div className="absolute inset-0 z-20 flex cursor-not-allowed items-start justify-center bg-white/35 pt-3">
          <p className="flex items-center gap-1.5 rounded-full border border-white/70 bg-white/90 px-3 py-1 text-xs text-ink-500 shadow-sm">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            模型正在改表，暂时不能编辑
          </p>
        </div>
      ) : null}
      {saveError ? (
        <p
          role="alert"
          className="absolute left-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700 shadow-sm"
        >
          <span className="min-w-0 truncate">表格未保存：{saveError}</span>
          <button
            type="button"
            onClick={retrySave}
            disabled={retrying}
            className="shrink-0 rounded border border-rose-300 px-1.5 py-0.5 font-medium hover:bg-rose-100 disabled:opacity-50"
          >
            {retrying ? "重试中…" : "重试"}
          </button>
        </p>
      ) : justSaved ? (
        <p className="absolute left-3 top-3 z-30 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700 shadow-sm">
          已保存
        </p>
      ) : null}
      <div ref={hostRef} className="reizo-sheet-editor__host" />
    </div>
  );
}
