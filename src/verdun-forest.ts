import { dist, groundHeight, type Box, type MapDefinition, type Vec } from "./map";

export interface Woodland {
  belts: (Vec & { radiusX: number; radiusZ: number })[];
  tracks: { points: Vec[]; width: number }[];
}

// Broad, asymmetric tree belts leave a blasted central corridor and clear flag
// approaches. This authoring stream never consumes the battle's random seed.
export const verdunWoodland: Woodland = {
  belts: [
    { x: -24, z: -47, radiusX: 48, radiusZ: 15 },
    { x: 38, z: -42, radiusX: 30, radiusZ: 17 },
    { x: -34, z: 45, radiusX: 39, radiusZ: 16 },
    { x: 27, z: 49, radiusX: 43, radiusZ: 13 },
    { x: -35, z: -6, radiusX: 11, radiusZ: 17 },
    { x: 37, z: 10, radiusX: 10, radiusZ: 16 },
  ],
  tracks: [
    { width: 2.3, points: [{ x: -65, z: -25 }, { x: -45, z: -28 }, { x: -30, z: -32 }, { x: -18, z: -31 }, { x: 0, z: -25 }, { x: 20, z: -17 }, { x: 43, z: -21 }, { x: 64, z: -25 }] },
    { width: 2.1, points: [{ x: -63, z: 24 }, { x: -43, z: 28 }, { x: -21, z: 25 }, { x: -3, z: 20 }, { x: 13, z: 23 }, { x: 25, z: 29 }, { x: 43, z: 31 }, { x: 64, z: 25 }] },
    { width: 1.8, points: [{ x: -18, z: -31 }, { x: -11, z: -13 }, { x: -14, z: 8 }, { x: -21, z: 25 }] },
  ],
};

export function woodlandDensity(woodland: Woodland, x: number, z: number): number {
  let density = 0;
  for (const b of woodland.belts) {
    const r = Math.hypot((x - b.x) / b.radiusX, (z - b.z) / b.radiusZ);
    const u = Math.max(0, Math.min(1, (1.08 - r) / 0.38));
    density = Math.max(density, u * u * (3 - 2 * u));
  }
  return density;
}

function trackDistance(p: Vec, woodland: Woodland): number {
  let nearest = Infinity;
  for (const track of woodland.tracks)
    for (let i = 1; i < track.points.length; i++) {
      const a = track.points[i - 1], b = track.points[i];
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
      nearest = Math.min(nearest, Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t) - track.width / 2);
    }
  return nearest;
}

export function buildVerdunForest(map: MapDefinition): Box[] {
  const parts: Box[] = [];
  let seed = 0x7e4d1917;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const place = (b: Box, clearance: number): boolean => {
    if (Object.values(map.spawn).some((s) => dist(s, b) < 15)) return false;
    if (map.sectors.some((s) => dist(s, b) < 5)) return false;
    if (map.terrain?.ramps.some((r) => Math.abs(r.x - b.x) < (r.w + b.w) / 2 + .9 && Math.abs(r.z - b.z) < (r.d + b.d) / 2 + .9)) return false;
    if (trackDistance(b, verdunWoodland) < clearance + Math.max(b.w, b.d) / 2) return false;
    if ([...map.boxes, ...parts].some((q) => Math.abs(q.x - b.x) < (q.w + b.w) / 2 + clearance && Math.abs(q.z - b.z) < (q.d + b.d) / 2 + clearance)) return false;
    const levels: number[] = [];
    // Full footprint plus walking clearance, including the inside of long logs.
    for (let x = b.x - b.w / 2 - .75; x <= b.x + b.w / 2 + .751; x += .4)
      for (let z = b.z - b.d / 2 - .75; z <= b.z + b.d / 2 + .751; z += .4)
        levels.push(groundHeight(x, z, map));
    if (Math.min(...levels) < 1.5 || Math.max(...levels) - Math.min(...levels) > .65) return false;
    b.baseY = groundHeight(b.x, b.z, map) - .025;
    parts.push(b);
    return true;
  };
  let trees = 0;
  for (let attempt = 0; attempt < 2400 && trees < 124; attempt++) {
    const x = (random() - .5) * 148, z = (random() - .5) * 116;
    const density = woodlandDensity(verdunWoodland, x, z);
    if (random() > density || (Math.abs(x) < 24 && Math.abs(z) < 28)) continue;
    if (parts.some((b) => dist(b, { x, z }) < 3.8 + random() * .8)) continue;
    const choice = random();
    const treeStyle: Box["treeStyle"] = choice < .35 ? "pine" : choice < .53 ? "sparse" : choice < .82 ? "bare" : "snapped";
    const diameter = .5 + random() * .48;
    const h = treeStyle === "snapped" ? 2.8 + random() * 1.9 : 6.2 + random() * 4.2;
    if (place({ id: `verdun-wood-tree-${trees}`, kind: "tree", x, z, w: diameter, d: diameter, h, treeStyle }, .5)) trees++;
  }
  // Soldier-height sightlines stay open below the canopy. Low brush adds
  // ground texture, never a hedge that hides an entire flank.
  let brush = 0, logs = 0, stumps = 0;
  for (let attempt = 0; attempt < 1200 && (brush < 42 || logs < 14 || stumps < 12); attempt++) {
    const x = (random() - .5) * 144, z = (random() - .5) * 114;
    if (woodlandDensity(verdunWoodland, x, z) < .45) continue;
    const kind = attempt % 5 === 0 && logs < 14 ? "log" : attempt % 4 === 0 && stumps < 12 ? "stump" : "brush";
    if (kind === "brush" && brush >= 42) continue;
    const alongX = random() < .5, length = 2.1 + random() * 1.7;
    const b: Box = {
      id: `verdun-wood-${kind}-${kind === "log" ? logs : kind === "stump" ? stumps : brush}`,
      kind, x, z,
      w: kind === "log" ? alongX ? length : .48 : kind === "stump" ? .65 : .7 + random() * .5,
      d: kind === "log" ? alongX ? .48 : length : kind === "stump" ? .65 : .7 + random() * .5,
      h: kind === "log" ? .48 : kind === "stump" ? .45 + random() * .35 : .18 + random() * .27,
    };
    if (place(b, .4)) {
      if (kind === "log") logs++;
      else if (kind === "stump") stumps++;
      else brush++;
    }
  }
  return parts;
}
