import { coastDistance, groundHeight, type Box, type MapDefinition, type Vec } from "./map";
import { buildTrenchBanks } from "./trench-banks";
import { buildTrenchElevation, buildTrenchRelief } from "./terrain-relief";
import { type VillageBuilding } from "./village-buildings";
import { buildKitHouse, buildKitTerrace, type KitPlacement, type KitPlan } from "./house-kit";
import { bakery, barn, cottage, farmhouse, manor, narrowTownhouse, tenement } from "./house-kit-plans";

// A lighthouse headland: a west-to-east peninsula with the French
// approach from the mainland road and the German position behind the
// lighthouse on the tip. The friend's layout sketch is about 1,100 m long;
// this compresses it to 0.19 m per sketch pixel so it fits the engine's scale.
const width = 300, depth = 170, bankHeight = 2.4;
const at = (px: number, py: number): Vec =>
  ({ x: Math.round((px - 835) * 0.19 * 2) / 2, z: Math.round((py - 478) * 0.19 * 2) / 2 });

// Traced clockwise from the mainland neck in sketch pixels.
const coast = ([
  [85,480],[135,290],[240,230],[205,130],[260,95],[380,95],[480,100],[540,175],[660,155],[700,100],
  [800,65],[880,80],[1010,75],[1100,110],[1130,170],[1270,185],[1280,270],[1330,290],[1480,215],
  [1500,185],[1570,195],[1590,330],[1575,500],[1470,520],[1400,545],[1385,590],[1270,600],[1150,650],
  [1090,700],[1050,790],[860,860],[760,800],[640,690],[540,715],[400,655],[320,620],[240,570],[150,560],[150,520],
] as const).map(([px, py]) => at(px, py));

const heights = new Float32Array(width * depth).fill(bankHeight);
const boxes: Box[] = [], vegetation: Box[] = [];

const building = (id: string, name: string, x: number, z: number, w: number, d: number): VillageBuilding =>
  ({ id, name, x, z, w, d, stories: 1, baseY: bankHeight, posts: [] });
// Enterable, destructible houses from the house kit (docs/HOUSE_KIT.md),
// each turned so its front faces the nearest street. Sizes are the turned
// kit footprints.
const buildings = [
  building("farm", "Mainland farmhouse", -114, -30, 15, 12.5),
  building("customs", "Customs house", -75, -55, 12.5, 10),
  building("cottage", "Clifftop cottage", -88, 10, 10, 10),
  building("bakery", "Square bakery", -20, 6, 10, 10),
  building("villa", "Keeper's villa", 80, -25, 12.5, 15),
  building("store", "Chandler's store", 50, 24, 15, 10),
  building("signal", "Signal cottage", 92, 8, 10, 10),
];
const kitBuildings: Record<string, { plan: KitPlan } & Pick<KitPlacement, "turns" | "style">> = {
  farm: { plan: farmhouse, turns: 2 },
  customs: { plan: tenement, turns: 3 },
  cottage: { plan: cottage },
  bakery: { plan: bakery, turns: 2 },
  villa: { plan: manor, turns: 3 },
  store: { plan: barn, style: "smithy" },
  signal: { plan: cottage },
};
// The south row is a terrace of townhouses facing the street round the square.
const southRow = { id: "row", name: "South row house", x: 6, z: 31, count: 5 };
const southRowFootprint = { x: southRow.x, z: southRow.z, w: southRow.count * 7.5, d: 12.5 };
// Sealed landmarks: the contributed exterior models, with box collision.
// The church model is turned so its tower stands at the north end.
const landmarksSolid: (Vec & { id: string; w: number; d: number; h: number; model?: Box["model"] })[] = [
  { id: "lighthouse", x: 96, z: -15, w: 6.2, d: 6.2, h: 21.6, model: { name: "lighthouse" } },
  { id: "church-nave", x: -18, z: -16.1, w: 8.6, d: 14.2, h: 8, model: { name: "church", yaw: 90, z: -18 } },
  { id: "church-tower", x: -18, z: -25.15, w: 3.8, d: 3.9, h: 14.5 },
  { id: "tenement-north", x: 8, z: -36, w: 19.2, d: 11.5, h: 17.2, model: { name: "tenement" } },
  { id: "tenement-east", x: 28, z: -22, w: 11.5, d: 19.2, h: 17.2, model: { name: "tenement", yaw: 90 } },
];

const loop = [at(640,410),at(680,290),at(760,215),at(1000,200),at(1130,215),at(1190,290),at(1195,470),
  at(1150,520),at(1000,540),at(1000,575),at(720,575),at(650,540),at(640,410)];
const streets = [
  { width: 6, points: loop },
  { width: 6, points: [at(300,420), at(640,410)] },
  { width: 5, points: [at(1195,400), at(1300,400)] },
  { width: 4.5, points: [at(215,520), at(300,560), at(420,640), at(560,690), at(640,640), at(720,575)] },
  { width: 4.5, points: [at(300,420), at(300,250), at(330,180)] },
];

export const headlandMap: MapDefinition = {
  id: "headland", name: "Lighthouse point", width, depth, navSpacing: 4, navigationPoints: [],
  buildings, streets, coast, scoring: "domination",
  spawn: { blue: { x: -113, z: -9 }, red: { x: 124, z: -16 } },
  sectors: [
    { id: "A", name: "Cliff Park", x: -63, z: -27, home: "blue" },
    { id: "B", name: "Fountain Square", x: 5, z: -9 },
    { id: "C", name: "Walled Green", x: 50, z: -14, home: "red" },
  ],
  landmarks: [
    { id: "A", name: "Cliff Park", kind: "woodland", x: -63, z: -27, radius: 12 },
    { id: "B", name: "Fountain Square", kind: "farmhouse", x: 5, z: -9, radius: 14 },
    { id: "C", name: "Walled Green", kind: "farmhouse", x: 50, z: -14, radius: 12 },
  ],
  boxes, vegetation,
  terrain: { columns: width, rows: depth, cellSize: 1, heights, bankHeight, rectangles: [], ramps: [],
    trenchLines: [], communicationRoutes: [], lining: [], craters: [], shellScars: [] },
};
// The sea bed sits a full bank below the land, leaving a low cliff all round.
for (let row = 0; row < depth; row++) for (let col = 0; col < width; col++)
  if (coastDistance(col + 0.5 - width / 2, row + 0.5 - depth / 2, headlandMap) < 0) heights[row * width + col] = 0;

const terrain = headlandMap.terrain!;
terrain.banks = buildTrenchBanks(headlandMap);
// Whole foundations stay level without scanning every wall panel.
terrain.elevation = buildTrenchElevation({ ...headlandMap, boxes: [
  ...[...buildings, southRowFootprint].map(b => ({ x: b.x, z: b.z, w: b.w + 2, d: b.d + 2, h: 1, kind: "building" as const })),
  ...landmarksSolid.map(b => ({ x: b.x, z: b.z, w: b.w + 2, d: b.d + 2, h: 1, kind: "building" as const })),
] });
terrain.relief = buildTrenchRelief(headlandMap, []);
buildings.forEach((b, i) => {
  const kit = kitBuildings[b.id];
  buildKitHouse(headlandMap, kit.plan, { id: b.id, name: b.name, x: b.x, z: b.z, baseY: bankHeight, variant: i, turns: kit.turns, style: kit.style });
});
buildKitTerrace(headlandMap, narrowTownhouse, { ...southRow, baseY: bankHeight, variant: 1 });

const add = (id: string, x: number, z: number, w: number, d: number, h: number, kind: Box["kind"] = "masonry") => {
  const b: Box = { id: "headland-" + id, x, z, w, d, h, kind, baseY: groundHeight(x, z, headlandMap) - 0.03 };
  boxes.push(b);
  return b;
};
for (const b of landmarksSolid) {
  const solid = add(b.id, b.x, b.z, b.w, b.d, b.h, "building");
  solid.baseY = bankHeight;
  if (b.model) solid.model = b.model;
}

const roadDistance = (x: number, z: number) => {
  let nearest = Infinity;
  for (const street of streets) for (let i = 1; i < street.points.length; i++) {
    const a = street.points[i - 1], b = street.points[i], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    nearest = Math.min(nearest, Math.hypot(x - a.x - dx * t, z - a.z - dz * t) - street.width / 2);
  }
  return nearest;
};
const footprints = [...buildings, ...landmarksSolid];
const clear = (x: number, z: number, margin: number) =>
  coastDistance(x, z, headlandMap) > margin + 2 && roadDistance(x, z) > margin &&
  footprints.every(b => Math.abs(x - b.x) > b.w / 2 + margin + 1 || Math.abs(z - b.z) > b.d / 2 + margin + 1) &&
  Object.values(headlandMap.spawn).every(s => Math.hypot(x - s.x, z - s.z) > 12 + margin);

// The fountain stands off the flag so the capture space itself stays open.
const fountain=add("fountain", 5, -3, 3.2, 3.2, 1);
fountain.landmark="B";fountain.farmProp="fountain";
// Broken rings of low cover around each flag, open toward both approaches.
for (const flag of headlandMap.sectors) {
  const pieces = flag.id === "A" ? 9 : 7;
  for (let i = 0; i < pieces; i++) {
    const angle = (i / pieces) * Math.PI * 2 + (flag.id === "B" ? 0.45 : 0.2), radius = 7.5 + (i % 3) * 1.6;
    const x = Math.round((flag.x + Math.cos(angle) * radius) * 2) / 2, z = Math.round((flag.z + Math.sin(angle) * radius) * 2) / 2;
    if (!clear(x, z, 0.5) || Math.hypot(x - 5, z + 3) < 4) continue;
    const alongX = Math.abs(Math.sin(angle)) > 0.7;
    if (flag.id === "A" && i % 3 === 0) add(`${flag.id}-rock-${i}`, x, z, 1.9, 1.3, 0.7, "rubble");
    else if (flag.id === "B" && i % 2) add(`${flag.id}-crate-${i}`, x, z, 1.1, 0.9, 0.9, "wood").farmProp = "crate";
    else add(`${flag.id}-wall-${i}`, x, z, alongX ? 3.2 : 0.45, alongX ? 0.45 : 3.2, 1.05);
  }
}
// Garden walls give the long park and the green edges that can be held.
for (const [i, [x, z, w, d]] of ([
  [-84, -38, 0.45, 9], [-84, -18, 0.45, 9], [-72, -44, 9, 0.45], [-52, -44, 9, 0.45], [-46, -34, 0.45, 8],
  [38, -26, 0.45, 8], [38, -4, 0.45, 8], [62, -26, 0.45, 8], [62, -4, 0.45, 8], [46, -30, 8, 0.45], [54, 2, 8, 0.45],
  [-60, 4, 9, 0.45], [-48, 22, 0.45, 9], [70, 6, 9, 0.45], [108, -30, 0.45, 9], [108, -2, 0.45, 9],
] as const).entries()) if (clear(x, z, 0.3)) add("garden-" + i, x, z, w, d, 1.1);
// Sandbags where the roads leave cover behind.
for (const [i, [x, z]] of ([[-96, -6], [-44, -8], [-28, -40], [34, 8], [74, -10], [86, -12], [-64, 30], [0, 24]] as const).entries())
  if (coastDistance(x, z, headlandMap) > 4) add("bags-" + i, x, z, 2.4, 0.8, 0.9, "sandbag");
for (const [i, [x, z]] of ([[-2, -14], [14, 2], [-40, 20], [60, -40]] as const).entries())
  if (clear(x, z, 0)) add("cart-" + i, x, z, 2.4, 1.3, 0.95, "wood").farmProp = "cart";

// Small gardens and street furniture give each house a usable outdoor edge.
// Whole footprints stay off roads and at least two metres from door walls;
// wood breaks under fire instead of becoming permanent visual clutter.
const furnishing=(id:string,prop:NonNullable<Box["farmProp"]>,x:number,z:number,w:number,d:number,h:number)=>{
  const radius=Math.hypot(w,d)/2;
  if(!clear(x,z,radius+.15)||headlandMap.sectors.some(s=>Math.hypot(x-s.x,z-s.z)<6+radius)||
    boxes.some(b=>!b.architecture&&Math.abs(x-b.x)<(w+b.w)/2+.65&&Math.abs(z-b.z)<(d+b.d)/2+.65))return;
  add("street-"+id,x,z,w,d,h,"wood").farmProp=prop;
};
for(const b of buildings) {
  for(const side of [-1,1]) {
    furnishing(b.id+"-fence-"+side,"fence",b.x+side*(b.w/2+3.2),b.z-b.d*.3,.16,3.2,.88);
    furnishing(b.id+"-planter-"+side,"planter",b.x+side*b.w*.3,b.z+b.d/2+3,1.5,.85,.72);
  }
}
for(const flag of headlandMap.sectors)for(const side of [-1,1]) {
  furnishing(flag.id+"-bench-"+side,"bench",flag.x+side*10.5,flag.z+5.5,2.2,.7,.94);
  furnishing(flag.id+"-planter-"+side,"planter",flag.x+side*10.5,flag.z+8,1.5,.85,.72);
}

// Scattered trees from a fixed sequence: no gameplay RNG, stable across runs.
for (let i = 0, placed = 0; i < 900 && placed < 90; i++) {
  const x = Math.round((-146 + ((i * 7919) % 2920) / 10) * 2) / 2, z = Math.round((-82 + ((i * 3571) % 1640) / 10) * 2) / 2;
  if (!clear(x, z, 2) || headlandMap.sectors.some(s => Math.hypot(x - s.x, z - s.z) < 7) ||
    boxes.some(b => !b.architecture && Math.abs(x - b.x) < b.w / 2 + 1.5 && Math.abs(z - b.z) < b.d / 2 + 1.5) ||
    vegetation.some(b => Math.hypot(x - b.x, z - b.z) < 5)) continue;
  vegetation.push({ id: "tree-headland-" + placed, x, z, w: 0.65, d: 0.65, h: 4 + (placed % 3) * 0.5, kind: "tree",
    treeStyle: "sparse", baseY: groundHeight(x, z, headlandMap) });
  placed++;
}
// Fine local waypoints connect cover gaps to the coarse field graph.
for (const flag of headlandMap.sectors) for (let x = -8; x <= 8; x += 2) for (let z = -8; z <= 8; z += 2)
  headlandMap.navigationPoints!.push({ x: flag.x + x, z: flag.z + z });
for (const street of streets) for (const p of street.points) headlandMap.navigationPoints!.push({ ...p });
