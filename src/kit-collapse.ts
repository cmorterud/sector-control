import { groundHeight, type Box, type KitRuntime, type MapDefinition } from "./map";
import type { DestructionChange } from "./destruction";

// Kit buildings (docs/HOUSE_KIT.md) stand only while each piece has an
// unbroken chain of surviving supports down to the ground. Floors and roofs
// may rest on a neighbouring bay along their joists, one bay at most, and
// that neighbour must itself be carried directly. Lost support never removes
// a piece at once: it starts failing and falls after a short warning.

type Change = DestructionChange["objects"][number];
export const kitBearingFloor = 1 / 3;
export const kitRubbleHeights = [0.5, 1.05, 1.5] as const;
const hash = (text: string) => [...text].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
// 0.6–1.5 s at 30 Hz; higher pieces follow the ones beneath them.
export const kitWarningTicks = (id: string, level: number) => 18 + (hash(id) % 18) + Math.min(level, 3) * 3;
export const kitWarningMaxTicks = 18 + 17 + 9;

export function kitStanding(map: MapDefinition, kit: KitRuntime, excluded: Set<string> = new Set()) {
  const state = map.destruction!;
  const own = new Set(kit.parts);
  const alive = (id: string) => {
    const o = state.objects[id];
    return !!o && o.stage !== 2 && !excluded.has(id) && !(state.failing && id in state.failing);
  };
  // Another building's piece (a shared party wall) is that building's concern.
  const external = (id: string) => !own.has(id) && alive(id);
  const standing = new Set<string>(), direct = new Set<string>();
  for (let pass = 0, changed = true; changed && pass < 96; pass++) {
    changed = false;
    for (const id of kit.parts) {
      if (direct.has(id) || !alive(id)) continue;
      const b = state.objects[id].original;
      const carried = !b.supports || b.supports.some((s) => direct.has(s) || standing.has(s) || external(s));
      if (carried) {
        direct.add(id); standing.add(id); changed = true;
      } else if (!standing.has(id) && b.spanSupports?.some((s) => direct.has(s))) {
        standing.add(id); changed = true;
      }
    }
  }
  return { standing, alive };
}

export function settleKitBuildings(map: MapDefinition, changes: Change[], apply: (change: Change) => void) {
  const state = map.destruction!;
  state.failing ??= {};
  const now = state.tick ?? 0;
  const changed = new Set(changes.map((c) => c.id));
  for (const building of map.buildings ?? []) {
    const kit = building.kit;
    if (!kit || !kit.parts.some((id) => changed.has(id)) && !kit.survivors.some((id) => changed.has(id))) continue;
    const doomed = new Set<string>();
    const survivors = new Set(kit.survivors);
    const wingsOf = new Map<string, string[]>();
    for (const wing of kit.wings) for (const id of wing.parts) wingsOf.set(id, [...(wingsOf.get(id) ?? []), wing.id]);
    for (let round = 0; round < 6; round++) {
      const { standing, alive } = kitStanding(map, kit, doomed);
      const before = doomed.size;
      for (const id of kit.parts) if (alive(id) && !standing.has(id)) doomed.add(id);
      // A wing that loses most of its bearing walls comes down as a unit.
      const failed = new Set(kit.wings.filter((wing) => wing.bearing.length &&
        wing.bearing.filter(alive).length / wing.bearing.length < kitBearingFloor).map((w) => w.id));
      if (failed.size) for (const wing of kit.wings) {
        if (!failed.has(wing.id)) continue;
        for (const id of wing.parts) {
          const b = state.objects[id]?.original;
          if (!b || !alive(id) || survivors.has(id) || !b.supports && b.architecture?.part === "floor") continue;
          if ((wingsOf.get(id) ?? []).every((w) => failed.has(w))) doomed.add(id);
        }
      }
      // Never strand an upper floor: with every route up broken, it drops.
      for (let level = 1; level < kit.routes.length; level++) {
        if (kit.routes[level].some((route) => route.every(alive))) continue;
        for (let upper = level; upper < kit.floors.length; upper++)
          for (const id of kit.floors[upper]) if (alive(id)) doomed.add(id);
        break;
      }
      if (doomed.size === before) break;
    }
    for (const id of doomed) {
      if (id in state.failing) continue;
      state.failing[id] = now + kitWarningTicks(id, state.objects[id].original.architecture?.level ?? 0);
    }
  }
  // Rubble grows with the number of levels that came down over each cell.
  for (const change of changes.slice()) {
    if (change.stage !== 2) continue;
    const o = state.objects[change.id], a = o?.original.architecture;
    const building = a && map.buildings?.find((b) => b.id === a.building && b.kit);
    if (!o || !a || !building || a.part === "detail" || a.part === "stair") continue;
    addKitRubble(map, building, o.original, changes);
  }
}

function addKitRubble(map: MapDefinition, building: NonNullable<MapDefinition["buildings"]>[number], piece: Box,
  changes: Change[]) {
  const state = map.destruction!, kit = building.kit!, a = piece.architecture!;
  const cx = Math.round(piece.x / 4), cz = Math.round(piece.z / 4), key = cx + "," + cz;
  const levels = kit.fallen[key] ??= [];
  const level = a.part === "wall" ? -1 : a.part === "roof" ? building.stories : a.level;
  if (level > 0 && !levels.includes(level)) levels.push(level);
  const tier = Math.min(kitRubbleHeights.length - 1, Math.max(0, levels.length - 1));
  const x = cx * 4 + 0.6, z = cz * 4 - 0.6;
  if (map.sectors.some((s) => Math.hypot(s.x - x, s.z - z) < 3.2)) return;
  if (kit.doorways.some((d) => Math.hypot(d.x - x, d.z - z) < 1.6)) return;
  const id = "village-rubble-" + building.id + "-" + cx + "-" + cz;
  const h = kitRubbleHeights[tier] + ((cx * 7 + cz * 11) & 3) * 0.03;
  const w = 1.25 + tier * 0.35, d = 1.05 + tier * 0.35;
  const existing = state.objects[id];
  if (existing) {
    if (existing.stage === 2 || existing.original.h >= h - 0.001) return;
    Object.assign(existing.original, { h, w, d });
    const box = map.boxes.find((b) => b.id === id);
    if (box) Object.assign(box, { h, w, d });
    changes.push({ id, hp: existing.hp, stage: existing.stage });
    return;
  }
  const rubble: Box = { id, x, z, w, d, h, baseY: groundHeight(x, z, map), kind: "rubble", walkable: true };
  state.objects[id] = { id, original: rubble, hp: 180, maxHp: 180, stage: 0, lining: false };
  map.boxes.push({ ...rubble });
  changes.push({ id, hp: 180, stage: 0 });
}
