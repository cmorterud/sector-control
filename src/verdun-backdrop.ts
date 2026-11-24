import { backdropHeight, backdropRules, continuingFront, type BackdropBox } from "./backdrop";
import { beyondPlayArea, playArea, type Box, type MapDefinition } from "./map";
import { woodlandDensity } from "./verdun-forest";

// Presentation only: Verdun's woods carried on past the boundary wire and out
// to the horizon. Nothing here collides, navigates or simulates. Trees inside
// the dead zone use the field's own tree models; everything beyond the terrain
// edge is low-poly silhouette in the shared vertex-coloured backdrop mesh.

const hash = (n: number) => {
  const s = Math.sin(n * 12.9898 + 2.417) * 43758.5453;
  return s - Math.floor(s);
};
const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The field's woodland belts, sampled 8 m inside the field from the nearest
// point, so a belt that reaches toward the edge carries on across the wire.
function carriedDensity(map: MapDefinition, x: number, z: number) {
  const area = playArea(map);
  const belts = { ...map.woodland!, groves: undefined };
  return woodlandDensity(belts, clamp(x, area.width / 2 - 8), clamp(z, area.depth / 2 - 8));
}

// The ground nearer the front was shelled bare: fewer crowns, more snapped trunks.
function treeStyle(roll: number, intact: number): NonNullable<Box["treeStyle"]> {
  const crowned = 0.15 + 0.45 * intact;
  if (roll < crowned * 0.6) return "pine";
  if (roll < crowned) return "sparse";
  return roll < crowned + (1 - crowned) * 0.55 ? "bare" : "snapped";
}

export type DeadZoneTree = { id: string; x: number; z: number; w: number; h: number; treeStyle: NonNullable<Box["treeStyle"]>; yaw: number };

// Trees standing in the dead zone between the boundary wire and the terrain
// edge: the belts continue, and scattered shell-torn trunks stand elsewhere.
export function verdunDeadZoneTrees(map: MapDefinition): DeadZoneTree[] {
  if (!map.woodland || !map.boundary) return [];
  const hx = map.width / 2, hz = map.depth / 2, clear = map.boundary.wireDepth + 1.4, cell = 2.7;
  const trees: DeadZoneTree[] = [];
  let n = 0;
  for (let gx = -hx; gx < hx; gx += cell)
    for (let gz = -hz; gz < hz; gz += cell) {
      const k = Math.round(gx * 7.1 + gz * 131.3);
      const x = gx + cell / 2 + (hash(k) - 0.5) * cell * 0.8, z = gz + cell / 2 + (hash(k * 1.9) - 0.5) * cell * 0.8;
      if (beyondPlayArea(x, z, map) < clear || Math.abs(x) > hx - 0.8 || Math.abs(z) > hz - 0.8) continue;
      const carried = carriedDensity(map, x, z);
      if (hash(k * 3.7) > 0.07 + 0.4 * carried) continue;
      const style = treeStyle(hash(k * 5.3), carried);
      const h = style === "snapped" ? 2.6 + hash(k * 6.1) * 2 : 6 + hash(k * 6.1) * 4.4;
      trees.push({ id: `verdun-dead-zone-tree-${n++}`, x, z, w: 0.48 + hash(k * 7.7) * 0.45, h, treeStyle: style, yaw: hash(k * 8.3) * 360 });
    }
  return trees;
}

// Where the old front line runs on past the north and south edges.
export function verdunFrontEnds(map: MapDefinition) {
  return (map.terrain?.trenchLines ?? []).filter((l) => l.role === "front").flatMap((line) =>
    ([[line.sections[0], -1], [line.sections.at(-1)!, 1]] as const).map(([s, north]) => ({
      x: s.x, north: north as 1 | -1, width: 2, front: true, team: line.team,
    })));
}

// A ruined village behind the French line and a fort on the ridge behind the
// German one, both authored stand-ins rather than reconstructions.
export const verdunLandmarks = {
  village: { x: -186, z: 46 },
  fort: { x: 222, z: -46 },
  road: 7,
};

export function verdunBackdropScenery(map: MapDefinition): { boxes: BackdropBox[]; lines: number[] } {
  const boxes: BackdropBox[] = [], lines: number[] = [];
  const ground = (x: number, z: number) => backdropHeight(map, x, z);
  const hx = map.width / 2, hz = map.depth / 2, { village, fort, road } = verdunLandmarks;
  const beyond = (x: number, z: number) => Math.max(Math.abs(x) - hx, Math.abs(z) - hz);
  // The front runs on north and south as low parapets and a wire belt.
  continuingFront(map, verdunFrontEnds(map).map((end, n) => {
    const points = [{ x: end.x, z: end.north * hz }];
    let x = end.x;
    for (let z = hz + 14, i = 0; z < backdropRules.radius - 20; z += 14, i++) {
      points.push({ x, z: end.north * z });
      x = end.x + (i % 2 === 0 ? 3 : 0) * (hash(n * 7 + i) < 0.5 ? 1 : -1);
      points.push({ x, z: end.north * z });
    }
    return { ...end, points };
  }), boxes, lines, false);
  // Woods over the rolling ground, broken by the village, the fort's glacis,
  // the rear roads and a shelled strip along the continuing front.
  const cell = 5.6;
  for (let gx = -270; gx < 270; gx += cell)
    for (let gz = -270; gz < 270; gz += cell) {
      const k = Math.round(gx * 3.3 + gz * 57.7);
      const x = gx + (hash(k) - 0.5) * cell * 0.9, z = gz + (hash(k * 1.3) - 0.5) * cell * 0.9, d = beyond(x, z);
      if (d < 2) continue;
      if (Math.hypot(x - village.x, z - village.z) < 34 || Math.hypot(x - fort.x, (z - fort.z) * 1.4) < 48) continue;
      if (Math.abs(x) > hx && Math.abs(Math.abs(z) - road) < 4) continue;
      const front = Math.abs(z) > hz ? Math.min(...verdunFrontEnds(map).map((e) => Math.abs(x - e.x))) : Infinity;
      if (front < 7) continue;
      // Broad stands and clearings, denser just past the edge where the field's belts reach it.
      const mass = 0.5 + 0.3 * Math.sin(x * 0.031 + z * 0.017 + 1.1) + 0.25 * Math.sin(z * 0.043 - x * 0.021 + 3.7);
      const near = d < 40 ? carriedDensity(map, x, z) * (1 - d / 40) : 0;
      const keep = Math.max(0, Math.min(1, mass)) * (0.3 + 0.25 * (1 - smooth(20, 200, d))) + near * 0.35;
      if (hash(k * 2.9) > keep) continue;
      // Shattered within 60 m of the old front; intact canopy further back.
      const intact = Math.abs(z) > hz ? smooth(15, 70, front) : smooth(10, 60, d);
      const style = treeStyle(hash(k * 4.1), intact);
      const h = style === "snapped" ? 2.4 + hash(k * 5.9) * 2.4 : 7 + hash(k * 5.9) * 6, w = 0.3 + hash(k * 6.7) * 0.25, y = ground(x, z) - 0.3;
      const lean = style === "snapped" || style === "bare" ? (hash(k * 7.3) - 0.5) * 0.3 : (hash(k * 7.3) - 0.5) * 0.06, yaw = hash(k * 8.9) * Math.PI;
      const bark = hash(k * 9.1) < 0.5 ? "#4d4236" : "#574a3c";
      if (style === "snapped") {
        // A broken stem with a splintered, leaning top.
        boxes.push({ x, y, z, w, h, d: w, yaw, lean, color: "#5a4c3d" },
          { x, y: y + h - 0.2, z, w: w * 0.5, h: 0.5 + hash(k) * 0.6, d: w * 0.4, yaw, lean: lean + 0.5, color: "#76654d" });
      } else boxes.push({ x, y, z, w: w * 1.5, h, d: w * 1.5, yaw, lean, shape: "spire", color: bark });
      if (style === "pine")
        // Three tiers, narrowing upward, like the field's pines.
        for (let tier = 0; tier < 3; tier++)
          boxes.push({ x, y: y + h * (0.26 + tier * 0.22), z, w: h * (0.36 - tier * 0.08), h: h * (0.4 - tier * 0.06), d: h * (0.36 - tier * 0.08),
            yaw: yaw + tier, shape: "spire", color: (k + tier) % 2 ? "#3f4a37" : "#47513c" });
      else if (style === "sparse")
        // Two or three torn lobes rather than one ball.
        for (let lobe = 0; lobe < 2 + Math.floor(hash(k * 3.9) * 2); lobe++) {
          const a = hash(k * 4.7 + lobe) * Math.PI * 2, r = h * 0.1, size = h * (0.3 + hash(k * 5.1 + lobe) * 0.1);
          boxes.push({ x: x + Math.cos(a) * r, y: y + h * (0.5 + lobe * 0.12), z: z + Math.sin(a) * r, w: size, h: size * 0.85, d: size,
            yaw: a, shape: "crown", color: lobe % 2 ? "#5a6146" : "#4f5a40" });
        }
      else if (style === "bare" && hash(k * 9.7) > 0.4)
        boxes.push({ x: x + 0.3, y: y + h * 0.6, z, w: 0.1, h: 1.4 + hash(k) * 1.6, d: 0.1, yaw, lean: 0.9, color: bark });
    }
  // The village: roofless shells along a street, and the stump of a church tower.
  const stone = (x: number, z: number, w: number, d: number, h: number, yaw: number, seed: number) => {
    const y = ground(x, z) - 0.2, c = Math.cos(yaw), s = Math.sin(yaw);
    for (const [ox, oz, ww, dd] of [[0, -d / 2, w, 0.5], [0, d / 2, w, 0.5], [-w / 2, 0, 0.5, d], [w / 2, 0, 0.5, d]]) {
      if (hash(seed + ox * 3 + oz) < 0.3) continue;
      const height = h * (0.35 + 0.65 * hash(seed + ox + oz * 7));
      boxes.push({ x: x + ox * c - oz * s, y, z: z + ox * s + oz * c, w: ww, h: height, d: dd, yaw, color: hash(seed + oz) < 0.5 ? "#6b665d" : "#5e5a52" });
    }
  };
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1, along = (i >> 1) * 9 - 24;
    stone(village.x + along, village.z + side * (6 + hash(i) * 3), 6 + hash(i * 1.7) * 3, 5 + hash(i * 2.3) * 2, 3.5 + hash(i * 2.9) * 3, hash(i * 4.1) * 0.25, i * 17);
  }
  const towerY = ground(village.x + 4, village.z - 16) - 0.2;
  boxes.push({ x: village.x + 4, y: towerY, z: village.z - 16, w: 3, h: 8.5, d: 3, color: "#625d55" },
    { x: village.x + 3.4, y: towerY + 8.5, z: village.z - 16.5, w: 1.3, h: 2.2, d: 1.5, color: "#5a564e" });
  stone(village.x + 4, village.z - 22, 12, 6, 5.5, 0, 211);
  // The fort: a long earth glacis on the ridge, its concrete front and two turret domes.
  const fy = ground(fort.x, fort.z);
  for (let i = 0; i < 4; i++)
    boxes.push({ x: fort.x + i * 2.2, y: fy - 0.5, z: fort.z, w: 30 - i * 6, h: 2.4 + i * 1.3, d: 54 - i * 9, color: i < 3 ? "#5b5446" : "#605a4c" });
  boxes.push({ x: fort.x - 4, y: fy + 3, z: fort.z, w: 1.6, h: 4.4, d: 30, color: "#77746b" },
    { x: fort.x + 4, y: fy + 6.4, z: fort.z - 8, w: 4, h: 1.3, d: 4, shape: "crown", color: "#4c4c48" },
    { x: fort.x + 4, y: fy + 6.4, z: fort.z + 9, w: 4, h: 1.3, d: 4, shape: "crown", color: "#4c4c48" });
  // Telegraph poles along both rear roads.
  for (const side of [-1, 1]) {
    let previous: number[] | null = null;
    for (let x = hx + 8; x < backdropRules.radius - 10; x += 24) {
      const px = side * x, pz = side * road + 3, y = ground(px, pz);
      boxes.push({ x: px, y: y - 0.2, z: pz, w: 0.22, h: 6.4, d: 0.22, color: "#3a3128" },
        { x: px, y: y + 5.7, z: pz, w: 0.14, h: 0.12, d: 1.6, color: "#3a3128" });
      const top = [px, y + 5.65, pz];
      if (previous)
        for (const dz of [-0.65, 0.65]) {
          const mid = [(previous[0] + top[0]) / 2, (previous[1] + top[1]) / 2 - 0.5, (previous[2] + top[2]) / 2 + dz];
          lines.push(previous[0], previous[1], previous[2] + dz, ...mid, ...mid, top[0], top[1], top[2] + dz);
        }
      previous = top;
    }
  }
  return { boxes, lines };
}
