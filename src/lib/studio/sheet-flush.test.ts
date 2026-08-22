import { describe, expect, it } from "vitest";
import { flushOpenSheetEdits, registerSheetFlusher } from "./sheet-flush";

describe("sheet flush", () => {
  it("reports only workbooks that had unsaved edits", async () => {
    const unregisterClean = registerSheetFlusher(async () => false);
    const unregisterDirty = registerSheetFlusher(async () => true);

    await expect(flushOpenSheetEdits()).resolves.toBe(1);

    unregisterClean();
    unregisterDirty();
  });
});
