// Sector Control is played with a keyboard and a captured mouse. Phones and
// tablets without a mouse get a short notice before the battle loads, because
// building a 50v50 battlefield can exhaust a phone's memory before the
// briefing appears, and there is no way to play once it does.

export interface InputSupport {
  /** Some connected pointer can hover and point precisely: a mouse or trackpad. */
  finePointer: boolean;
  /** The primary pointer is a finger. */
  coarsePointer: boolean;
  /** Touch points the device reports; above zero on touchscreens. */
  touchPoints: number;
  /** The browser implements the Pointer Lock API. */
  pointerLock: boolean;
}

/** Diagnostic and automated runs bypass the notice; so does `?desktop`. */
export const gateBypassParams = ["desktop", "demo", "autoplay", "playtest"] as const;

export function needsDesktopNotice(input: InputSupport, params: URLSearchParams): boolean {
  if (gateBypassParams.some((p) => params.has(p))) return false;
  // Without pointer lock the mouse cannot be captured, so nothing is playable.
  if (!input.pointerLock) return true;
  // A touchscreen laptop or an iPad with a trackpad reports a fine pointer
  // as well; only devices with no mouse at all get the notice.
  return !input.finePointer && (input.coarsePointer || input.touchPoints > 0);
}

export function readInputSupport(): InputSupport {
  const query = (q: string) => typeof matchMedia === "function" && matchMedia(q).matches;
  return {
    finePointer: query("(any-pointer: fine)"),
    coarsePointer: query("(pointer: coarse)"),
    touchPoints: navigator.maxTouchPoints ?? 0,
    pointerLock: typeof Element !== "undefined" && "requestPointerLock" in Element.prototype,
  };
}

export function deviceGateHTML(base: string, canShare: boolean): string {
  return `<div class="overlay device-gate"><section class="panel">
  <div class="eyebrow">SECTOR CONTROL</div>
  <img class="device-gate-preview" src="${base}previews/verdun.jpg" alt="A squad advancing through the Verdun forest" width="640" height="360">
  <h1>Play on a computer</h1>
  <p>Sector Control needs a keyboard and mouse. You aim by moving the mouse and use about twenty keys, so it can't be played on a touchscreen. Open this page in a desktop browser to deploy.</p>
  <button id="device-gate-link">${canShare ? "Share link" : "Copy link"} <span>→</span></button>
  <p class="device-gate-status" id="device-gate-status" role="status"></p>
  <a class="secondary armory-link" href="${base}armory/">Browse the Armory</a>
  <button class="device-gate-anyway" id="device-gate-anyway">Try anyway</button>
  <div class="fine">DESKTOP · KEYBOARD AND MOUSE · WEBGL 2</div>
</section></div>`;
}

/** Shows the notice in `root`; resolves when the player chooses to load anyway. */
export function showDeviceGate(root: HTMLElement, base: string): Promise<void> {
  const canShare = typeof navigator.share === "function";
  root.innerHTML = deviceGateHTML(base, canShare);
  const status = root.querySelector<HTMLElement>("#device-gate-status")!;
  const url = location.href.split("#")[0];
  root.querySelector<HTMLButtonElement>("#device-gate-link")!.onclick = async () => {
    try {
      if (canShare) {
        await navigator.share({ title: "Sector Control", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      status.textContent = "Link copied. Open it on your computer.";
    } catch (error) {
      // Dismissing the share sheet is not an error worth reporting.
      if ((error as Error)?.name === "AbortError") return;
      status.textContent = url;
    }
  };
  return new Promise((resolve) => {
    root.querySelector<HTMLButtonElement>("#device-gate-anyway")!.onclick = () => {
      root.innerHTML = "";
      resolve();
    };
  });
}
