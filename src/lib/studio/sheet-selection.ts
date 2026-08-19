export type SheetSelectionPreview = {
  /** Artifact id of the workbook the selection was made in. */
  artifactId: string;
  /** Plain A1 range, e.g. "A1:C3" (no sheet prefix). */
  range: string;
  /** Active sheet's name — shown only as a hover tooltip, never in the chip's text. */
  sheetName: string;
};

type Listener = (preview: SheetSelectionPreview | null) => void;

const listeners = new Set<Listener>();

/**
 * The open sheet editor broadcasts its live hover/drag selection so any
 * mounted composer for this session can show it as a "pin to reference"
 * preview. `null` clears the preview (e.g. the sheet closed). A Set (not a
 * single slot) because mobile/desktop layouts can both keep a composer
 * mounted at once.
 */
export function subscribeSheetSelection(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishSheetSelection(preview: SheetSelectionPreview | null): void {
  for (const listener of listeners) listener(preview);
}
