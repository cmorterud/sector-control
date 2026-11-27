// The "Front line" HUD preset: a minimal, presentation-only HUD for players
// who want the battlefield rather than the dashboard. It changes nothing about
// the rules. The standard HUD stays the default.
export type HudPreset = "standard" | "frontLine";

export const frontLineRules = {
  /** How long pressing reload shows the ammo card, so a full magazine can be checked. */
  ammoPeekMs: 2500,
  /** Floating flag markers show only within this distance of the player, in meters. */
  flagLabelRange: 30,
};

export interface AmmoCardState {
  /** Crewing a tank, a mounted gun or a mortar: the weapon's own panel stays. */
  crewing: boolean;
  reloading: boolean;
  /** A barrel cooling off; the gunner needs to know why the gun stopped. */
  overheated: boolean;
  now: number;
  peekUntil: number;
}

/** Whether the bottom-right weapon card shows under the Front line preset. */
export function frontLineAmmoShown(s: AmmoCardState): boolean {
  return s.crewing || s.reloading || s.overheated || s.now < s.peekUntil;
}

/** Whether a flag's floating marker shows under the Front line preset. */
export function frontLineFlagShown(distance: number): boolean {
  return distance <= frontLineRules.flagLabelRange;
}
