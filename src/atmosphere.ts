import { boundaryWireLayout } from "./boundary-wire";
import { groundHeight, playArea, type MapDefinition, type Vec } from "./map";

// Presentation-only atmosphere for maps whose look asks for it: drifting
// ground mist, smoke from trench braziers and fresh craters, and scraps of
// cloth caught on the boundary wire. Mist values are billboard opacities.
export type Atmosphere = { fieldMist: number; trenchMist: number };

const hash = (n: number) => {
  const s = Math.sin(n * 12.9898 + 7.233) * 43758.5453;
  return s - Math.floor(s);
};

export type MistBank = { x: number; y: number; z: number; w: number; h: number; drift: number; trench: boolean };

// Soft banks of mist rather than flat sheets: a sheet seen from above washes
// out everything beneath it, while billboards read as mist at the grazing
// angles and distances where ground mist is actually seen. Wide, low banks
// lie across no-man's land; smaller ones pool along the trench floors.
export function mistBanks(map: MapDefinition): MistBank[] {
  const bank = map.terrain?.bankHeight ?? 0, area = playArea(map), banks: MistBank[] = [];
  for (let i = 0; i < 60; i++) {
    const x = (hash(i * 1.7) - 0.5) * 64, z = (hash(i * 2.9) - 0.5) * (area.depth + 30);
    banks.push({ x, y: bank + 0.7 + hash(i * 3.1) * 0.5, z, w: 9 + hash(i * 4.3) * 9, h: 2.2 + hash(i * 5.1) * 1.6, drift: 0.25 + hash(i * 6.7) * 0.3, trench: false });
  }
  const lines = map.terrain?.trenchLines ?? [];
  let n = 0;
  for (const line of lines)
    for (const s of line.sections) {
      if (n++ % 2) continue;
      const z = s.z + (hash(n * 7.3) - 0.5) * s.length * 0.6;
      if (groundHeight(s.x, z, map) > 1) continue;
      banks.push({ x: s.x, y: 0.55, z, w: 4 + hash(n * 8.1) * 2.5, h: 1.2 + hash(n * 9.7) * 0.6, drift: 0.12, trench: true });
    }
  return banks;
}

// Braziers in each shelter bay and along every other rear-trench section.
export function brazierSites(map: MapDefinition): Vec[] {
  const sites: Vec[] = [...(map.terrain?.shelterBays ?? [])].map(({ x, z }) => ({ x, z }));
  for (const line of map.terrain?.trenchLines ?? [])
    if (line.role === "rear")
      line.sections.forEach((s, i) => { if (i % 2 === 1) sites.push({ x: s.x, z: s.z }); });
  return sites;
}

// Scraps of cloth snagged on the outer picket row, every 23 m or so.
export function clothScraps(map: MapDefinition) {
  if (!map.boundary) return [];
  const area = playArea(map), out = boundaryWireLayout.rows[0], scraps: { x: number; y: number; z: number; yaw: number; color: string }[] = [];
  let n = 0;
  for (const [axis, side] of [["x", -1], ["x", 1], ["z", -1], ["z", 1]] as const) {
    const edge = (axis === "x" ? area.width : area.depth) / 2, half = (axis === "x" ? area.depth : area.width) / 2;
    for (let along = -half + 7; along < half; along += 23, n++) {
      const x = axis === "x" ? side * (edge + out) : along + 1.2, z = axis === "x" ? along + 1.2 : side * (edge + out);
      scraps.push({ x, y: groundHeight(x, z, map) + 0.62, z, yaw: axis === "x" ? Math.PI / 2 : 0, color: n % 3 ? "#6c654f" : "#77766c" });
    }
  }
  return scraps;
}
