import type { Box, MapDefinition, Vec } from "./map";

// Zeppelin: a 6v6 Domination map aboard a German naval airship drifting above
// the clouds at dusk. Three lanes run its length one above another: the keel
// corridor, a gallery through the gas cells and the walk along the top of the
// hull. The flags are where the lanes meet: an engine station near each spawn
// and the bomb bay amidships.
//
// x runs along the hull from the stern (Blue, -x) to the bow (Red, +x); y is
// up. The stern half is built here and the bow half is the same geometry
// turned 180 degrees about the bomb bay, so neither team has a better route.

export interface Rect { x0: number; x1: number; z0: number; z1: number }
export interface Volume extends Rect { y0: number; y1: number }

// Every level is a whole number of 12-step flights: 0.2125 m rise, 0.3125 m run.
export const zeppelinStep = { rise: 0.2125, run: 0.3125, flight: 12 };
const flightRise = zeppelinStep.rise * zeppelinStep.flight; // 2.55 m
const flightRun = zeppelinStep.run * zeppelinStep.flight; // 3.75 m
export const zeppelinLevels = { keel: 0, gallery: 2 * flightRise, top: 5 * flightRise };
const keelHeadroom = 2.8, atriumCeiling = 9.6, deckUnderside = zeppelinLevels.top - 0.2;
// Bots plan with a 0.6 m clearance, so stair lanes, doors and landings are
// sized to leave their centres room to turn.
const landingDepth = 2.0, laneWidth = 2.2;

// The hull: a cylinder 15 m across whose ends taper over their last 25 m.
export const zeppelinHull = { half: 75, radius: 7.5, axis: 5.2, taper: 50 };
export function hullRadius(x: number) {
  const { half, radius, taper } = zeppelinHull, t = (Math.abs(x) - taper) / (half - taper);
  return t <= 0 ? radius : t >= 1 ? 0 : radius * Math.sqrt(1 - t * t);
}

// A stair tower climbs `flights` flights from `base`, switching back between
// two lanes along x: odd flights in lane A away from the near end, even
// flights back in lane B.
export interface ZeppelinTower { interior: Rect; nearX: number; dir: 1 | -1; laneA: [number, number]; laneB: [number, number]; base: number; flights: number }
export interface ZeppelinLayout {
  hull: typeof zeppelinHull;
  levels: typeof zeppelinLevels;
  towers: ZeppelinTower[];
  engineCars: Rect[];
  bombDoors: Rect[];
  // Walkable floor of each level, for the floor plan.
  plan: { keel: Rect[]; gallery: Rect[]; top: Rect[] };
  // Waypoints that send a bot along the gallery or the top walk instead of
  // the keel, which is every route's shortest.
  lanes: Record<"blue" | "red", { gallery: Vec[]; top: Vec[] }>;
}

const box = (id: string, r: Rect, y0: number, y1: number, kind: Box["kind"], extra: Partial<Box> = {}): Box => ({
  id: `zep-${id}`, x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, w: r.x1 - r.x0, d: r.z1 - r.z0, baseY: y0, h: y1 - y0, kind, ...extra,
});
// The airship itself cannot be broken: grenades take only crates.
const structure: Box["kind"] = "bunker";
const floorThickness = 0.2;
const floor = (id: string, r: Rect, y: number) => box(id, r, y - floorThickness, y, structure, { walkable: true });
const railHeight = 1.0;
// A rail is a bar at hand height: it stops a soldier walking, hopping or
// crawling through, but not a bullet or the view below it. It sits above
// the 0.9 m sight line a flag's zone is judged by.
const rail = (id: string, r: Rect, y: number) => box(`rail-${id}`, r, y + 0.95, y + 1.1, structure);

// Axis-aligned volume difference: the parts of `a` outside `b`.
export function subtract(a: Volume, b: Volume): Volume[] {
  if (b.x0 >= a.x1 || b.x1 <= a.x0 || b.z0 >= a.z1 || b.z1 <= a.z0 || b.y0 >= a.y1 || b.y1 <= a.y0) return [a];
  const out: Volume[] = [], rest = { ...a };
  if (b.x0 > rest.x0) { out.push({ ...rest, x1: b.x0 }); rest.x0 = b.x0; }
  if (b.x1 < rest.x1) { out.push({ ...rest, x0: b.x1 }); rest.x1 = b.x1; }
  if (b.z0 > rest.z0) { out.push({ ...rest, z1: b.z0 }); rest.z0 = b.z0; }
  if (b.z1 < rest.z1) { out.push({ ...rest, z0: b.z1 }); rest.z1 = b.z1; }
  if (b.y0 > rest.y0) { out.push({ ...rest, y1: b.y0 }); rest.y0 = b.y0; }
  if (b.y1 < rest.y1) { out.push({ ...rest, y0: b.y1 }); rest.y1 = b.y1; }
  return out;
}
const subtractAll = (from: Volume[], holes: Volume[]) =>
  holes.reduce((pieces, hole) => pieces.flatMap((piece) => subtract(piece, hole)), from);
const volume = (r: Rect, y0: number, y1: number): Volume => ({ ...r, y0, y1 });

// A straight flight climbing `steps` treads from (xFoot, y) along x in `dir`.
// A solid flight is filled down to its base; otherwise each tread is a plank.
function flight(id: string, xFoot: number, dir: 1 | -1, z: [number, number], y: number, steps: number, solid: boolean): Box[] {
  const { rise, run } = zeppelinStep;
  return Array.from({ length: steps }, (_, i) => {
    const x = xFoot + dir * (i + 0.5) * run, top = y + rise * (i + 1);
    return box(`${id}-${i}`, { x0: x - run / 2, x1: x + run / 2, z0: z[0], z1: z[1] }, solid ? y : top - 0.12, top, structure, { walkable: true });
  });
}

// The top flight arrives on the top walk itself. Walls enclose the tower,
// with doors given in world volumes.
function stairTower(id: string, t: ZeppelinTower, doors: Volume[], roof?: Rect): Box[] {
  const { interior, nearX, dir, laneA, laneB, base, flights } = t;
  const flightStart = nearX + dir * landingDepth, flightEnd = flightStart + dir * flightRun, farX = flightEnd + dir * landingDepth;
  const span = (a: number, b: number) => ({ x0: Math.min(a, b), x1: Math.max(a, b) });
  const lanes = { z0: laneA[0], z1: laneB[1] };
  const parts: Box[] = [];
  // From the keel the first flight and first landing are solid, as is the
  // space under the second flight; higher up, everything is planks.
  const ground = base === zeppelinLevels.keel;
  for (let n = 0; n < flights; n++) {
    const up = n % 2 === 0, lane = up ? laneA : laneB;
    parts.push(...flight(`${id}-flight-${n}`, up ? flightStart : flightEnd, up ? dir : (-dir as 1 | -1), lane, base + n * flightRise, zeppelinStep.flight, ground && n === 0));
  }
  for (let k = 1; k < flights; k++) {
    const r = { ...(k % 2 ? span(flightEnd, farX) : span(nearX, flightStart)), ...lanes }, y = base + k * flightRise;
    parts.push(ground && k === 1 ? box(`${id}-landing-${k}`, r, base, y, structure, { walkable: true }) : floor(`${id}-landing-${k}`, r, y));
  }
  if (ground) parts.push(box(`${id}-under-1`, { ...span(flightStart, flightEnd), z0: laneB[0], z1: laneB[1] }, base, base + flightRise - 0.2, structure));
  parts.push(floor(`${id}-base`, ground ? { ...span(nearX, flightStart), ...lanes } : interior, base));
  // The lanes are divided along the flights, all the way up.
  parts.push(box(`${id}-divider`, { ...span(flightStart, flightEnd), z0: laneA[1], z1: laneB[0] }, base, deckUnderside, structure));
  const wall = 0.2, outer = { x0: interior.x0 - wall, x1: interior.x1 + wall, z0: interior.z0 - wall, z1: interior.z1 + wall };
  const bottom = ground ? base : base - floorThickness;
  const faces: Volume[] = [
    volume({ ...outer, x1: interior.x0 }, bottom, deckUnderside),
    volume({ ...outer, x0: interior.x1 }, bottom, deckUnderside),
    volume({ ...outer, z1: interior.z0 }, bottom, deckUnderside),
    volume({ ...outer, z0: interior.z1 }, bottom, deckUnderside),
  ];
  subtractAll(faces, doors).forEach((v, i) => parts.push(box(`${id}-wall-${i}`, v, v.y0, v.y1, structure)));
  // Where the top walk does not cover the tower, a roof closes it.
  if (roof) parts.push(box(`${id}-roof`, roof, deckUnderside, zeppelinLevels.top, structure));
  return parts;
}

const { keel, gallery, top } = zeppelinLevels;

// The stern half. Every rectangle here lies at x <= 0.
const towerLength = 2 * landingDepth + flightRun, towerWidth = 2 * laneWidth + 0.2;
const spawnRoom: Rect[] = [{ x0: -59, x1: -49, z0: -3.5, z1: 0.3 }, { x0: -59 + towerLength + 0.2, x1: -49, z0: 0.3, z1: 0.5 + towerWidth }];
const spawnTower: ZeppelinTower = { interior: { x0: -59, x1: -59 + towerLength, z0: 0.5, z1: 0.5 + towerWidth }, nearX: -59 + towerLength, dir: -1,
  laneA: [0.5, 0.5 + laneWidth], laneB: [0.7 + laneWidth, 0.5 + towerWidth], base: 0, flights: 5 };
const galleryHead: Rect = { x0: spawnTower.interior.x1 + 0.2, x1: -49, z0: -1.5, z1: spawnTower.interior.z1 };
const galleryWalk: Rect = { x0: galleryHead.x0, x1: 0, z0: -1.5, z1: 1.5 };
const keelWalk: Rect = { x0: -49, x1: 0, z0: -2, z1: 2 };
const station: Rect = { x0: -36, x1: -24, z0: -4.5, z1: 4.5 };
// The bomb bay stays inside the hull at keel level, where the hull is only
// 5.4 m either side of the centre line.
const bombBay: Rect = { x0: -10, x1: 0, z0: -5, z1: 5 };
// From the gallery bridge a tower climbs to the top walk, where the hull is
// wide enough for it. The keel is reached by a stair along the bay's far wall.
const bayTower: ZeppelinTower = { interior: { x0: -10, x1: -10 + towerLength, z0: -2.0 - towerWidth, z1: -2.0 }, nearX: -10, dir: 1,
  laneA: [-2.0 - laneWidth, -2.0], laneB: [-2.0 - towerWidth, -2.2 - laneWidth], base: 2 * flightRise, flights: 3 };
const bayStair = { foot: -9, dir: 1 as const, z: [5 - laneWidth, 5] as [number, number], landing: { x0: -1.5, x1: 1.5, z0: 1.5, z1: 5 } };
// Each engine car hangs outboard of the station, reached by a short gangway.
const gangways: Rect[] = [{ x0: -26.5, x1: -24.5, z0: 4.5, z1: 7.6 }, { x0: -35.5, x1: -33.5, z0: -7.6, z1: -4.5 }];
const engineCars: Rect[] = [{ x0: -27.5, x1: -23.5, z0: 7.6, z1: 10.6 }, { x0: -36.5, x1: -32.5, z0: -10.6, z1: -7.6 }];
// The bomb doors open on either side of the flag's catwalk; the bow half
// carries the other half of each opening.
const bombDoors: Rect[] = [{ x0: -1.4, x1: 0, z0: 1.7, z1: 3.4 }, { x0: -1.4, x1: 0, z0: -3.4, z1: -1.7 }];
const deck: Rect = { x0: -59, x1: 0, z0: -2.25, z1: 2.25 };
const platform: Rect = { x0: -11, x1: 0, z0: -6, z1: 6 };
// Openings in the top walk over each tower's last flight.
const laneSpan = (t: ZeppelinTower) => ({ z0: t.laneA[0], z1: t.laneB[1] });
const outerOf = (t: ZeppelinTower): Rect => ({ x0: t.interior.x0 - 0.2, x1: t.interior.x1 + 0.2, z0: t.interior.z0 - 0.2, z1: t.interior.z1 + 0.2 });
// It reaches a metre back over the landing below, so a soldier starting up
// the last flight has headroom under its edge.
const towerHatch = (t: ZeppelinTower): Rect => {
  const start = t.nearX + t.dir * (landingDepth - 1), end = t.nearX + t.dir * landingDepth + t.dir * flightRun;
  return { x0: Math.min(start, end), x1: Math.max(start, end), z0: t.laneA[0], z1: t.laneA[1] };
};
const hatches = [towerHatch(spawnTower), towerHatch(bayTower)];

// In the station, a stair rises along each side wall to the gallery bridge,
// turned 180 degrees from each other about the flag.
const stationStairs = [
  { foot: -34.5, dir: 1 as const, z: [4.4 - laneWidth, 4.4] as [number, number], landing: { x0: -27, x1: -24, z0: 1.5, z1: 4.4 } },
  { foot: -25.5, dir: -1 as const, z: [-4.4, -4.4 + laneWidth] as [number, number], landing: { x0: -36, x1: -33, z0: -4.4, z1: -1.5 } },
];

function sternHalf(): Box[] {
  const parts: Box[] = [];
  // Floors.
  spawnRoom.forEach((r, i) => parts.push(floor(`spawn-floor-${i}`, r, keel)));
  parts.push(floor("keel-aft", { ...keelWalk, x1: station.x0 }, keel));
  parts.push(floor("keel-mid", { ...keelWalk, x0: station.x1, x1: bombBay.x0 }, keel));
  parts.push(floor("station-floor", station, keel));
  gangways.forEach((r, i) => parts.push(floor(`gangway-${i}`, r, keel)));
  engineCars.forEach((r, i) => parts.push(floor(`car-floor-${i}`, r, keel)));
  const bayFloor = subtractAll([volume(bombBay, -floorThickness, keel)], bombDoors.map((r) => volume(r, -1, 1)));
  bayFloor.forEach((v, i) => parts.push(box(`bay-floor-${i}`, v, v.y0, v.y1, structure, { walkable: true })));
  parts.push(floor("gallery-head", galleryHead, gallery));
  parts.push(floor("gallery-aft", { ...galleryWalk, x0: galleryHead.x1, x1: station.x0 }, gallery));
  parts.push(floor("station-bridge", { ...galleryWalk, x0: station.x0, x1: station.x1 }, gallery));
  parts.push(floor("gallery-mid", { ...galleryWalk, x0: station.x1, x1: bombBay.x0 }, gallery));
  parts.push(floor("bay-bridge", { ...galleryWalk, x0: bombBay.x0, x1: 0 }, gallery));
  // The bridge reaches the bay tower's door.
  parts.push(floor("bay-connector", { x0: -10, x1: -10 + landingDepth, z0: bayTower.interior.z1, z1: -1.5 }, gallery));
  const deckPieces = subtractAll([volume(deck, deckUnderside, top), volume(platform, deckUnderside, top)], hatches.map((r) => volume(r, deckUnderside - 1, top + 1)));
  deckPieces.forEach((v, i) => parts.push(box(`deck-${i}`, v, v.y0, v.y1, structure, { walkable: true })));

  // Stairs.
  parts.push(...stairTower("spawn-tower", spawnTower, [
    volume({ x0: spawnTower.interior.x1, x1: spawnTower.interior.x1 + 0.2, ...laneSpan(spawnTower) }, keel, 2.6),
    volume({ x0: spawnTower.interior.x1, x1: spawnTower.interior.x1 + 0.2, ...laneSpan(spawnTower) }, gallery, gallery + 2.3),
  ], { x0: spawnTower.interior.x0 - 0.2, x1: spawnTower.interior.x1 + 0.2, z0: deck.z1, z1: spawnTower.interior.z1 + 0.2 }));
  parts.push(...stairTower("bay-tower", bayTower, [
    volume({ x0: -10, x1: -10 + landingDepth, z0: -2.0, z1: -1.8 }, gallery, gallery + 2.3),
  ], { ...outerOf(bayTower), z1: platform.z0 }));
  parts.push(...flight("bay-stair", bayStair.foot, bayStair.dir, bayStair.z, keel, 2 * zeppelinStep.flight, true));
  parts.push(floor("bay-landing", bayStair.landing, gallery));
  stationStairs.forEach((s, i) => {
    parts.push(...flight(`station-stair-${i}`, s.foot, s.dir, s.z, keel, 2 * zeppelinStep.flight, true));
    parts.push(floor(`station-landing-${i}`, s.landing, gallery));
  });

  // Rails at every drop to open sky, and along the bridges.
  const r = 0.05;
  parts.push(rail("deck-edge-0", { x0: deck.x0, x1: platform.x0, z0: deck.z1, z1: deck.z1 + 2 * r }, top));
  parts.push(rail("deck-edge-1", { x0: deck.x0, x1: platform.x0, z0: deck.z0 - 2 * r, z1: deck.z0 }, top));
  parts.push(rail("deck-end", { x0: deck.x0 - 2 * r, x1: deck.x0, z0: deck.z0, z1: deck.z1 }, top));
  parts.push(rail("platform-edge-0", { x0: platform.x0, x1: 0, z0: platform.z1, z1: platform.z1 + 2 * r }, top));
  parts.push(rail("platform-edge-1", { x0: platform.x0, x1: 0, z0: platform.z0 - 2 * r, z1: platform.z0 }, top));
  parts.push(rail("platform-end-0", { x0: platform.x0 - 2 * r, x1: platform.x0, z0: deck.z1, z1: platform.z1 }, top));
  parts.push(rail("platform-end-1", { x0: platform.x0 - 2 * r, x1: platform.x0, z0: platform.z0, z1: deck.z0 }, top));
  // Coamings round each hatch, open only where its stair arrives.
  const [spawnHatch, bayHatch] = hatches;
  parts.push(rail("spawn-hatch-0", { x0: spawnHatch.x0, x1: spawnHatch.x1, z0: spawnHatch.z0 - 2 * r, z1: spawnHatch.z0 }, top));
  parts.push(rail("spawn-hatch-1", { x0: spawnHatch.x1, x1: spawnHatch.x1 + 2 * r, z0: spawnHatch.z0, z1: spawnHatch.z1 }, top));
  parts.push(rail("bay-hatch-0", { x0: bayHatch.x0, x1: bayHatch.x1, z0: bayHatch.z0 - 2 * r, z1: bayHatch.z0 }, top));
  parts.push(rail("bay-hatch-1", { x0: bayHatch.x0, x1: bayHatch.x1, z0: bayHatch.z1, z1: bayHatch.z1 + 2 * r }, top));
  parts.push(rail("bay-hatch-2", { x0: bayHatch.x0 - 2 * r, x1: bayHatch.x0, z0: bayHatch.z0, z1: bayHatch.z1 }, top));
  // Bridge rails, with gaps where landings join.
  const bridgeRail = (id: string, x0: number, x1: number, side: 1 | -1) =>
    parts.push(rail(id, { x0, x1, z0: side > 0 ? 1.5 : -1.5 - 2 * r, z1: side > 0 ? 1.5 + 2 * r : -1.5 }, gallery));
  bridgeRail("station-rail-0", station.x0, stationStairs[0].landing.x0, 1);
  bridgeRail("station-rail-1", stationStairs[1].landing.x1, station.x1, -1);
  bridgeRail("bay-rail-0", bombBay.x0, bayStair.landing.x0, 1);
  bridgeRail("bay-rail-1", -10 + landingDepth, 0, -1);
  parts.push(rail("bay-landing-rail-0", { x0: bayStair.landing.x0 - r, x1: bayStair.landing.x0 + r, z0: 1.6, z1: bayStair.z[0] }, gallery));
  parts.push(rail("bay-landing-rail-1", { x0: bayStair.landing.x1 - r, x1: bayStair.landing.x1 + r, z0: 1.6, z1: bayStair.landing.z1 }, gallery));
  stationStairs.forEach((s, i) => {
    // The landing's inner edge, beside the stair's top.
    const edgeX = s.dir > 0 ? s.landing.x0 : s.landing.x1, [z0, z1] = s.dir > 0 ? [1.6, s.z[0]] : [s.z[1], -1.6];
    parts.push(rail(`station-landing-rail-${i}`, { x0: edgeX - r, x1: edgeX + r, z0, z1 }, gallery));
  });
  // Bomb door coamings.
  bombDoors.forEach((d, i) => {
    parts.push(rail(`door-${i}-end`, { x0: d.x0 - 2 * r, x1: d.x0, z0: d.z0 - 2 * r, z1: d.z1 + 2 * r }, keel));
    parts.push(rail(`door-${i}-in`, { x0: d.x0, x1: d.x1, z0: d.z0 - 2 * r, z1: d.z0 }, keel));
    parts.push(rail(`door-${i}-out`, { x0: d.x0, x1: d.x1, z0: d.z1, z1: d.z1 + 2 * r }, keel));
  });
  // Gangway rails outside the hull, and each engine car's waist-high sides,
  // corner posts and roof.
  gangways.forEach((g, i) => {
    const outside = g.z0 > 0 ? { z0: 5.4, z1: g.z1 } : { z0: g.z0, z1: -5.4 };
    parts.push(rail(`gangway-${i}-0`, { x0: g.x0 - 2 * r, x1: g.x0, ...outside }, keel));
    parts.push(rail(`gangway-${i}-1`, { x0: g.x1, x1: g.x1 + 2 * r, ...outside }, keel));
  });
  engineCars.forEach((c, i) => {
    const out = c.z0 > 0 ? 1 : -1, far = out > 0 ? c.z1 : c.z0, near = out > 0 ? c.z0 : c.z1, door = gangways[i];
    const t = 0.15;
    parts.push(box(`car-${i}-far`, { x0: c.x0, x1: c.x1, z0: Math.min(far, far + out * t), z1: Math.max(far, far + out * t) }, keel, railHeight, structure));
    parts.push(box(`car-${i}-aft`, { x0: c.x0 - t, x1: c.x0, z0: c.z0, z1: c.z1 }, keel, railHeight, structure));
    parts.push(box(`car-${i}-fore`, { x0: c.x1, x1: c.x1 + t, z0: c.z0, z1: c.z1 }, keel, railHeight, structure));
    for (const [x0, x1] of [[c.x0, door.x0], [door.x1, c.x1]])
      parts.push(box(`car-${i}-near-${x0}`, { x0, x1, z0: Math.min(near, near - out * t), z1: Math.max(near, near - out * t) }, keel, railHeight, structure));
    for (const [x, z] of [[c.x0, c.z0], [c.x1, c.z0], [c.x0, c.z1], [c.x1, c.z1]])
      parts.push(box(`car-${i}-post-${x}-${z}`, { x0: x - t, x1: x + t, z0: z - t, z1: z + t }, keel, 2.4, structure));
    parts.push(box(`car-${i}-roof`, { x0: c.x0 - t, x1: c.x1 + t, z0: c.z0 - t, z1: c.z1 + t }, 2.4, 2.55, structure));
  });

  // Cover. Fuel tanks stand full height against alternate sides of the keel,
  // with low crates to vault between them.
  const tank = (id: string, x: number, side: 1 | -1) =>
    box(id, { x0: x - 0.8, x1: x + 0.8, z0: side > 0 ? 0.5 : -2, z1: side > 0 ? 2 : -0.5 }, keel, 2.2, "container", { maxHp: 240 });
  const crate = (id: string, x: number, z: number, w: number, d: number, h: number, y = keel) =>
    box(id, { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }, y, y + h, "wood", { maxHp: 64, farmProp: "crate" });
  parts.push(tank("tank-0", -45.5, 1), tank("tank-1", -41.5, -1), crate("keel-crate-0", -38.5, 1.5, 1.4, 1.0, 1.0));
  parts.push(tank("tank-2", -20.5, -1), tank("tank-3", -16, 1), crate("keel-crate-1", -12.5, -1.5, 1.4, 1.0, 1.0));
  parts.push(crate("station-crate-0", -27.5, 1.0, 1.6, 0.9, 1.1), crate("station-crate-1", -32.5, -1.0, 1.6, 0.9, 1.1));
  parts.push(crate("bomb-rack", -6.5, -4.4, 2.4, 1.0, 1.3));
  // Valve housings on the gallery and gas vents on the top walk break up the
  // long sight lines down each.
  parts.push(box("valve-0", { x0: -44, x1: -43, z0: 0.6, z1: 1.5 }, gallery, gallery + 1.9, "container"));
  parts.push(box("valve-1", { x0: -17, x1: -16, z0: -1.5, z1: -0.6 }, gallery, gallery + 1.9, "container"));
  parts.push(box("vent-0", { x0: -42.6, x1: -41.4, z0: -0.5, z1: 0.5 }, top, top + 1.9, "container"));
  parts.push(box("vent-1", { x0: -26.6, x1: -25.4, z0: -0.5, z1: 0.5 }, top, top + 1.9, "container"));
  return parts;
}

// Air inside the hull that soldiers move through; everything else inside the
// hull is gas cells, tanks and girders, which stop movement and sight.
const spaces: Volume[] = [
  ...spawnRoom.map((r) => volume(r, keel, keelHeadroom)),
  volume(outerOf(spawnTower), keel, deckUnderside),
  volume(galleryHead, gallery, gallery + 2.3),
  volume(galleryWalk, gallery, deckUnderside),
  volume(keelWalk, keel, keelHeadroom),
  volume(station, keel, atriumCeiling),
  ...gangways.map((r) => volume(r, keel, 2.4)),
  volume(bombBay, keel, atriumCeiling),
  volume(outerOf(bayTower), bayTower.base - floorThickness, deckUnderside),
  ...bombDoors.map((r) => volume(r, -3, keel)),
];

// The hull's cross-section, filled in horizontal slices and cut away round
// every space. A slice is as wide as the hull at its narrower end, so the
// fill stays inside the skin and never shows through it.
function hullFill(): Box[] {
  const { axis, radius } = zeppelinHull;
  const slices = [[-2.1, 0], [0, keelHeadroom], [keelHeadroom, gallery], [gallery, gallery + 2.3], [gallery + 2.3, atriumCeiling],
    [atriumCeiling, 11], [11, 12], [12, deckUnderside]];
  const stretches = [[-50, 0], [-53, -50], [-56, -53], [-59, -56], [-62, -59]];
  const solid: Volume[] = [];
  for (const [x0, x1] of stretches) {
    const r = hullRadius(x0);
    for (const [y0, y1] of slices) {
      const dy = Math.max(Math.abs(y0 - axis), Math.abs(y1 - axis)) - 0.05;
      if (dy >= r) continue;
      const half = Math.sqrt(r * r - dy * dy);
      solid.push({ x0, x1, z0: -half, z1: half, y0, y1 });
    }
  }
  return subtractAll(solid, spaces).map((v, i) => box(`hull-${i}`, v, v.y0, v.y1, "bunker"));
}

const turn = (b: Box): Box => ({ ...b, id: b.id!.replace(/^zep-/, "zep-bow-"), x: -b.x, z: -b.z });
const stern = [...sternHalf(), ...hullFill()];
const turnRect = (r: Rect): Rect => ({ x0: -r.x1, x1: -r.x0, z0: -r.z1, z1: -r.z0 });
const turnTower = (t: ZeppelinTower): ZeppelinTower => ({
  interior: turnRect(t.interior), nearX: -t.nearX, dir: (-t.dir) as 1 | -1,
  laneA: [-t.laneA[1], -t.laneA[0]], laneB: [-t.laneB[1], -t.laneB[0]], base: t.base, flights: t.flights,
});

// Navigation anchors every 1.25 m along each walkway, at its own height, so
// the coarse lattice (which finds no deck under open sky) is never needed.
function anchors(): Vec[] {
  const points: Vec[] = [];
  // Points are centred in the rectangle, at least 0.6 m in from its sides.
  const along = (a: number, b: number, spacing: number) => {
    const n = Math.max(1, Math.floor((b - a - 1.2) / spacing + 1e-6) + 1), mid = (a + b) / 2;
    return Array.from({ length: n }, (_, i) => mid + (i - (n - 1) / 2) * spacing);
  };
  const grid = (r: Rect, y: number, spacing = 1.25) => {
    for (const x of along(r.x0, r.x1, spacing)) for (const z of along(r.z0, r.z1, spacing)) points.push({ x, z, y });
  };
  spawnRoom.forEach((r) => grid(r, keel));
  grid(keelWalk, keel);
  grid(station, keel, 1.5);
  gangways.forEach((r) => grid(r, keel));
  engineCars.forEach((r) => grid(r, keel));
  grid(bombBay, keel, 1.5);
  grid(galleryHead, gallery);
  grid(galleryWalk, gallery);
  [...stationStairs, bayStair].forEach((s) => grid(s.landing, gallery));
  grid({ x0: -10, x1: -10 + landingDepth, z0: bayTower.interior.z1, z1: -1.5 }, gallery, 0.6);
  grid(deck, top);
  grid(platform, top, 1.5);
  // Stairs: the foot, middle and top of every flight.
  const { rise, run } = zeppelinStep;
  const flightAnchors = (xFoot: number, dir: number, z: [number, number], y: number, steps: number) => {
    for (const i of [0, steps / 2 - 1, steps - 1]) points.push({ x: xFoot + dir * (i + 0.5) * run, z: (z[0] + z[1]) / 2, y: y + rise * (i + 1) });
  };
  for (const t of [spawnTower, bayTower]) {
    const start = t.nearX + t.dir * landingDepth, end = start + t.dir * flightRun, far = end + t.dir * landingDepth;
    for (let n = 0; n < t.flights; n++) {
      const up = n % 2 === 0;
      flightAnchors(up ? start : end, up ? t.dir : -t.dir, up ? t.laneA : t.laneB, t.base + n * flightRise, zeppelinStep.flight);
    }
    const lanes = { z0: t.laneA[0], z1: t.laneB[1] };
    const nearLanding = { x0: Math.min(t.nearX, start), x1: Math.max(t.nearX, start), ...lanes };
    const farLanding = { x0: Math.min(end, far), x1: Math.max(end, far), ...lanes };
    // Landings below the top walk: near ones on even levels, far ones on odd.
    for (let k = 0; k < t.flights; k++) grid(k % 2 ? farLanding : nearLanding, t.base + k * flightRise, 0.7);
  }
  [...stationStairs, bayStair].forEach((s) => flightAnchors(s.foot, s.dir, s.z, keel, 2 * zeppelinStep.flight));
  // Either side of every doorway, on its centre line.
  gangways.forEach((g) => {
    const x = (g.x0 + g.x1) / 2, inward = g.z0 > 0 ? -1 : 1, edge = g.z0 > 0 ? g.z0 : g.z1;
    for (const d of [0.9, -0.9]) points.push({ x, z: edge + inward * d, y: keel });
  });
  const bayDoor = bayTower.interior.x0 + landingDepth / 2;
  points.push({ x: bayDoor, z: -1.0, y: gallery }, { x: bayDoor, z: bayTower.interior.z1 - 0.9, y: gallery });
  return points;
}
const sternAnchors = anchors();

const flags = [
  { id: "A", name: "Aft engines", x: -30, z: 0, y: keel, home: "blue" },
  { id: "B", name: "Bomb bay", x: 0, z: 0, y: keel },
  { id: "C", name: "Forward engines", x: 30, z: 0, y: keel, home: "red" },
] satisfies MapDefinition["sectors"];

const lanePoints = (team: "blue" | "red") => {
  const s = team === "blue" ? 1 : -1, p = (x: number, z: number, y: number) => ({ x: s * x, z: s * z, y });
  return {
    // Up the spawn tower to the gallery, then along it.
    gallery: [p(-50, 0, gallery), p(-40, 0, gallery)],
    // Up the spawn tower to the top walk, then along it to the bomb bay hatch.
    top: [p(-58, 1.4, top), p(-30, 0, top), p(-3.25, -3.1, top)],
  };
};

export const zeppelinMap: MapDefinition = {
  id: "zeppelin", name: "Zeppelin", width: 170, depth: 40, navSpacing: 2.5,
  defaultTeamSize: 6, scoring: "domination", artillery: false,
  sky: {
    floor: -400, fallLimit: -12,
    spawnAreas: { blue: { x0: -59, x1: -49, z0: -3.5, z1: 0.3 }, red: { x0: 49, x1: 59, z0: -0.3, z1: 3.5 } },
  },
  zeppelin: {
    hull: zeppelinHull, levels: zeppelinLevels,
    towers: [spawnTower, bayTower, turnTower(spawnTower), turnTower(bayTower)],
    engineCars: [...engineCars, ...engineCars.map(turnRect)],
    plan: (() => {
      const both = (rects: Rect[]) => [...rects, ...rects.map(turnRect)];
      return {
        keel: both([...spawnRoom, keelWalk, station, bombBay, ...gangways, ...engineCars]),
        gallery: both([galleryHead, galleryWalk]),
        top: both([deck, platform]),
      };
    })(),
    bombDoors: [...bombDoors, ...bombDoors.map(turnRect)],
    lanes: { blue: lanePoints("blue"), red: lanePoints("red") },
  },
  spawn: { blue: { x: -55, z: -1.6, y: keel }, red: { x: 55, z: 1.6, y: keel } },
  sectors: flags,
  navigationPoints: [...sternAnchors, ...sternAnchors.map((p) => ({ x: -p.x, z: -p.z, y: p.y }))],
  buildings: [],
  boxes: [...stern, ...stern.map(turn)],
};
