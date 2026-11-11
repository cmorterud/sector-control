import {test,expect} from "vitest";
import {weaponDesign} from "./weapon-design";
import {barrelEnd} from "./player-view";
import {rifleGeometry} from "./rifle-geometry";
const ids=["SMLE Mk III","Gewehr 98","Berthier Mle 1916","Scoped Lebel","Lewis Mk I","MG 08/15","Chauchat","Webley Mk VI","P08","Ruby"];
test("historical models have separate furniture and feed systems, finite shared geometry and matching muzzle anchors",()=>{
 const signatures=new Set();
 for(const id of ids){
  const kind=id.includes("Mk I")&&id.startsWith("Lewis")||["MG 08/15","Chauchat"].includes(id)?"machineGun":["Webley Mk VI","P08","Ruby"].includes(id)?"pistol":"serviceRifle";
  const d=weaponDesign({weapon:kind,weaponId:id})!;expect(d,id).toBeDefined();
  signatures.add(JSON.stringify(d.parts));expect(barrelEnd(kind,id)).toBe(d.muzzle);
  for(const p of [...d.parts,...d.actionParts,d.magazine]){
   expect([...p.at,...p.size].every(Number.isFinite)).toBe(true);expect(p.size.every(v=>v>0)).toBe(true);
   expect(rifleGeometry(p.shape).indices.length).toBeGreaterThan(0);
  }
 }
 expect(signatures.size).toBe(10);
 expect(weaponDesign({weapon:"rifle",weaponId:"SMLE Mk III"})).toBeUndefined();
 expect(weaponDesign({weapon:"serviceRifle"})).toBeUndefined();
});
