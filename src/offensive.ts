import { groundHeight, type MapDefinition, type OffensivePlan, type Vec } from "./map";
import { flagContains } from "./domination";
import type { Game, Sector, Team } from "./simulation";

// Attack and defend: an optional mode for a map that sets MapDefinition.offensive.
// The defender starts holding every flag. Only the open phase's flags can
// change hands; later ones are locked, and a phase's flags lock in the
// attacker's hands once every one of them is taken. Each phase taken adds time
// to the clock and men to the attacker's pool, and moves the spawns. The
// attacker wins by taking the last phase; the defender by holding out until
// the clock runs down, or until the attacker's pool is spent and its last man
// falls (src/reinforcements.ts keeps the pool). Flag rings capture exactly as
// in domination, so Game.scoring stays "domination" and every flag system
// (rings, labels, the squad commander, trench assaults) keeps working; they
// ask objectiveOpen() which flags are in play.

export interface OffensiveState {
  attacker: Team;
  defender: Team;
  // Index of the open phase; phases.length once the attack has taken them all.
  phase: number;
  // Sector indices, phase by phase.
  phases: number[][];
  // Tick at which the attack fails if the open phase still stands.
  deadline: number;
  // When the open phase opened.
  since: number;
  result: "taken" | "time" | null;
}

export type OffensiveEvent =
  | { type: "offensive"; phase: "taken"; taken: number; next: number | null; flags: string[]; added: { seconds: number; reinforcements: number } }
  | { type: "offensive"; phase: "time" };

const other = (t: Team): Team => (t === "blue" ? "red" : "blue");

// The same battlefield played as plain domination (?mode=domination).
export function dominationMap(map: MapDefinition): MapDefinition {
  if (!map.offensive) return map;
  const { offensive: _, ...rest } = map;
  return rest;
}

export const offensiveTicks = (plan: OffensivePlan, taken: number) =>
  (plan.clock.start + plan.clock.perPhase * taken) * 30;

// The longest the attack can run: every phase taken on its last second.
export const offensiveDuration = (plan: OffensivePlan) => offensiveTicks(plan, plan.phases.length - 1);

// Every flag starts in the defender's hands.
export function createOffensive(map: MapDefinition, sectors: Sector[]): OffensiveState | undefined {
  const plan = map.offensive;
  if (!plan) return undefined;
  const defender = other(plan.attacker);
  for (const s of sectors) {
    s.owner = defender;
    s.control = defender === "blue" ? 1 : -1;
    s.contested = false;
  }
  return {
    attacker: plan.attacker,
    defender,
    phase: 0,
    phases: plan.phases.map((p) => p.flags.map((id) => sectors.findIndex((s) => s.id === id)).filter((i) => i >= 0)),
    deadline: offensiveTicks(plan, 0),
    since: 0,
    result: null,
  };
}

const indexOf = (g: Pick<Game, "sectors">, s: Sector | number) => (typeof s === "number" ? s : g.sectors.indexOf(s));

// Whether a flag can change hands now: always, outside this mode.
export function objectiveOpen(g: Pick<Game, "offensive" | "sectors">, s: Sector | number): boolean {
  const o = g.offensive;
  return !o || !!o.phases[o.phase]?.includes(indexOf(g, s));
}

// Whether a point stands in a locked flag's ring (a later phase's, or one
// already taken). Bots keep out of these: a soldier crouched in a locked
// flag's pit looks as though he is trying to take it.
export function inLockedRing(g: Pick<Game, "offensive" | "sectors" | "map" | "collision">, at: Vec): boolean {
  if (!g.offensive) return false;
  const p = { ...at, y: groundHeight(at.x, at.z, g.map) };
  return g.sectors.some((s, i) => !objectiveOpen(g, i) && flagContains(g as Game, p, s));
}

// The phase a flag belongs to, or -1.
export const flagPhase = (o: OffensiveState, i: number) => o.phases.findIndex((p) => p.includes(i));

// "open", "taken" (locked for the attacker) or "locked" (a later phase).
export function flagStatus(g: Pick<Game, "offensive" | "sectors">, s: Sector | number): "open" | "taken" | "locked" {
  const o = g.offensive;
  if (!o) return "open";
  const phase = flagPhase(o, indexOf(g, s));
  return phase === o.phase ? "open" : phase >= 0 && phase < o.phase ? "taken" : "locked";
}

// Where a side deploys now.
export function teamSpawn(g: Pick<Game, "map" | "offensive">, team: Team): Vec {
  const plan = g.map.offensive, o = g.offensive;
  if (!plan || !o) return g.map.spawn[team];
  for (let i = Math.min(o.phase, plan.phases.length - 1); i >= 0; i--) {
    const at = plan.phases[i].spawn?.[team];
    if (at) return at;
  }
  return g.map.spawn[team];
}

// How long a soldier of this side waits to redeploy. The defender comes back
// without limit, so in an attack it waits longer.
export const respawnTicks = (g: Pick<Game, "map" | "offensive">, team: Team) =>
  g.offensive && team === g.offensive.defender ? (g.map.offensive?.defenderRespawn ?? 5) * 30 : 150;

// Flags each side holds: the score strip and the end of match line.
function tally(g: Game) {
  g.scores.blue = g.sectors.filter((s) => s.owner === "blue").length;
  g.scores.red = g.sectors.filter((s) => s.owner === "red").length;
}

// Runs once a tick after flag capture. Locks a phase once the attacker holds
// all of it and opens the next; returns the winner when the attack is decided.
export function advanceOffensive(g: Game): Team | undefined {
  const o = g.offensive, plan = g.map.offensive;
  if (!o || !plan || g.phase !== "playing") return undefined;
  const open = o.phases[o.phase] ?? [];
  if (open.length && open.every((i) => g.sectors[i].owner === o.attacker)) {
    for (const i of open) {
      const s = g.sectors[i];
      s.control = o.attacker === "blue" ? 1 : -1;
      s.contested = false;
    }
    o.phase++;
    o.since = g.tick;
    const last = o.phase >= o.phases.length;
    const men = g.players.filter((p) => p.team === o.attacker).length;
    const added = last ? { seconds: 0, reinforcements: 0 } : {
      seconds: plan.clock.perPhase,
      reinforcements: Math.round(men * plan.pool.perPhase),
    };
    if (!last) {
      o.deadline = Math.max(o.deadline, g.tick) + added.seconds * 30;
      // The "low" warning is a share of what the side has to start the phase with.
      g.reinforcements.remaining[o.attacker] += added.reinforcements;
      g.reinforcements.pool[o.attacker] = g.reinforcements.remaining[o.attacker];
      g.reinforcements.low[o.attacker] = false;
    }
    g.emit({
      type: "offensive", phase: "taken", taken: o.phase, next: last ? null : o.phase,
      flags: open.map((i) => g.sectors[i].id), added,
    });
    tally(g);
    if (last) {
      o.result = "taken";
      return o.attacker;
    }
  }
  tally(g);
  if (g.tick >= o.deadline) {
    o.result = "time";
    g.emit({ type: "offensive", phase: "time" });
    return o.defender;
  }
  return undefined;
}
