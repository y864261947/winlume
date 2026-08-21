/**
 * Give React and the browser one complete frame to paint urgent feedback
 * before starting CPU-heavy client work such as workbook serialization.
 */
export function afterNextPaint(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}
