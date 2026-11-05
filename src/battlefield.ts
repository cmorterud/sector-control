import {
  baseGroundHeight,
  groundHeight,
  type MapDefinition,
  type Vec,
} from "./map";
import { eyeHeightOf } from "./crouch";
import type { Event, Game, V3 } from "./simulation";

export type SoundKind =
  | "rifle"
  | "crack"
  | "mud"
  | "wood"
  | "concrete"
  | "grenade"
  | "artillery"
  | "whistle"
  | "debris";
export type SoundCue = {
  kind: SoundKind;
  at: V3;
  volume: number;
  local?: boolean;
  occluded?: boolean;
  distance: number;
  seed: number;
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));

const boardOffsets = [
  [0, 0],
  [-0.6, 0],
  [0.6, 0],
  [0, -0.85],
  [0, 0.85],
];

// Shared by visible planks and footstep classification. Cosmetic, with no collider.
export function duckboards(map: MapDefinition): Vec[] {
  return (map.terrain?.trenchLines ?? [])
    .flatMap((line) =>
      line.sections.flatMap((s) => {
        const points: Vec[] = [];
        for (let z = s.z - s.length / 2 + 1; z < s.z + s.length / 2; z += 2)
          points.push({ x: s.x, z });
        return points;
      }),
    )
    .filter((p) =>
      boardOffsets.every(
        ([dx, dz]) =>
          Math.abs(baseGroundHeight(p.x + dx, p.z + dz, map)) < 0.06,
      ),
    );
}
export function intactBoard(p: Vec, map: MapDefinition) {
  return boardOffsets.every(
    ([dx, dz]) => Math.abs(groundHeight(p.x + dx, p.z + dz, map)) < 0.06,
  );
}
export function footSurface(
  p: Vec,
  map: MapDefinition,
  boards = duckboards(map),
): "wood" | "mud" | "concrete" {
  if (!map.terrain) return "concrete";
  const board = boards.find(
    (b) => Math.abs(p.x - b.x) <= 0.65 && Math.abs(p.z - b.z) <= 0.9,
  );
  return board && intactBoard(board, map) ? "wood" : "mud";
}

// Presentation only: never writes commands, simulation state or gameplay RNG.
export class BattlefieldFeedback {
  private feet = new Map<number, { x: number; z: number; stride: number }>();
  private shock = { tick: -1000, strength: 0 };
  private boards: Vec[] = [];
  private nextCrack = 0;
  private lastLife = -1;
  stats = {
    footsteps: 0,
    woodSteps: 0,
    mudSteps: 0,
    concreteSteps: 0,
    cracks: 0,
    rifles: 0,
    distantRifles: 0,
    whistles: 0,
    blastReactions: 0,
    peakBlastStrength: 0,
    occluded: 0,
  };
  recent: {
    tick: number;
    kind: SoundKind;
    distance: number;
    occluded: boolean;
  }[] = [];
  constructor(private play: (cue: SoundCue) => void) {}
  reset(g: Game) {
    this.feet.clear();
    this.boards = duckboards(g.map);
    this.shock = { tick: -1000, strength: 0 };
    this.nextCrack = 0;
    this.lastLife = g.players[0].deaths;
    for (const key of Object.keys(this.stats) as (keyof typeof this.stats)[])
      this.stats[key] = 0;
    this.recent = [];
  }
  private cue(
    g: Game,
    kind: SoundKind,
    at: V3,
    volume: number,
    local = false,
    occlusion = true,
    seed = g.tick,
  ) {
    const p = g.players[0];
    const ear = { x: p.x, y: p.y + eyeHeightOf(p), z: p.z };
    const distance = Math.hypot(at.x - ear.x, at.y - ear.y, at.z - ear.z);
    const occluded =
      !local && occlusion && distance > 3 && g.collision.ray(ear, at) < 0.98;
    this.stats.occluded += Number(occluded);
    this.recent.push({
      tick: g.tick,
      kind,
      distance: Math.round(distance),
      occluded,
    });
    if (this.recent.length > 160) this.recent.shift();
    this.play({ kind, at: { ...at }, volume, local, distance, occluded, seed });
  }
  event(g: Game, e: Event) {
    const p = g.players[0];
    if (e.type === "respawn" && e.actor === 0) {
      this.shock = { tick: -1000, strength: 0 };
      this.nextCrack = 0;
    }
    if (e.type === "fire" && Math.hypot(p.x - e.from.x, p.z - e.from.z) < 125) {
      this.cue(
        g,
        "rifle",
        e.from,
        e.actor === 0 ? 0.4 : 0.3,
        e.actor === 0,
        true,
        e.id,
      );
      this.stats.rifles++;
      if (Math.hypot(p.x - e.from.x, p.z - e.from.z) > 35)
        this.stats.distantRifles++;
    }
    if (e.type === "nearMiss" && e.actor === 0 && g.tick >= this.nextCrack) {
      this.cue(
        g,
        "crack",
        e.at,
        0.21 + 0.12 * clamp(1 - e.distance / 1.8),
        false,
        false,
        e.id,
      );
      this.nextCrack = g.tick + 4;
      this.stats.cracks++;
    }
    if (
      e.type === "artilleryLaunch" &&
      Math.hypot(p.x - e.from.x, p.z - e.from.z) < 85
    ) {
      this.cue(g, "whistle", e.from, 0.3, false, false, e.id);
      this.stats.whistles++;
    }
    if (e.type === "grenadeExplosion" || e.type === "artilleryImpact") {
      const artillery = e.type === "artilleryImpact";
      const distance = Math.hypot(p.x - e.at.x, p.y + 1 - e.at.y, p.z - e.at.z);
      if (distance < (artillery ? 140 : 90))
        this.cue(
          g,
          artillery ? "artillery" : "grenade",
          e.at,
          artillery ? 0.85 : 0.65,
          false,
          true,
          e.id,
        );
      const range = artillery ? 30 : 16;
      if (p.hp > 0 && distance < range) {
        const covered =
          g.collision.ray({ x: p.x, y: p.y + eyeHeightOf(p), z: p.z }, e.at) <
          0.98;
        const strength = clamp((1 - distance / range) * (covered ? 0.45 : 1));
        this.shock = {
          tick: g.tick,
          strength: Math.min(1, this.state(g.tick).muffle + strength),
        };
        this.stats.blastReactions++;
        this.stats.peakBlastStrength = Math.max(
          this.stats.peakBlastStrength,
          this.shock.strength,
        );
        this.cue(
          g,
          "debris",
          { x: p.x, y: p.y + 0.3, z: p.z },
          strength * 0.13,
          true,
          false,
          e.id,
        );
      }
    }
  }
  step(g: Game) {
    if (g.players[0].deaths !== this.lastLife || g.players[0].hp <= 0) {
      this.shock = { tick: -1000, strength: 0 };
      this.lastLife = g.players[0].deaths;
    }
    const listener = g.players[0];
    const nearby = g.players
      .filter(
        (p) => p.hp > 0 && Math.hypot(p.x - listener.x, p.z - listener.z) < 18,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - listener.x, a.z - listener.z) -
          Math.hypot(b.x - listener.x, b.z - listener.z),
      )
      .slice(0, 8);
    const audible = new Set(nearby.map((p) => p.id));
    for (const p of g.players) {
      const old = this.feet.get(p.id);
      const travel = old ? Math.hypot(p.x - old.x, p.z - old.z) : 0;
      const grounded = p.hp > 0 && !p.hop && !p.fall && !p.mantle;
      let stride = old?.stride ?? (p.id % 5) * 0.12;
      if (!grounded || travel > 0.7 || !audible.has(p.id)) stride = 0;
      else if (travel > 0.002) {
        stride += travel;
        const length = p.crouched ? 0.9 : p.command.sprint ? 1.8 : 1.35;
        if (stride >= length) {
          stride %= length;
          const surface = footSurface(p, g.map, this.boards);
          this.cue(
            g,
            surface,
            { x: p.x, y: p.y + 0.1, z: p.z },
            (p.crouched ? 0.045 : p.command.sprint ? 0.16 : 0.11) *
              (p.id === 0 ? 1 : 0.65),
            p.id === 0,
            p.id !== 0,
            g.tick + p.id,
          );
          this.stats.footsteps++;
          this.stats[
            surface === "wood"
              ? "woodSteps"
              : surface === "mud"
                ? "mudSteps"
                : "concreteSteps"
          ]++;
        }
      }
      this.feet.set(p.id, { x: p.x, z: p.z, stride });
    }
  }
  state(tick: number, enabled = true) {
    const age = Math.max(0, (tick - this.shock.tick) / 30);
    const strength = this.shock.strength;
    const jolt = enabled ? strength * Math.exp(-age * 7) : 0;
    return {
      muffle: age < 3.5 ? strength * Math.exp(-age * 1.6) : 0,
      pitch: Math.sin(age * 47) * jolt * 0.009,
      yaw: Math.sin(age * 39 + 1) * jolt * 0.006,
      roll: Math.sin(age * 31) * jolt * 0.45,
    };
  }
}
