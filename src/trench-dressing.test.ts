import { expect, it } from "vitest";
import { brazierSites } from "./atmosphere";
import { backdropBoxMesh } from "./backdrop";
import { groundHeight } from "./map";
import {
  dugoutBoxes, dugouts, paradosBags, revetmentPixels, revetmentStyle, signboards, trenchProps, trenchStretches,
} from "./trench-dressing";
import { trenchMap } from "./trench-map";
import { verdunMap } from "./verdun-map";

const bank = trenchMap.terrain!.bankHeight, stretches = trenchStretches(trenchMap);
const stretchAt = (x: number, z: number) =>
  stretches.filter((s) => z >= s.z0 - 0.5 && z <= s.z1 + 0.5).sort((a, b) => Math.abs(a.floorX - x) - Math.abs(b.floorX - x))[0];

it("lines the parados with sandbags on level bank top, never on the enemy side", () => {
  const bags = paradosBags(trenchMap);
  expect(bags.length).toBeGreaterThan(400);
  for (const b of bags) {
    expect(Math.abs(groundHeight(b.x, b.z, trenchMap) - bank)).toBeLessThan(0.06);
    const s = stretchAt(b.x, b.z), behind = (b.x - s.floorX) * s.rear;
    expect(behind).toBeGreaterThan(s.half + 1);
    expect(behind).toBeLessThan(s.half + 1.6);
  }
});

it("keeps props inside the trenches and clear of every firing position", () => {
  const props = trenchProps(trenchMap, brazierSites(trenchMap));
  const firing = trenchMap.terrain!.firingPositions!;
  expect(props.boxes.length).toBeGreaterThan(60);
  for (const b of props.boxes) {
    expect(groundHeight(b.x, b.z, trenchMap)).toBeLessThan(1);
    for (const f of firing) expect(Math.hypot(f.x - b.x, f.z - b.z)).toBeGreaterThan(1.1);
  }
  expect(props.embers).toHaveLength(brazierSites(trenchMap).length);
  expect(props.water.length).toBeGreaterThan(20);
  for (let i = 0; i < props.cable.length; i += 3) expect(groundHeight(props.cable[i], props.cable[i + 2], trenchMap)).toBeLessThan(0.2);
});

it("opens dugouts into intact rear walls of rear trenches", () => {
  const list = dugouts(trenchMap);
  expect(list.length).toBeGreaterThanOrEqual(4);
  for (const d of list) {
    expect(d.floor).toBeLessThan(0.1);
    for (const dz of [-0.9, 0, 0.9]) expect(groundHeight(d.x + d.rear * 1.1, d.z + dz, trenchMap)).toBeGreaterThan(bank - 0.05);
    expect(dugoutBoxes(d)).toHaveLength(5);
  }
});

it("points every signboard's arrow toward its team's nearest flag as its reader sees it", () => {
  const signs = signboards(trenchMap);
  expect(signs.length).toBeGreaterThan(8);
  for (const sign of signs) {
    const [, direction] = sign.text.split("\n"), [arrow, id] = direction.split(" ");
    const flag = trenchMap.sectors.find((f) => f.id === id)!;
    // The reader faces the board's wall, along (-facing, 0, 0); right = forward × up.
    const forward = [-sign.facing, 0, 0], right = [-forward[2], 0, forward[0]];
    const towardFlag = Math.sign((flag.z - sign.z) * right[2] + (flag.x - sign.x) * right[0] * 0);
    expect(arrow).toBe(towardFlag > 0 ? "→" : "←");
    expect(groundHeight(sign.x, sign.z, trenchMap)).toBeLessThan(0.2);
  }
});

it("gives each side its own revetment finishes and textures", () => {
  for (let i = 0; i < 12; i++) {
    expect(["timber", "corrugated", "sandbag"]).toContain(revetmentStyle(i, -30));
    expect(["timber", "wicker"]).toContain(revetmentStyle(i, 30));
  }
  // Nine ribs across the panel: count upward crossings of the mean on a smoothed row.
  const iron = revetmentPixels("corrugated"), raw = Array.from({ length: 128 }, (_, x) => iron[(10 * 128 + x) * 4]);
  const row = raw.map((_, x) => [-2, -1, 0, 1, 2].reduce((n, d) => n + raw[(x + d + 128) % 128], 0) / 5);
  const mean = row.reduce((n, v) => n + v, 0) / row.length;
  const ribs = row.filter((v, x) => x > 0 && row[x - 1] < mean && v >= mean).length;
  expect(ribs).toBeGreaterThanOrEqual(8);
  expect(ribs).toBeLessThanOrEqual(10);
  for (const style of ["wicker", "sandbag"] as const) expect(revetmentPixels(style)).toHaveLength(128 * 64 * 4);
});

it("keeps all trench dressing within a modest triangle budget", () => {
  const props = trenchProps(trenchMap, brazierSites(trenchMap));
  const mesh = backdropBoxMesh([...paradosBags(trenchMap), ...props.boxes, ...dugouts(trenchMap).flatMap(dugoutBoxes)]);
  expect(mesh.indices.length / 3).toBeLessThan(25_000);
});

it("dresses Verdun's narrow trenches: parados bags, props, dugouts and French signboards", () => {
  const vBank = verdunMap.terrain!.bankHeight, vStretches = trenchStretches(verdunMap);
  // Every Verdun trench is a 2 m cut centred on its line.
  expect(vStretches).toHaveLength(12);
  for (const s of vStretches) {
    expect(s.half).toBe(1);
    expect(groundHeight(s.floorX, (s.z0 + s.z1) / 2, verdunMap)).toBeLessThan(0.1);
  }
  const vAt = (x: number, z: number) =>
    vStretches.filter((s) => z >= s.z0 - 0.5 && z <= s.z1 + 0.5).sort((a, b) => Math.abs(a.floorX - x) - Math.abs(b.floorX - x))[0];
  const bags = paradosBags(verdunMap);
  expect(bags.length).toBeGreaterThan(200);
  for (const b of bags) {
    expect(Math.abs(groundHeight(b.x, b.z, verdunMap) - vBank)).toBeLessThan(0.06);
    const s = vAt(b.x, b.z);
    expect((b.x - s.floorX) * s.rear).toBeGreaterThan(s.half + 1);
  }
  const props = trenchProps(verdunMap, brazierSites(verdunMap));
  expect(props.boxes.length).toBeGreaterThan(40);
  for (const b of props.boxes) expect(groundHeight(b.x, b.z, verdunMap)).toBeLessThan(1);
  expect(dugouts(verdunMap).length).toBeGreaterThanOrEqual(2);
  const signs = signboards(verdunMap);
  expect(signs.length).toBeGreaterThanOrEqual(8);
  expect(signs.filter((s) => s.x < 0).every((s) => /^(TR\.|BOYAU)/.test(s.text))).toBe(true);
  for (const sign of signs) {
    const id = sign.text.split("\n")[1].split(" ")[1];
    expect(verdunMap.sectors.find((f) => f.id === id)?.home).toBe(sign.x < 0 ? "blue" : "red");
  }
  // The French side is mostly woven hurdles; Trench front's British side is unchanged.
  const french = Array.from({ length: 12 }, (_, i) => revetmentStyle(i, -60, "french"));
  expect(french.filter((s) => s === "wicker").length).toBeGreaterThanOrEqual(6);
  expect(revetmentStyle(1, -60)).toBe("corrugated");
  const mesh = backdropBoxMesh([...bags, ...props.boxes, ...dugouts(verdunMap).flatMap(dugoutBoxes)]);
  expect(mesh.indices.length / 3).toBeLessThan(20_000);
});
