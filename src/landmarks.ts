import { groundHeight, type Box, type MapDefinition, type Vec } from "./map";
import type { Destructible } from "./destruction";

export interface Landmark extends Vec {
  id: string;
  name: string;
  kind: "farmhouse" | "woodland" | "gunpit" | "bunker";
  radius: number;
}
export function buildLandmarks(map: MapDefinition): {
  landmarks: Landmark[];
  parts: Box[];
} {
  const parts: Box[] = [],
    landmarks: Landmark[] = [];
  // Keep complete soldier-width clearance around every existing low trench lane.
  const place = (b: Box, low = false): Box | undefined => {
    const ys: number[] = [];
    for (
      let x = b.x - b.w / 2 - 0.7;
      x <= b.x + b.w / 2 + 0.7 + 0.001;
      x += 0.4
    )
      for (
        let z = b.z - b.d / 2 - 0.7;
        z <= b.z + b.d / 2 + 0.7 + 0.001;
        z += 0.4
      )
        ys.push(groundHeight(x, z, map));
    if (
      (!low && Math.min(...ys) < 1.9) ||
      Math.max(...ys) - Math.min(...ys) > (low ? 0.9 : 0.55)
    )
      return;
    if (
      map.boxes.some(
        (q) =>
          Math.abs(q.x - b.x) < (q.w + b.w) / 2 + 0.4 &&
          Math.abs(q.z - b.z) < (q.d + b.d) / 2 + 0.4,
      )
    )
      return;
    const bottom = Math.min(...ys) - 0.04;
    return {
      ...b,
      baseY: bottom,
      h: b.h + groundHeight(b.x, b.z, map) - bottom,
    };
  };
  const house = (c: Vec) => {
    const boxes: Box[] = [];
    const wall = (
      id: string,
      x: number,
      z: number,
      w: number,
      d: number,
      h: number,
      kind: Box["kind"] = "masonry",
    ) => {
      const p = place({
        id: `landmark-A-${id}`,
        landmark: "A",
        x: c.x + x,
        z: c.z + z,
        w,
        d,
        h,
        kind,
      });
      if (p) boxes.push(p);
    };
    for (const z of [-3.5, 3.5])
      for (const x of [-3, -1, 1, 3]) {
        if ((z < 0 && x === 1) || (z > 0 && x === -1)) continue; // two broad ruined doorways
        wall(
          `wall-${x}-${z}`,
          x,
          z,
          1.8,
          0.48,
          x === -3 ? 1.8 : x === 3 ? .9 : 1.25,
        );
      }
    for (const x of [-4, 4])
      for (const z of [-2.4, 0, 2.4]) {
        if (x === 4 && z === 0) continue;
        wall(`end-${x}-${z}`, x, z, 0.48, 1.8, z === 0 ? 2.1 : 1.1);
      }
    wall("chimney", -2.7, 2.3, 1.1, 1.1, 4.8);
    for (const x of [-3.4, 3.4])
      wall(`timber-${x}`, x, 1, 0.22, 0.25, 2.9, "wood");
    return boxes;
  };
  const choices = [
    { x: -32, z: -35 },
    { x: -32, z: -43 },
    { x: -33, z: -39 },
    { x: -32, z: -29 },
  ];
  const selected = choices
    .map((c) => ({ c, parts: house(c) }))
    .sort((a, b) => b.parts.length - a.parts.length)[0];
  landmarks.push({
    id: "A",
    name: "Farmhouse",
    kind: "farmhouse",
    radius: 6,
    ...selected.c,
  });
  parts.push(...selected.parts);
  const houseSupports = selected.parts.filter((b) =>
    ["landmark-A-end--4-0", "landmark-A-timber--3.4"].includes(b.id!),
  );
  if (houseSupports.length === 2)
    parts.push({
      id: "landmark-A-roof",
      landmark: "A",
      kind: "wood",
      x: selected.c.x - 3,
      z: selected.c.z,
      w: 2.5,
      d: 3.6,
      h: 0.18,
      baseY: Math.min(...houseSupports.map((b) => (b.baseY ?? 0) + b.h)) - 0.05,
      supports: houseSupports.map((b) => b.id!),
    });

  const wood = { x: -13, z: 36 };
  landmarks.push({
    id: "B",
    name: "Shattered Wood",
    kind: "woodland",
    radius: 6,
    ...wood,
  });
  for (const [i, [dx, dz]] of [
    [-3, -3],
    [0, -4],
    [3, -1],
    [-2, 1],
    [1, 3],
    [4, 4],
    [-4, 4],
  ].entries()) {
    const tree = place({
      id: `tree-landmark-B-${i}`,
      landmark: "B",
      kind: "tree",
      x: wood.x + dx,
      z: wood.z + dz,
      w: 0.75,
      d: 0.75,
      h: 3.2 + (i % 3) * 1.7,
      treeStyle: i % 2 ? "bare" : "snapped",
    });
    if (tree) parts.push(tree);
  }
  for (const [i, dx] of [-2, 2].entries()) {
    const log = place({
      id: `landmark-B-log-${i}`,
      landmark: "B",
      kind: "log",
      x: wood.x + dx,
      z: wood.z + 1,
      w: 2.7,
      d: 0.6,
      h: 0.6,
    });
    if (log) parts.push(log);
  }

  const pit = { x: 9, z: -25 };
  landmarks.push({
    id: "C",
    name: "Gun Pit",
    kind: "gunpit",
    radius: 5,
    ...pit,
  });
  for (const [i, [x, z, w, d]] of [
    [-3, 0, 0.7, 2.4],
    [-2, -2.6, 2, 0.7],
    [1, -3, 2.2, 0.7],
    [3, 1.8, 0.7, 2],
    [-1, 3, 2.2, 0.7],
  ].entries()) {
    const p = place(
      {
        id: `landmark-C-bags-${i}`,
        landmark: "C",
        kind: "sandbag",
        x: pit.x + x,
        z: pit.z + z,
        w,
        d,
        h: 0.85,
      },
      true,
    );
    if (p) parts.push(p);
  }
  const gun = place(
    {
      id: "landmark-C-gun",
      landmark: "C",
      kind: "gun",
      ...pit,
      w: 3.3,
      d: 1.8,
      h: 1.6,
    },
    true,
  );
  if (gun) parts.push(gun);

  const bunker = (c: Vec) => {
    const boxes: Box[] = [];
    for (const [i, [x, z, w, d, h]] of [
      [-2.7, -2.6, 1.3, 1.2, 2.7],
      [-2.7, 2.6, 1.3, 1.2, 2.7],
      [-2.7, 0, 1.3, 1.6, 1.1],
      [2.8, -2.5, 1, 1.5, 2.3],
      [2.8, 2.5, 1, 1.5, 1.5],
      [0, -3.2, 2.8, 0.9, 2.6],
      [0, 3.2, 2.8, 0.9, 1.8],
    ].entries()) {
      const p = place({
        id: `landmark-D-concrete-${i}`,
        landmark: "D",
        kind: "concrete",
        x: c.x + x,
        z: c.z + z,
        w,
        d,
        h,
      });
      if (p) boxes.push(p);
    }
    return boxes;
  };
  const bunkerSites: Vec[] = [];
  for (let x = 31; x <= 35; x++)
    for (let z = 25; z <= 38; z++) bunkerSites.push({ x, z });
  const site = bunkerSites
    .map((c) => ({ c, parts: bunker(c) }))
    .sort((a, b) => b.parts.length - a.parts.length)[0];
  landmarks.push({
    id: "D",
    name: "Broken Bunker",
    kind: "bunker",
    radius: 5,
    ...site.c,
  });
  parts.push(...site.parts);
  const bunkerSupports = site.parts.filter((b) => b.h > 2.2);
  if (bunkerSupports.length >= 2)
    parts.push({
      id: "landmark-D-roof",
      landmark: "D",
      kind: "concrete",
      ...site.c,
      w: 6.4,
      d: 4.8,
      h: 0.42,
      baseY:
        Math.min(...bunkerSupports.map((b) => (b.baseY ?? 0) + b.h)) - 0.05,
      supports: bunkerSupports.map((b) => b.id!),
    });
  return { landmarks, parts };
}
export const isStructure = (b: Box) =>
  ["masonry", "concrete", "gun"].includes(b.kind) ||
  (b.kind === "wood" && !!b.landmark && !b.farmProp);
// Persistent, low collision pieces. No recursive rubble generation or tall
// invisible walls; loose visual fragments are handled separately by the renderer.
export function collapsedStructureParts(
  map: MapDefinition,
  object: Destructible,
): Box[] {
  const b = object.original,
    alongX = b.w >= b.d;
  const result: Box[] = [];
  for (let i = 0; i < 2; i++) {
    const x = b.x + (alongX ? (i - 0.5) * Math.min(b.w * 0.45, 1.2) : 0),
      z = b.z + (!alongX ? (i - 0.5) * Math.min(b.d * 0.45, 1.2) : 0);
    const w = alongX ? Math.min(1.35, b.w * 0.62) : Math.max(0.55, b.w),
      d = alongX ? Math.max(0.55, b.d) : Math.min(1.35, b.d * 0.62);
    const ys = [
      groundHeight(x, z, map),
      groundHeight(x - w / 2, z, map),
      groundHeight(x + w / 2, z, map),
      groundHeight(x, z - d / 2, map),
      groundHeight(x, z + d / 2, map),
    ];
    if (Math.max(...ys) - Math.min(...ys) > 0.45) continue;
    result.push({
      id: `rubble-${b.id}-${i}`,
      landmark: b.landmark,
      kind: "rubble",
      x,
      z,
      w,
      d,
      h: Math.min(0.95, 0.42 + b.h * 0.08 + i * 0.12),
      baseY: Math.min(...ys) - 0.03,
    });
  }
  return result;
}
