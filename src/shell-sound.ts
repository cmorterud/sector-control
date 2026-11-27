// What each kind of shell and trench-mortar bomb sounds like on its way in,
// and the path it takes, so a soldier can tell by ear what is coming and
// where it will fall. Front-line slang named shells after their sound: the
// field gun's "whizz-bang", whose bang came almost with the whizz; heavies
// that rushed in "like trains"; the Stokes bomb's wail, the "mouth organ";
// the "carpet slipper" shuffling high overhead toward the rear.
// Presentation only: every path is read from shells the simulation (or the
// battery plan that mirrors it) already has, and no game RNG is drawn.
import { shellDrop } from "./artillery";
import { shotPosition, shotVelocity, type BatteryShot } from "./artillery-battery";
import { mortarStats } from "./mortar-stats";
import type { V3 } from "./simulation";

export type ShellSound =
  | "field"
  | "heavy"
  | "naval"
  | "gas"
  | "stokes"
  | "granatenwerfer"
  | "crapouillot"
  | "garland"
  | "spigot"
  | "overhead";

export interface ShellVoice {
  // Seconds the shell is heard before it lands (for "overhead", the pass).
  lead: number;
  // Heard only when its path comes this close to the listener, in meters.
  reach: number;
  // A band of noise: the air torn by the shell, sweeping down as it comes.
  rush: { from: number; to: number; q: number; level: number };
  // A pitched voice over the rush: the whistle of a driving band, or the
  // reedy two-note wail of a Stokes bomb (`interval` adds the second note).
  tone?: { from: number; to: number; level: number; type: OscillatorType; interval?: number };
  // Tumbling or finned bombs throb: the level swings at `rate` Hz by `depth`.
  flutter?: { rate: number; depth: number };
  // A heavy's low roar under the rush, as a fraction of its level.
  rumble?: number;
  // How late the sound swells: 1 rises evenly, higher holds it back until
  // the last moment (a whizz-bang is nearly all at the end).
  swell: number;
  // Rises then fades away (a shell passing over) instead of building to a burst.
  pass?: boolean;
}

export const shellVoices: Record<ShellSound, ShellVoice> = {
  // A field howitzer's shell: a falling whistle over a tearing rush.
  field: {
    lead: 1.1, reach: 85, swell: 3,
    rush: { from: 2600, to: 900, q: 1.2, level: 0.55 },
    tone: { from: 1500, to: 420, level: 0.4, type: "sine" },
  },
  // The heavy stray: a long, deep rush that builds like a train coming on,
  // with a low roar and the chuff of the shell turning over.
  heavy: {
    lead: 2.6, reach: 150, swell: 2,
    rush: { from: 900, to: 240, q: 0.7, level: 1 },
    flutter: { rate: 11, depth: 0.3 },
    rumble: 0.9,
  },
  // A warship's flat, fast shell: almost no warning, a rip then the burst.
  naval: {
    lead: 0.25, reach: 90, swell: 5,
    rush: { from: 4200, to: 1600, q: 0.9, level: 1 },
  },
  // A gas shell: lighter, with a wobbling whistle as it tumbles.
  gas: {
    lead: 1.2, reach: 70, swell: 2.5,
    rush: { from: 2000, to: 800, q: 1, level: 0.3 },
    tone: { from: 1100, to: 600, level: 0.35, type: "sine" },
    flutter: { rate: 6.5, depth: 0.6 },
  },
  // The Stokes bomb's wail: two reedy notes sliding down together.
  stokes: {
    lead: 1.2, reach: 45, swell: 1.6,
    rush: { from: 1800, to: 900, q: 1, level: 0.2 },
    tone: { from: 980, to: 690, level: 0.42, type: "triangle", interval: 1.5 },
    flutter: { rate: 5, depth: 0.15 },
  },
  // The Granatenwerfer's finned spigot bomb: a fast whirring flutter.
  granatenwerfer: {
    lead: 1.2, reach: 45, swell: 1.8,
    rush: { from: 3000, to: 1500, q: 3, level: 0.6 },
    flutter: { rate: 16, depth: 0.7 },
  },
  // The crapouillot's big finned bomb: a heavier wobble and a low whistle.
  crapouillot: {
    lead: 1.2, reach: 45, swell: 1.8,
    rush: { from: 1400, to: 700, q: 1, level: 0.5 },
    tone: { from: 700, to: 380, level: 0.25, type: "sine" },
    flutter: { rate: 9, depth: 0.5 },
  },
  // The Garland's shafted jam-tin bomb: an end-over-end whoosh.
  garland: {
    lead: 1.2, reach: 45, swell: 1.6,
    rush: { from: 1600, to: 700, q: 0.8, level: 0.5 },
    flutter: { rate: 4, depth: 0.8 },
  },
  // The Ottoman spigot thrower: like the Granatenwerfer, a little lower.
  spigot: {
    lead: 1.2, reach: 45, swell: 1.8,
    rush: { from: 2500, to: 1200, q: 2.5, level: 0.55 },
    flutter: { rate: 13, depth: 0.65 },
  },
  // A heavy shell passing high over the sector for the rear areas: a soft,
  // shuffling rush that swells and fades away. It never lands here.
  overhead: {
    lead: 3.4, reach: 400, swell: 1, pass: true,
    rush: { from: 700, to: 380, q: 0.6, level: 0.9 },
    flutter: { rate: 3, depth: 0.2 },
  },
};

// Which voice a trench-mortar bomb has, by the tube's name.
export function mortarSound(weaponId: string | undefined): ShellSound {
  const id = mortarStats.find((m) => m.name === weaponId)?.id;
  return id === "granatenwerfer" || id === "crapouillot" || id === "garland" || id === "stokes"
    ? id
    : id === "ottoman-spigot"
      ? "spigot"
      : "stokes";
}

// A point on the way in, `t` seconds after the sound starts.
export type PathPoint = { t: number; at: V3 };

// Points along a battery shell's flight from `fromTick` to its burst: the
// plan's arc up to the hand-off, then the simulation's 16-tick drop.
export function batteryPath(shot: BatteryShot, fromTick: number, dropTicks: number, points = 6): PathPoint[] {
  const impactTick = shot.handoffTick + dropTicks;
  const start = Math.max(shot.fireTick, Math.min(fromTick, impactTick));
  const handoff = (shot.handoffTick - shot.fireTick) / 30;
  const h = shotPosition(shot, handoff), v = shotVelocity(shot, handoff);
  const out: PathPoint[] = [];
  for (let i = 0; i <= points; i++) {
    const tick = start + ((impactTick - start) * i) / points;
    const seconds = (tick - shot.fireTick) / 30;
    let at: V3;
    if (seconds <= handoff) at = shotPosition(shot, seconds);
    else {
      const d = seconds - handoff;
      at = { x: h.x + v.x * d, y: h.y + v.y * d - (shellDrop.gravity * d * d) / 2, z: h.z + v.z * d };
    }
    out.push({ t: (tick - start) / 30, at });
  }
  return out;
}

// Points along a ballistic flight from where it is now until it lands.
export function ballisticPath(at: V3, velocity: V3, gravity: number, seconds: number, points = 6): PathPoint[] {
  const out: PathPoint[] = [];
  for (let i = 0; i <= points; i++) {
    const t = (seconds * i) / points;
    out.push({ t, at: { x: at.x + velocity.x * t, y: at.y + velocity.y * t - (gravity * t * t) / 2, z: at.z + velocity.z * t } });
  }
  return out;
}

// The nearest the path comes to the listener, sampled between its points.
export function closestApproach(path: PathPoint[], ear: V3) {
  let best = Infinity;
  for (let i = 0; i < path.length; i++) {
    const a = path[i].at, b = path[Math.min(i + 1, path.length - 1)].at;
    for (let k = 0; k < 4; k++) {
      const f = k / 4;
      best = Math.min(best, Math.hypot(a.x + (b.x - a.x) * f - ear.x, a.y + (b.y - a.y) * f - ear.y, a.z + (b.z - a.z) * f - ear.z));
    }
  }
  return best;
}

// A shell passing high over the sector toward the rear, from one side's
// guns to the other's back areas. `n` in [0, 1) picks the side and line, so
// the caller decides when (from the match clock, not the game's RNG).
export function overheadPass(ear: V3, n: number, span = 420, height = 110): PathPoint[] {
  const side = n < 0.5 ? -1 : 1, z = ear.z + (((n * 7.31) % 1) - 0.5) * 80;
  const seconds = shellVoices.overhead.lead, out: PathPoint[] = [];
  for (let i = 0; i <= 6; i++) {
    const f = i / 6;
    // A slight arc: highest over the middle of the field.
    out.push({ t: seconds * f, at: { x: side * span * (0.5 - f), y: height + 25 * Math.sin(f * Math.PI), z } });
  }
  return out;
}
