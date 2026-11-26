// The hip-fire ring: a thin circle around the crosshair that shows, in first
// person, the cone a shot fired now lands inside (src/hip-fire.ts). It opens
// while the player moves, tightens when they crouch, closes as the sights come
// up and is gone once they are up. The scope hides it with the rest of the HUD.
import { hipSpread } from "./hip-fire";
import { firstPersonView, sighted } from "./player-view";
import type { Soldier } from "./simulation";

// Below this radius in pixels the ring would sit inside the crosshair glyph.
export const ringMinRadius = 9;

// Screen radius of a cone with this half-angle, for a camera whose vertical
// field of view is fovDegrees and a view this many pixels tall.
export function coneRadius(halfAngle: number, fovDegrees: number, viewHeight: number) {
  return Math.tan(halfAngle) / Math.tan(fovDegrees * Math.PI / 360) * viewHeight / 2;
}

// The ring's radius in pixels, or 0 when it should not show.
export function spreadRingRadius(p: Soldier, tick: number, fovDegrees: number, viewHeight: number) {
  if (!firstPersonView(p) || sighted(p, tick)) return 0;
  const radius = coneRadius(hipSpread(p, tick), fovDegrees, viewHeight);
  return radius >= ringMinRadius ? radius : 0;
}
