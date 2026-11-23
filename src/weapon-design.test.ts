import {test,expect} from "vitest";
import {weaponDesign} from "./weapon-design";
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
