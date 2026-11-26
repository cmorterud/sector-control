// The menu card is the only thing on the landing screen that scrolls, so a
// mouse wheel anywhere on the screen scrolls the card, not only over it.

const LINE_PIXELS = 16;

/** Converts a wheel event's vertical delta to pixels, whatever unit the browser reports. */
export function wheelPixels(deltaY: number, deltaMode: number, pageHeight: number) {
  if (deltaMode === 1) return deltaY * LINE_PIXELS;
  if (deltaMode === 2) return deltaY * pageHeight;
  return deltaY;
}

/** Scrolls the overlay's `.panel` when the wheel turns outside it. Over the panel, the browser scrolls it itself. */
export function forwardMenuWheel(overlay: HTMLElement) {
  overlay.addEventListener("wheel", (event) => {
    const panel = overlay.querySelector<HTMLElement>(":scope > .panel");
    if (!panel || panel.contains(event.target as Node)) return;
    event.preventDefault();
    panel.scrollBy({ top: wheelPixels(event.deltaY, event.deltaMode, panel.clientHeight) });
  }, { passive: false });
}
