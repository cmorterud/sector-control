// Darkness as a game rule. On a night map an unlit soldier can be seen only
// within the map's sight distance; light restores the usual range. Every
// source of light is declared here, so the simulation, the bots and the
// renderer agree about what is lit. Deterministic and free of rendering.
import { groundHeight, type MapDefinition, type Vec } from "./map";
import { brazierSites } from "./atmosphere";
import { dugouts, trenchProps } from "./trench-dressing";
import type { BackdropBox } from "./backdrop";
import { flareLight, type FlareState } from "./flares";

// A shell or grenade that has just gone off, and how far its flash carries.
export interface Burst extends Vec { tick: number; radius: number }
// Enough of a match to ask about light: its map and, when it has them, its
// flares and recent bursts.
export type NightScene = { map: MapDefinition; tick?: number; flares?: FlareState; bursts?: Burst[] };

export type LampKind = "brazier" | "lantern" | "flag";
// `reveals` is whether a soldier in this lamp's light can be seen from afar.
export interface Lamp extends Vec { y: number; kind: LampKind; radius: number; reveals: boolean }
export const nightRules = {
  // How far each kind of lamp throws useful light, in meters.
  radius: { brazier: 7, lantern: 3.5, flag: 3 } as Record<LampKind, number>,
  // An open fire lights whoever stands by it. Lanterns and flag lamps are
  // shaded: enough to steer by, too little to be shot by from the far trench.
  reveals: { brazier: true, lantern: false, flag: false } as Record<LampKind, boolean>,
  // A fully lit soldier is seen from this far, which is past any rifle fight here.
  litSight: 90,
  // A burst lights the ground around it for this long: a glimpse, not a view.
  burstTicks: 12,
  // Firing gives a soldier away for this long, out to this distance.
  muzzleTicks: 30,
  muzzleSight: 60,
};

const lampCache = new WeakMap<object, Lamp[]>();
// The lamps burning on a night map: braziers in the rear trenches, lanterns on
// the trench walls and at the dugouts, and a shaded lamp at each flag to walk toward.
export function nightLamps(map: MapDefinition): Lamp[] {
  if (!map.night) return [];
  // Destruction copies the map for each match; the lamps stand on its terrain.
  const key = map.terrain ?? map;
  let lamps = lampCache.get(key);
  if (!lamps) {
    const props = trenchProps(map, brazierSites(map)), lamp = (x: number, y: number, z: number, kind: LampKind): Lamp =>
      ({ x, y, z, kind, radius: nightRules.radius[kind], reveals: nightRules.reveals[kind] });
    lamps = [
      ...props.embers.map((e) => lamp(e.x, groundHeight(e.x, e.z, map) + 0.35, e.z, "brazier")),
      ...props.lanterns.map((l) => lamp(l.x, l.y, l.z, "lantern")),
      ...dugouts(map).map((d) => lamp(d.x - d.rear * 0.16, d.floor + 1.55, d.z + 0.8, "lantern")),
      ...map.sectors.map((s) => lamp(s.x, groundHeight(s.x, s.z, map) + 1.5, s.z, "flag")),
    ];
    lampCache.set(key, lamps);
  }
  return lamps;
}

// How brightly a point is lit for anyone watching from a distance, from 0
// (dark) to 1: full at an open fire, fading to nothing at its radius, and
// whatever a burning flare throws down. Bursts will add their light here.
export function lightAt(scene: NightScene, p: Vec): number {
  const { map } = scene;
  const tick = scene.tick ?? 0;
  let light = scene.flares ? flareLight({ tick, flares: scene.flares }, p) : 0;
  for (const burst of scene.bursts ?? []) {
    const age = tick - burst.tick, d = Math.hypot(p.x - burst.x, p.z - burst.z);
    if (age >= 0 && age < nightRules.burstTicks && d < burst.radius)
      light = Math.max(light, (1 - age / nightRules.burstTicks) * (1 - (d / burst.radius) ** 2));
  }
  for (const lamp of nightLamps(map)) {
    if (!lamp.reveals) continue;
    const d = Math.hypot(p.x - lamp.x, p.z - lamp.z);
    if (d < lamp.radius) light = Math.max(light, 1 - (d / lamp.radius) ** 2);
  }
  return light;
}

// The farthest a soldier standing at `target` can be seen from. No limit by day.
// A soldier who has just fired has shown where they are by their muzzle flash.
export function sightLimit(scene: NightScene, target: Vec & { lastShotAt?: number }): number {
  const { map } = scene;
  if (!map.night) return Infinity;
  const lit = map.night.sight + (nightRules.litSight - map.night.sight) * lightAt(scene, target);
  const fired = target.lastShotAt !== undefined && (scene.tick ?? 0) - target.lastShotAt < nightRules.muzzleTicks;
  return fired ? Math.max(lit, nightRules.muzzleSight) : lit;
}
// How far a blast's flash carries, from the size of the blast.
export const burstRadius = (blastRadius: number) => Math.max(14, Math.min(36, blastRadius * 4));

// Where each side left a lane through its own wire belt: the gaps between
// consecutive belt segments. Raiders marked such lanes with white tape.
export function wireLanes(map: MapDefinition): (Vec & { team: "blue" | "red"; width: number })[] {
  const lanes: (Vec & { team: "blue" | "red"; width: number })[] = [];
  for (const team of ["blue", "red"] as const) {
    const belt = (map.wireBelts ?? []).filter((s) => s.team === team).sort((a, b) => a.z - b.z);
    for (let i = 1; i < belt.length; i++) {
      const a = belt[i - 1], b = belt[i], open = b.z - b.d / 2 - (a.z + a.d / 2);
      if (open > 1) lanes.push({ team, x: (a.x + b.x) / 2, z: (a.z + a.d / 2 + b.z - b.d / 2) / 2, width: open });
    }
  }
  return lanes;
}

// Two lines of white tape pegged to the ground through each lane, pale enough
// to follow in the dark from a few paces.
export function tapeBoxes(map: MapDefinition): BackdropBox[] {
  const boxes: BackdropBox[] = [];
  for (const lane of wireLanes(map)) {
    const half = Math.min(1.4, lane.width / 2 - 0.4);
    for (const side of [-1, 1]) {
      const z = lane.z + side * half;
      for (let along = -3.5; along <= 3.5; along += 1) {
        const x = lane.x + along;
        boxes.push({ x, y: groundHeight(x, z, map) + 0.015, z, w: 1.02, h: 0.02, d: 0.07, color: "#d9d4c0" });
      }
      for (const end of [-4, 4]) {
        const x = lane.x + end;
        boxes.push({ x, y: groundHeight(x, z, map), z, w: 0.05, h: 0.45, d: 0.05, color: "#cfc9b3" });
      }
    }
  }
  return boxes;
}
