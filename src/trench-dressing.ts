import type { BackdropBox } from "./backdrop";
import { duckboards } from "./battlefield";
import { factionFor, type FactionId } from "./loadouts";
import { groundHeight as worldGround, hillHeight, type MapDefinition, type Vec } from "./map";

// Presentation-only construction detail for trench lines: sandbags along the
// parados, faction revetments, dugout entrances, signboards and the clutter of
// a lived-in line. Nothing here collides. Everything stays off the firing steps
// and the enemy-facing parapet, so it can never pose as cover or block a shot.

// Heights here are measured from the hillside under the trenches
// (terrain.hill, Gallipoli's climb), as on a flat map; `lift` adds it back to
// what is drawn. On a flat map the hillside is zero and nothing changes.
const groundHeight = (x: number, z: number, map: MapDefinition) => worldGround(x, z, map) - hillHeight(x, z, map);
const lift = <T extends { x: number; y: number; z: number }>(map: MapDefinition, items: T[]) =>
  map.terrain?.hill ? items.map((b) => ({ ...b, y: b.y + hillHeight(b.x, b.z, map) })) : items;
const liftLines = (map: MapDefinition, points: number[]) =>
  map.terrain?.hill ? points.map((v, i) => (i % 3 === 1 ? v + hillHeight(points[i - 1], points[i + 1], map) : v)) : points;

const hash = (n: number) => {
  const s = Math.sin(n * 12.9898 + 3.71) * 43758.5453;
  return s - Math.floor(s);
};

export type TrenchStretch = {
  team: "blue" | "red";
  front: boolean;
  // Floor centre, half width and the rearward direction (away from no-man's land).
  floorX: number;
  half: number;
  rear: 1 | -1;
  z0: number;
  z1: number;
};

export function trenchStretches(map: MapDefinition): TrenchStretch[] {
  return (map.terrain?.trenchLines ?? []).flatMap((line) => {
    const side = line.team === "blue" ? -1 : 1, front = line.role === "front";
    const floor = line.floor ?? (front ? { offset: 1, half: 2 } : { offset: 0, half: 1 });
    return line.sections.map((s) => ({
      team: line.team, front, floorX: s.x - side * floor.offset, half: floor.half, rear: side as 1 | -1,
      z0: s.z - s.length / 2, z1: s.z + s.length / 2,
    }));
  });
}

const bank = (map: MapDefinition) => map.terrain?.bankHeight ?? 0;
// The rear wall is intact (no junction or bay opening) over this stretch of z.
const rearWallIntact = (map: MapDefinition, s: TrenchStretch, z: number, reach = 0.6) =>
  [-reach, 0, reach].every((dz) => groundHeight(s.floorX + s.rear * (s.half + 1.1), z + dz, map) > bank(map) - 0.05) &&
  [-reach, 0, reach].every((dz) => groundHeight(s.floorX + s.rear * (s.half - 0.3), z + dz, map) < 0.12);

// One or two rows of bags along the parados (the rear bank top).
export function paradosBags(map: MapDefinition): BackdropBox[] {
  const bags: BackdropBox[] = [], top = bank(map);
  const tints = ["#7a6c50", "#6e6249", "#837556", "#6a5e45"];
  trenchStretches(map).forEach((s, n) => {
    for (let z = s.z0 + 0.6; z < s.z1 - 0.4; z += 0.52) {
      const x = s.floorX + s.rear * (s.half + 1.35);
      if (!rearWallIntact(map, s, z, 0.3) || groundHeight(x, z, map) < top - 0.05) continue;
      // z is negative north of centre, so wrap the tint index into range.
      const k = n * 131 + Math.round(z * 10), yaw = (hash(k) - 0.5) * 0.16, tint = (i: number) => tints[((i % 4) + 4) % 4];
      const jitter = (hash(k * 2.9) - 0.5) * 0.1, tall = 0.18 + hash(k * 3.7) * 0.06;
      bags.push({ x: x + jitter, y: top - 0.03, z, w: 0.3, h: tall, d: 0.5, yaw, color: tint(k) });
      if (hash(k * 1.7) < 0.6)
        bags.push({ x: x + s.rear * 0.04 - jitter, y: top + tall - 0.05, z: z + 0.26, w: 0.28, h: 0.19, d: 0.48, yaw: -yaw * 1.4, color: tint(k + 1) });
    }
  });
  return lift(map, bags);
}

export type RevetmentStyle = "timber" | "corrugated" | "sandbag" | "wicker";
// Whole walls share one finish: British stretches mix timber, corrugated iron
// and sandbags; French ones are mostly woven hurdles (clayonnage) with some
// timber and iron; German stretches use neat timber and woven wicker hurdles.
export function revetmentStyle(wallIndex: number, x: number, blue: FactionId = "british"): RevetmentStyle {
  if (x >= 0) return (["timber", "wicker"] as const)[wallIndex % 2];
  return blue === "french"
    ? (["wicker", "timber", "wicker", "corrugated"] as const)[wallIndex % 4]
    : (["timber", "corrugated", "sandbag"] as const)[wallIndex % 3];
}

// 128 x 64 RGBA textures, laid across a 1 m by 0.45 m panel face.
export function revetmentPixels(style: Exclude<RevetmentStyle, "timber">) {
  const width = 128, height = 64, data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = x / width, v = y / height, grain = hash(x * 3.1 + y * 17.3) * 0.12;
      let c: number[];
      if (style === "corrugated") {
        const rib = 0.5 + 0.5 * Math.cos(u * Math.PI * 2 * 9), rust = hash(Math.floor(x / 6) * 9.7 + Math.floor(y / 5) * 3.3);
        c = [92 + rib * 46 + rust * 30, 88 + rib * 38 + rust * 8, 80 + rib * 32 - rust * 12];
      } else if (style === "wicker") {
        const row = Math.floor(v * 7), stake = Math.abs(((u * 4) % 1) - 0.5) < 0.05;
        const over = ((row + Math.floor(u * 8)) % 2) * 0.5 + 0.5 * Math.sin(((v * 7) % 1) * Math.PI);
        c = stake ? [70, 52, 34] : [96 + over * 38, 72 + over * 28, 44 + over * 16];
      } else {
        const row = Math.floor(v * 2), shift = row % 2 ? 0.25 : 0, bu = (((u + shift) * 2) % 1), bv = (v * 2) % 1;
        const bulge = Math.sin(bu * Math.PI) * Math.sin(bv * Math.PI), seam = bu < 0.04 || bv < 0.06;
        c = seam ? [70, 61, 44] : [120 + bulge * 34, 106 + bulge * 28, 78 + bulge * 18];
      }
      const i = (y * width + x) * 4;
      data[i] = Math.max(0, Math.min(255, c[0] * (1 - grain)));
      data[i + 1] = Math.max(0, Math.min(255, c[1] * (1 - grain)));
      data[i + 2] = Math.max(0, Math.min(255, c[2] * (1 - grain)));
      data[i + 3] = 255;
    }
  return data;
}

export type Dugout = { x: number; z: number; rear: 1 | -1; floor: number };
// Framed entrances in the rear wall of every other long rear-line section.
export function dugouts(map: MapDefinition): Dugout[] {
  const out: Dugout[] = [];
  trenchStretches(map).forEach((s, n) => {
    if (s.front || s.z1 - s.z0 < 16 || n % 2) return;
    for (const z of [(s.z0 + s.z1) / 2, (s.z0 + s.z1) / 2 + 3, (s.z0 + s.z1) / 2 - 3]) {
      if (!rearWallIntact(map, s, z, 0.9)) continue;
      out.push({ x: s.floorX + s.rear * s.half, z, rear: s.rear, floor: worldGround(s.floorX, z, map) });
      return;
    }
  });
  return out;
}

// A timber frame, a dark doorway and a half-drawn gas curtain at the wall foot.
export function dugoutBoxes(d: Dugout): BackdropBox[] {
  const frame = "#4b3c2a", x = d.x - d.rear * 0.02;
  return [
    { x, y: d.floor, z: d.z - 0.58, w: 0.14, h: 1.9, d: 0.14, color: frame },
    { x, y: d.floor, z: d.z + 0.58, w: 0.14, h: 1.9, d: 0.14, color: frame },
    { x, y: d.floor + 1.86, z: d.z, w: 0.16, h: 0.16, d: 1.36, color: frame },
    { x: d.x + d.rear * 0.03, y: d.floor, z: d.z, w: 0.03, h: 1.86, d: 1.04, color: "#100f0d" },
    { x: x - d.rear * 0.04, y: d.floor + 0.25, z: d.z - 0.18, w: 0.02, h: 1.6, d: 0.66, color: "#5d5640" },
  ];
}

export type Signboard = { x: number; y: number; z: number; facing: 1 | -1; text: string };
const names: Partial<Record<FactionId, string[]>> = {
  british: ["PICCADILLY", "OXFORD ST", "HAYMARKET", "STRAND", "BOND ST", "REGENT ST", "THE MALL"],
  // Verdun, June 1916: named for the places of the Fleury and Thiaumont sector.
  french: ["TR. DE FLEURY", "BOYAU DES VIGNES", "TR. DE THIAUMONT", "BOYAU DE SOUVILLE", "TR. DE FROIDETERRE", "BOYAU DE LA DAME", "TR. DES FONTAINES"],
  german: ["KAISERWEG", "LANGER GRABEN", "HINDENBURGWEG", "MÜHLENGRABEN", "WALDGRABEN", "FELDWEG", "BRUNNENGRABEN"],
};
const verdunGerman = ["DOUAUMONTGRABEN", "CAILLETTEGRABEN", "HARDAUMONTWEG", "BAYERNGRABEN", "KRONPRINZWEG", "THIAUMONTGRABEN", "ALPENWEG"];
// Painted boards on the rear wall naming each trench, with an arrow along the
// trench toward the team's nearest flag, as a soldier reading the board sees it.
export function signboards(map: MapDefinition): Signboard[] {
  const out: Signboard[] = [], used = { blue: 0, red: 0 };
  trenchStretches(map).forEach((s) => {
    if (s.z1 - s.z0 < 12) return;
    const z = s.z0 + 2;
    if (!rearWallIntact(map, s, z, 0.5)) return;
    const flags = map.sectors.filter((f) => f.home === s.team);
    const flag = flags.reduce((a, b) => (Math.abs(a.z - z) < Math.abs(b.z - z) ? a : b), flags[0]);
    if (!flag) return;
    // The board faces into the trench. Its reader faces the wall, along
    // (rear, 0, 0), so their right hand points along (0, 0, rear).
    const arrow = (flag.z - z) * s.rear > 0 ? "→" : "←";
    const faction = factionFor(map, s.team);
    const list = (map.id === "verdun" && faction === "german" ? verdunGerman : names[faction]) ?? names[s.team === "blue" ? "british" : "german"]!;
    const label = list[used[s.team]++ % list.length];
    out.push({ x: s.floorX + s.rear * (s.half - 0.06), y: worldGround(s.floorX, z, map) + 1.65, z, facing: -s.rear as 1 | -1, text: `${label}\n${arrow} ${flag.id}` });
  });
  return out;
}

export type TrenchProps = { boxes: BackdropBox[]; embers: Vec[]; lanterns: (Vec & { y: number })[]; water: Vec[]; cable: number[] };
// Crates, rifle racks, stretchers and braziers against rear walls, periscopes
// between firing positions, field telephone cable and water standing in sumps.
export function trenchProps(map: MapDefinition, braziers: Vec[] = []): TrenchProps {
  const boxes: BackdropBox[] = [], embers: Vec[] = [], lanterns: (Vec & { y: number })[] = [], water: Vec[] = [], cable: number[] = [];
  const firing = map.terrain?.firingPositions ?? [];
  const clearOfSteps = (x: number, z: number) => firing.every((f) => Math.hypot(f.x - x, f.z - z) > 1.2);
  trenchStretches(map).forEach((s, n) => {
    const wallX = s.floorX + s.rear * (s.half - 0.32);
    let previous: number[] | null = null;
    for (let z = s.z0 + 1.5; z < s.z1 - 1; z += 3.1) {
      const k = n * 17 + Math.round(z), floor = groundHeight(wallX, z, map);
      if (!rearWallIntact(map, s, z, 0.7) || !clearOfSteps(wallX, z) || floor > 0.12) { previous = null; continue; }
      const peg = [s.floorX + s.rear * (s.half - 0.02), floor + 1.7, z];
      if (previous) cable.push(...previous, (previous[0] + peg[0]) / 2, floor + 1.55, (previous[2] + peg[2]) / 2, (previous[0] + peg[0]) / 2, floor + 1.55, (previous[2] + peg[2]) / 2, ...peg);
      previous = peg;
      const pick = hash(k * 2.3);
      if (pick < 0.22) {
        for (let i = 0; i < 1 + Math.floor(hash(k) * 3); i++)
          boxes.push({ x: wallX, y: floor + i * 0.3, z: z + (i % 2) * 0.08, w: 0.36, h: 0.29, d: 0.62, yaw: (hash(k + i) - 0.5) * 0.2, color: i % 2 ? "#5f5235" : "#6a5b3a" });
      } else if (pick < 0.34) {
        boxes.push({ x: wallX + s.rear * 0.05, y: floor, z, w: 0.08, h: 1.15, d: 1.1, color: "#4b3c2a" });
        for (let i = 0; i < 3; i++)
          boxes.push({ x: wallX - s.rear * 0.08, y: floor + 0.05, z: z - 0.35 + i * 0.35, w: 0.05, h: 1.2, d: 0.07, lean: s.rear * 0.22, color: "#3a2c1d" });
      } else if (pick < 0.42) {
        boxes.push({ x: wallX - s.rear * 0.15, y: floor, z, w: 0.05, h: 2.05, d: 0.56, lean: s.rear * 0.32, color: "#57503f" });
      } else if (pick < 0.5) {
        lanterns.push({ x: s.floorX + s.rear * (s.half - 0.12), y: floor + 1.45, z });
      }
    }
    // Periscopes stand at the parapet between firing posts on front lines.
    if (s.front)
      for (let z = s.z0 + 2.5; z < s.z1 - 2; z += 5.5) {
        const x = s.floorX - s.rear * (s.half - 0.1), foot = groundHeight(x, z, map);
        if (!clearOfSteps(x, z) || foot > 1) continue;
        boxes.push({ x, y: foot, z, w: 0.08, h: bank(map) + 0.3 - foot, d: 0.08, color: "#3e4a3d" },
          { x: x - s.rear * 0.03, y: bank(map) + 0.22, z, w: 0.1, h: 0.08, d: 0.12, color: "#2f382f" });
      }
  });
  for (const b of braziers) {
    const floor = groundHeight(b.x, b.z, map);
    boxes.push({ x: b.x, y: floor, z: b.z, w: 0.42, h: 0.5, d: 0.42, color: "#2c2a27" });
    embers.push({ x: b.x, z: b.z, y: floor + 0.5 });
  }
  duckboards(map).forEach((p, i) => { if (i % 4 === 1) water.push({ x: p.x, z: p.z }); });
  return { boxes: lift(map, boxes), embers: embers.map((e) => ({ ...e, y: (e.y ?? 0) + hillHeight(e.x, e.z, map) })), lanterns: lift(map, lanterns), water, cable: liftLines(map, cable) };
}
