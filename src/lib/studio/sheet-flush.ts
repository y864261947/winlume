type SheetFlusher = () => Promise<boolean>;

const flushers = new Set<SheetFlusher>();

/**
 * The open sheet editor registers a flush so send can persist in-flight cell edits.
 * Mobile and desktop layouts can both keep a SheetEditor mounted (one CSS-hidden) at
 * once, so this tracks every registered flusher rather than a single active one.
 */
export function registerSheetFlusher(next: SheetFlusher): () => void {
  flushers.add(next);
  return () => {
    flushers.delete(next);
  };
}

export async function flushOpenSheetEdits(): Promise<number> {
  const results = await Promise.all(Array.from(flushers, (flush) => flush()));
  return results.filter(Boolean).length;
}
