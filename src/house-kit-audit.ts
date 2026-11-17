import type { Box, MapDefinition } from "./map";
import { kitBay, kitEdgeBetween, kitExteriorEdge, kitStory, type KitPlacement, type KitPlan, type KitRoomType } from "./house-kit";

// Design rules from docs/HOUSE_KIT.md, checked against plans and built pieces.

export const kitOpenRunLimit = 5;
export const kitLargeRoomRunLimit = 7.5;
// Rooms allowed beyond three bays a side; their structure must supply cover.
export const kitLargeRooms: KitRoomType[] = ["shop", "workroom", "barn"];
export const kitCoverHeight = 0.8;
// About 7.5 pieces per bay per story, plus fixed extras (piers, porch, chimney).
export const kitPartBudget = (plan: { bays: { x: number; z: number }; levels: unknown[] }) =>
  Math.ceil(plan.bays.x * plan.bays.z * plan.levels.length * 7.5 + 40);
const passive: KitRoomType[] = ["stair", "void"];

export interface KitRoomAudit { level: number; key: string; name: string; type: KitRoomType; strongpoint: boolean;
  bays: { x: number; z: number }; exits: string[] }

export function auditKitRooms(plan: KitPlan): KitRoomAudit[] {
  const rooms: KitRoomAudit[] = [];
  for (const [level, spec] of plan.levels.entries()) {
    const cellsOf = new Map<string, [number, number][]>();
    spec.cells.forEach((row, r) => [...row].forEach((key, c) => cellsOf.set(key, [...(cellsOf.get(key) ?? []), [c, r]])));
    const name = (c: number, r: number) => String.fromCharCode(65 + c) + (r + 1);
    const doors = new Set([...(spec.doors ?? []), ...(spec.wide ?? [])].map(([a, b]) => kitEdgeBetween(a, b)));
    const open = new Set((spec.open ?? []).map(([a, b]) => kitEdgeBetween(a, b)));
    for (const [key, cells] of cellsOf) {
      const room = spec.rooms[key];
      if (passive.includes(room.type)) continue;
      const exits = new Set<string>();
      const target = (k: string) => passive.includes(spec.rooms[k].type) ? "stair" : k;
      for (const [c, r] of cells) {
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc, nr = r + dr, other = spec.cells[nr]?.[nc];
          if (other === undefined || other === key) continue;
          const edge = kitEdgeBetween(name(c, r), name(nc, nr));
          if (doors.has(edge) || open.has(edge)) exits.add(target(other));
        }
        for (const o of spec.openings ?? []) {
          if (o.at !== name(c, r)) continue;
          // Each outside door is its own way out; ground-floor windows can be
          // vaulted; upper doors open onto outside stairs.
          if (o.kind !== "window") exits.add("outside " + o.at + " " + o.side);
          else if (level === 0) exits.add("window");
        }
      }
      const cols = cells.map(([c]) => c), rows = cells.map(([, r]) => r);
      rooms.push({ level, key, name: room.name, type: room.type, strongpoint: !!room.strongpoint, exits: [...exits],
        bays: { x: Math.max(...cols) - Math.min(...cols) + 1, z: Math.max(...rows) - Math.min(...rows) + 1 } });
    }
  }
  return rooms;
}

export function kitPlanProblems(plan: KitPlan): string[] {
  const problems: string[] = [];
  const rooms = auditKitRooms(plan);
  for (const room of rooms) {
    const label = plan.id + " level " + room.level + " " + room.name;
    if (room.exits.length < (room.strongpoint ? 1 : 2)) problems.push(label + " has exits " + JSON.stringify(room.exits));
    if (!kitLargeRooms.includes(room.type) && Math.max(room.bays.x, room.bays.z) > 3) problems.push(label + " is larger than three bays");
  }
  for (const [level] of plan.levels.entries())
    if (rooms.filter((r) => r.level === level && r.strongpoint).length > 1) problems.push(plan.id + " level " + level + " has two strongpoints");
  for (const [level, spec] of plan.levels.entries()) for (const o of spec.openings ?? []) {
    try { kitExteriorEdge(o.at, o.side); } catch { problems.push(plan.id + " level " + level + " bad opening " + o.at); }
  }
  return problems;
}

// The longest straight walk through a room that never passes within 1 m of
// crouch-height cover. Measured on a 0.1 m raster of the built pieces.
export function kitOpenRuns(map: MapDefinition, plan: KitPlan, at: KitPlacement) {
  const turns = at.turns ?? 0, W = plan.bays.x * kitBay, D = plan.bays.z * kitBay, cell = 0.1;
  const toWorld = (u: number, v: number) => turns === 0 ? [at.x + u, at.z + v] : turns === 1 ? [at.x - v, at.z + u] :
    turns === 2 ? [at.x - u, at.z - v] : [at.x + v, at.z - u];
  const nu = Math.round(W / cell), nv = Math.round(D / cell);
  const results: { level: number; room: string; run: number; limit: number; from: [number, number]; to: [number, number] }[] = [];
  for (const [level, spec] of plan.levels.entries()) {
    const feet = at.baseY + level * kitStory;
    const boxes = map.boxes.filter((b) => b.architecture?.building === at.id || b.kind === "rubble");
    const solid = (b: Box) => !(b.walkable && (b.baseY ?? 0) + b.h <= feet + 0.25) && (b.baseY ?? 0) < feet + 1.8 && (b.baseY ?? 0) + b.h > feet + 0.25;
    const cover = (b: Box) => (b.baseY ?? 0) <= feet + 0.1 && (b.baseY ?? 0) + b.h >= feet + kitCoverHeight;
    const blockers = boxes.filter(solid), covers = boxes.filter(cover);
    const blocked = new Uint8Array(nu * nv), exposed = new Uint8Array(nu * nv);
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const u = -W / 2 + (i + 0.5) * cell, v = -D / 2 + (j + 0.5) * cell, [x, z] = toWorld(u, v);
      const inside = (b: Box, pad: number) => Math.abs(x - b.x) <= b.w / 2 + pad && Math.abs(z - b.z) <= b.d / 2 + pad;
      const room = spec.rooms[spec.cells[Math.floor(v / kitBay + plan.bays.z / 2)]?.[Math.floor(u / kitBay + plan.bays.x / 2)] ?? ""];
      if (!room || passive.includes(room.type) || blockers.some((b) => inside(b, 0.3))) { blocked[i * nv + j] = 1; continue; }
      const near = covers.some((b) => Math.max(Math.abs(x - b.x) - b.w / 2, 0) ** 2 + Math.max(Math.abs(z - b.z) - b.d / 2, 0) ** 2 <= 1);
      if (!near) exposed[i * nv + j] = 1;
    }
    const best = new Map<string, { run: number; from: [number, number]; to: [number, number] }>();
    for (let i = 2; i < nu; i += 5) for (let j = 2; j < nv; j += 5) {
      if (!exposed[i * nv + j]) continue;
      const key = spec.cells[Math.floor((j * cell) / kitBay)]?.[Math.floor((i * cell) / kitBay)];
      if (!key) continue;
      for (let a = 0; a < 16; a++) {
        const du = Math.cos((a * Math.PI) / 16), dv = Math.sin((a * Math.PI) / 16);
        let length = 0;
        // Walk both ways so the start point lies anywhere along the run.
        const ends: [number, number][] = [];
        for (const sign of [-1, 1]) {
          let t = 0;
          for (;;) {
            const pi = Math.floor(i + (sign * du * (t + cell)) / cell), pj = Math.floor(j + (sign * dv * (t + cell)) / cell);
            if (pi < 0 || pj < 0 || pi >= nu || pj >= nv || !exposed[pi * nv + pj]) break;
            t += cell;
          }
          length += t;
          ends.push([-W / 2 + i * cell + sign * du * t, -D / 2 + j * cell + sign * dv * t]);
        }
        const previous = best.get(key);
        if (!previous || length > previous.run) best.set(key, { run: length, from: ends[0], to: ends[1] });
      }
    }
    for (const [key, b] of best) {
      const room = spec.rooms[key];
      results.push({ level, room: room.name, run: b.run, from: b.from, to: b.to,
        limit: kitLargeRooms.includes(room.type) ? kitLargeRoomRunLimit : kitOpenRunLimit });
    }
  }
  return results;
}
