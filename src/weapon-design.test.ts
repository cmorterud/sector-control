import {test,expect} from "vitest";
import {bayonetMount,weaponDesign} from "./weapon-design";
import {barrelEnd} from "./player-view";
import {rifleGeometry, type RiflePart} from "./rifle-geometry";
import { Mat4, Quat, Vec3 } from "playcanvas";
const ids=["SMLE Mk III","Gewehr 98","Berthier Mle 1916","Scoped Lebel","Lewis Mk I","MG 08/15","Chauchat","Webley Mk VI","P08","Ruby"];
test("historical models have separate furniture and feed systems, finite shared geometry and matching muzzle anchors",()=>{
 const signatures=new Set();
 for(const id of ids){
  const kind=id.includes("Mk I")&&id.startsWith("Lewis")||["MG 08/15","Chauchat"].includes(id)?"machineGun":["Webley Mk VI","P08","Ruby"].includes(id)?"pistol":"serviceRifle";
  const d=weaponDesign({weapon:kind,weaponId:id})!;expect(d,id).toBeDefined();
  signatures.add(JSON.stringify(d.parts));expect(barrelEnd(kind,id)).toBe(d.muzzle);
  for(const p of [...d.parts,...d.actionParts,...(d.viewParts ?? []),d.magazine]){
   expect([...p.at,...p.size].every(Number.isFinite)).toBe(true);expect(p.size.every(v=>v>0)).toBe(true);
   expect(rifleGeometry(p.shape).indices.length).toBeGreaterThan(0);
  }
 }
 expect(signatures.size).toBe(10);
 expect(weaponDesign({weapon:"rifle",weaponId:"SMLE Mk III"})).toBeUndefined();
 expect(weaponDesign({weapon:"serviceRifle"})).toBeUndefined();
});

// Find the outer surface on a horizontal line through the actual receiver mesh.
function surfaceWidth(part: RiflePart, detail: "view" | "world" | "far", y: number, z: number) {
  const mesh = rifleGeometry(part.shape, detail);
  const transform = new Mat4().setTRS(new Vec3(...part.at),
    new Quat().setFromEulerAngles(...(part.rotation ?? [0, 0, 0])), new Vec3(...part.size));
  const vertices: Vec3[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    vertices.push(transform.transformPoint(new Vec3(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2])));
  }
  let width = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = mesh.indices.slice(i, i + 3).map((index) => vertices[index]);
    const det = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y);
    if (Math.abs(det) < 1e-10) continue;
    const u = ((y - a.y) * (c.z - a.z) - (z - a.z) * (c.y - a.y)) / det;
    const v = ((b.y - a.y) * (z - a.z) - (b.z - a.z) * (y - a.y)) / det;
    if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) {
      width = Math.max(width, Math.abs(a.x + u * (b.x - a.x) + v * (c.x - a.x)));
    }
  }
  return width;
}

test.each(["Berthier Mle 1916", "Gewehr 98"])("seats both %s receiver rails through their full length", (weaponId) => {
  const design = weaponDesign({ weapon: "serviceRifle", weaponId })!;
  const receiver = design.parts.find((part) => part.name === "receiver")!;
  const rails = design.parts.filter((part) => /^receiver (left|right) rail$/.test(part.name));
  expect(rails).toHaveLength(2);
  for (const detail of ["view", "world", "far"] as const) {
    for (const rail of rails) {
      const innerX = Math.abs(rail.at[0]) - rail.size[0] / 2;
      const bottom = rail.at[1] - rail.size[1] / 2;
      for (const fraction of [-.5, 0, .5]) {
        const z = rail.at[2] + rail.size[2] * fraction;
        expect(surfaceWidth(receiver, detail, bottom, z)).toBeGreaterThan(innerX + .001);
      }
    }
  }
});

// Where a part's real surface crosses the plane at `z`: [x, y] points.
function crossSection(part: RiflePart, z: number, detail: "view" | "world" | "far" = "view") {
  const mesh = rifleGeometry(part.shape, detail);
  const transform = new Mat4().setTRS(new Vec3(...part.at),
    new Quat().setFromEulerAngles(...(part.rotation ?? [0, 0, 0])), new Vec3(...part.size));
  const vertices: Vec3[] = [], points: [number, number][] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    vertices.push(transform.transformPoint(new Vec3(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2])));
  }
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const corners = [0, 1, 2].map((n) => vertices[mesh.indices[i + n]]);
    for (let n = 0; n < 3; n++) {
      const a = corners[n], b = corners[(n + 1) % 3];
      if (a.z === b.z || (a.z - z) * (b.z - z) > 0) continue;
      const t = (z - a.z) / (b.z - a.z);
      points.push([a.x + t * (b.x - a.x), a.y + t * (b.y - a.y)]);
    }
  }
  return points;
}
const serviceRifles = ["SMLE Mk III", "Gewehr 98", "Berthier Mle 1916", "Scoped Lebel", "Karabiner 98AZ", "Berthier Mle 1892 M16"];
const bandable = new Set(["wooden stock", "barrel", "upper handguard", "cleaning rod",
  "SMLE full wooden fore-end", "Berthier long nose ferrule", "Lebel tubular magazine"]);

// The bands used to be 10 x 13 cm discs around a fore-end half that size, so
// their rims stood out from the rifle like loose hoops.
test.each(serviceRifles)("fits the %s barrel bands to the wood and metal they wrap", (weaponId) => {
  const design = weaponDesign({ weapon: "serviceRifle", weaponId })!;
  const bands = design.parts.filter((part) => part.name === "barrel band");
  const stations = [...new Set(bands.map((band) => band.at[2]))];
  expect(stations).toHaveLength(2);
  for (const z of stations) {
    const pieces = bands.filter((band) => band.at[2] === z)
      .map((band) => ({ a: band.size[0] / 2, b: band.size[2] / 2, y: band.at[1] }));
    const inside = ([x, y]: [number, number]) => pieces.some((p) => (x / p.a) ** 2 + ((y - p.y) / p.b) ** 2 <= 1);
    const wrapped: [number, number][] = [];
    for (const part of design.parts.filter((part) => bandable.has(part.name))) {
      // The middle of the band's length, where it is at its full size.
      for (const offset of [-.0075, 0, .0075]) {
        const section = crossSection(part, z + offset);
        const held = section.filter(inside).length;
        // Whatever passes through a band is wholly inside it; nothing pokes out through its side.
        expect([0, section.length], `${part.name} at ${z}`).toContain(held);
        if (held) wrapped.push(...section);
      }
    }
    expect(wrapped.length, `band at ${z} wraps something`).toBeGreaterThan(0);
    for (const p of pieces) {
      for (const [x, y] of [[-p.a, p.y], [p.a, p.y], [0, p.y - p.b], [0, p.y + p.b]]) {
        const gap = Math.min(...wrapped.map(([wx, wy]) => Math.hypot(wx - x, wy - y)));
        expect(gap, `band at ${z} stands off at ${x.toFixed(3)}, ${y.toFixed(3)}`).toBeLessThan(.008);
      }
    }
  }
});

test.each(serviceRifles)("hangs the %s front sling swivel from the underside of its stock", (weaponId) => {
  const design = weaponDesign({ weapon: "serviceRifle", weaponId })!;
  const swivel = design.parts.find((part) => part.name === "sling swivel")!;
  const underside = Math.min(...crossSection(design.parts[0], swivel.at[2]).map(([, y]) => y));
  const sunk = swivel.at[1] + swivel.size[1] / 2 - underside;
  expect(sunk).toBeGreaterThan(.001);
  expect(sunk).toBeLessThan(.006);
});

test.each(serviceRifles)("mounts the %s bayonet on its own muzzle", (weaponId) => {
  const design = weaponDesign({ weapon: "serviceRifle", weaponId })!;
  const { blade, guard } = bayonetMount(design.muzzle);
  // The guard sits just behind the crown, not part-way down a longer barrel.
  expect(guard.at[2] - design.muzzle).toBeGreaterThan(0);
  expect(guard.at[2] - design.muzzle).toBeLessThan(.04);
  // Its ring takes the barrel, and it reaches down past the blade's root.
  const barrel = crossSection(design.parts.find((part) => part.name === "barrel")!, guard.at[2]);
  const top = guard.at[1] + guard.size[1] / 2, bottom = guard.at[1] - guard.size[1] / 2;
  expect(top).toBeGreaterThan(Math.max(...barrel.map(([, y]) => y)));
  // The blade's root ends inside the guard, so its blunt end never shows.
  expect(Math.abs(blade.at[2] + blade.size[1] / 2 - guard.at[2])).toBeLessThan(guard.size[2] / 2);
  const root = crossSection({ name: "bayonet blade", shape: "stock", ...blade, tint: "steel", rotation: [90, 0, 0] }, guard.at[2] - guard.size[2] / 2);
  expect(root.length).toBeGreaterThan(0);
  expect(bottom).toBeLessThan(Math.min(...root.map(([, y]) => y)));
  // The blade rides directly under the barrel instead of hanging well below it.
  expect(Math.min(...barrel.map(([, y]) => y)) - Math.max(...root.map(([, y]) => y))).toBeLessThan(.02);
  expect(guard.size[1]).toBeLessThan(.09);
  // No crossbar standing out to either side of the rifle.
  expect(guard.size[0] / 2).toBeLessThan(Math.max(...barrel.map(([x]) => x)) + .005);
  expect(guard.size[0] / 2).toBeGreaterThanOrEqual(Math.max(...root.map(([x]) => Math.abs(x))));
});

test("closes the Berthier nose ferrule over the tip of its stock", () => {
  const design = weaponDesign({ weapon: "serviceRifle", weaponId: "Berthier Mle 1916" })!;
  const stock = design.parts[0], ferrule = design.parts.find((part) => part.name === "Berthier long nose ferrule")!;
  const tip = stock.at[2] - stock.size[1] / 2, rear = ferrule.at[2] + ferrule.size[1] / 2;
  expect(rear - tip).toBeGreaterThan(.005);
  // Just inside the ferrule's rear face, the wood is wholly within the steel.
  const z = rear - .002, steel = crossSection(ferrule, z), wood = crossSection(stock, z);
  const ys = steel.map(([, y]) => y), a = Math.max(...steel.map(([x]) => x)), y = (Math.min(...ys) + Math.max(...ys)) / 2, b = (Math.max(...ys) - Math.min(...ys)) / 2;
  expect(wood.length).toBeGreaterThan(0);
  for (const [wx, wy] of wood) expect((wx / a) ** 2 + ((wy - y) / b) ** 2).toBeLessThan(1);
});

test.each([["Karabiner 98AZ", "Gewehr 98"], ["Berthier Mle 1892 M16", "Berthier Mle 1916"]])("builds the %s as a shortened %s", (carbineId, rifleId) => {
  const carbine = weaponDesign({ weapon: "serviceRifle", weaponId: carbineId })!, rifle = weaponDesign({ weapon: "serviceRifle", weaponId: rifleId })!;
  expect(carbine.kind).toBe("serviceRifle");
  // 18 cm off the barrel; the muzzle anchor used for shots and flashes follows.
  expect(carbine.muzzle - rifle.muzzle).toBeCloseTo(.18, 6);
  expect(barrelEnd("serviceRifle", carbineId)).toBe(carbine.muzzle);
  const barrel = carbine.parts.find((part) => part.name === "barrel")!;
  expect(barrel.at[2] - barrel.size[1] / 2).toBeCloseTo(carbine.muzzle, 6);
  // Same butt, action and sights, so hands and aiming are unchanged.
  for (const name of ["wooden stock", "receiver", "open trigger guard", "buttplate"]) {
    expect(carbine.parts.find((part) => part.name === name)).toEqual(rifle.parts.find((part) => part.name === name));
  }
  expect(carbine.rear).toBe(rifle.rear);
  expect(carbine.grip).toEqual(rifle.grip);
  // Nothing is left hanging out past the shorter muzzle.
  expect(carbine.parts.some((part) => part.name === "cleaning rod")).toBe(false);
  for (const part of [...carbine.parts, ...(carbine.viewParts ?? [])]) {
    const front = part.at[2] - (part.rotation?.[0] === 90 ? part.size[1] : part.size[2]) / 2;
    expect(front, part.name).toBeGreaterThanOrEqual(carbine.muzzle - 1e-9);
  }
  // The front sight stands behind the crown.
  expect(carbine.front).toBeGreaterThan(carbine.muzzle);
});
