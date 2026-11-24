// Illumination: a star shell called like artillery, on its own cooldown. It
// bursts high over the target, sinks on its parachute and lights the ground
// beneath it. Only night maps have flares. The light feeds the darkness rule
// in src/night.ts, so a flare shows soldiers to players and bots alike.
import { dist, playArea, type Vec } from "./map";
import type { Game, Soldier, Team } from "./simulation";
import { artillerySector } from "./artillery-sectors";
import { teamHasHuman } from "./artillery";

export const flareRules = {
  // Separate from the artillery cooldown: lighting the field never costs a barrage.
  cooldown: 20 * 30,
  initialDelay: 5 * 30,
  // From the call to the burst overhead.
  flightTicks: 3 * 30,
  burnTicks: 25 * 30,
  // It bursts this high and has sunk to this height when it burns out.
  burstHeight: 42,
  endHeight: 14,
  // Ground lit to this radius under a fresh flare.
  radius: 45,
  // The last seconds gutter out.
  fadeTicks: 3 * 30,
  // Meters per second the parachute drifts on the night wind.
  drift: 0.7,
  // A caller cannot put one closer than this to the edge of the play area.
  edgeMargin: 4,
};

export interface Flare {
  id: number;
  team: Team;
  actor: number;
  x: number;
  z: number;
  // Wind direction for this flare, radians.
  heading: number;
  burstAt: number;
  endsAt: number;
}
export interface FlareState {
  readyAt: Record<Team, number>;
  // Called and on the way up, and burning overhead.
  flares: Flare[];
  sequence: number;
}
export const createFlareState = (): FlareState => ({
  readyAt: { blue: flareRules.initialDelay, red: flareRules.initialDelay },
  flares: [],
  sequence: 0,
});

type Lit = { tick: number; flares?: FlareState };
// Where a flare hangs at `tick`, or null before it bursts or after it burns out.
export function flarePosition(flare: Flare, tick: number) {
  if (tick < flare.burstAt || tick >= flare.endsAt) return null;
  const age = tick - flare.burstAt, burn = flare.endsAt - flare.burstAt, seconds = age / 30;
  return {
    x: flare.x + Math.cos(flare.heading) * flareRules.drift * seconds,
    y: flareRules.burstHeight + (flareRules.endHeight - flareRules.burstHeight) * (age / burn),
    z: flare.z + Math.sin(flare.heading) * flareRules.drift * seconds,
  };
}
// How strongly it burns, 0 to 1: a quick flare-up, a steady burn with a slight
// flicker, and a guttering end. Deterministic, so every client and bot agrees.
export function flareBrightness(flare: Flare, tick: number) {
  if (tick < flare.burstAt || tick >= flare.endsAt) return 0;
  const age = tick - flare.burstAt, left = flare.endsAt - tick;
  const flicker = 0.94 + 0.06 * Math.sin(age * 0.9 + flare.id * 2.1);
  return Math.min(1, age / 9) * Math.min(1, left / flareRules.fadeTicks) * flicker;
}
// Light on the ground at `p` from every burning flare, 0 to 1.
export function flareLight(g: Lit, p: Vec): number {
  let light = 0;
  for (const flare of g.flares?.flares ?? []) {
    const at = flarePosition(flare, g.tick);
    if (!at) continue;
    const d = Math.hypot(p.x - at.x, p.z - at.z);
    if (d < flareRules.radius) light = Math.max(light, flareBrightness(flare, g.tick) * (1 - (d / flareRules.radius) ** 2));
  }
  return light;
}

export function flareTargetReason(g: Game, p: Soldier, target: Vec & { area?: boolean }): string | null {
  if (!g.map.night || g.phase !== "playing") return "No flares on this battlefield";
  if (teamHasHuman(g, p) && !g.humanPlayerIds.includes(p.id)) return "Flares are reserved for your team's human player";
  if (p.hp <= 0) return "Redeploy before calling a flare";
  if (!Number.isFinite(target.x) || !Number.isFinite(target.z)) return "Choose a target";
  const area = playArea(g.map);
  if (Math.abs(target.x) > area.width / 2 || Math.abs(target.z) > area.depth / 2) return "Choose a sector on the map";
  if (g.tick < g.flares.readyAt[p.team]) return "Flare pistol is reloading";
  return null;
}
export function requestFlare(g: Game, p: Soldier, target: Vec & { area?: boolean }): boolean {
  if (flareTargetReason(g, p, target)) return false;
  const area = playArea(g.map), at = target.area ? artillerySector(g.map, target) : target;
  const clamp = (v: number, half: number) => Math.max(-half + flareRules.edgeMargin, Math.min(half - flareRules.edgeMargin, v));
  const flare: Flare = {
    id: ++g.flares.sequence,
    team: p.team,
    actor: p.id,
    x: clamp(at.x, area.width / 2),
    z: clamp(at.z, area.depth / 2),
    // The wind blows along the front, so neither side's flares drift onto the
    // other's ground: the same wind all night, turning a little from flare to flare.
    heading: Math.PI / 2 + 0.35 * Math.sin(g.flares.sequence * 1.7),
    burstAt: g.tick + flareRules.flightTicks,
    endsAt: g.tick + flareRules.flightTicks + flareRules.burnTicks,
  };
  g.flares.flares.push(flare);
  g.flares.readyAt[p.team] = g.tick + flareRules.cooldown;
  g.emit({ type: "flare", phase: "call", flare: flare.id, actor: p.id, team: p.team, at: { x: flare.x, z: flare.z }, burstAt: flare.burstAt, endsAt: flare.endsAt });
  return true;
}
export function advanceFlares(g: Game) {
  for (const flare of g.flares.flares) {
    if (g.tick === flare.burstAt)
      g.emit({ type: "flare", phase: "burst", flare: flare.id, actor: flare.actor, team: flare.team, at: { x: flare.x, z: flare.z }, burstAt: flare.burstAt, endsAt: flare.endsAt });
  }
  if (g.flares.flares.some((flare) => g.tick >= flare.endsAt)) g.flares.flares = g.flares.flares.filter((flare) => g.tick < flare.endsAt);
}

// A bot sends one up over enemies it has heard firing but cannot see, and
// otherwise, now and then, over no-man's land ahead of its own line.
export function botFlareTarget(g: Game, p: Soldier): Vec | null {
  if (!g.map.night || g.tick < g.flares.readyAt[p.team] || g.tick % 30 !== p.id % 30 || teamHasHuman(g, p) || p.hp <= 0) return null;
  const dark = (q: Vec) => flareLight(g, q) < 0.25;
  const heard = g.players.filter((q) => q.hp > 0 && q.team !== p.team && g.tick - q.lastShotAt < 90 && dist(p, q) > 18 && dist(p, q) < 80 && dark(q));
  // The busiest spot first.
  heard.sort((a, b) => heard.filter((q) => dist(q, b) < 15).length - heard.filter((q) => dist(q, a) < 15).length || dist(p, a) - dist(p, b));
  const target = heard[0] ? { x: heard[0].x, z: heard[0].z }
    // Nothing heard: a nervous sentry lights the ground in front every so often.
    : g.tick - (g.flares.readyAt[p.team] - flareRules.cooldown) > 45 * 30 && dark({ x: 0, z: p.z }) ? { x: 0, z: p.z } : null;
  return target && !flareTargetReason(g, p, target) ? target : null;
}
