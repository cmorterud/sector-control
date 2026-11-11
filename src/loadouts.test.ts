import { test, expect } from "vitest";
import { Game, TestCollision, idle } from "./simulation";
import { trenchMap } from "./trench-map";
import { equipLoadout, switchWeapon, scoped } from "./loadouts";
const make = () => new Game(new TestCollision(trenchMap), false, 3000, 5, undefined, {map:trenchMap, ambientArtillery:false});
test("weapon switching preserves ammo and bolt cooldown, cancels loading without free ammunition", () => {
 const g=make(), p=g.players[0]; p.ammo=2; p.reloadAt=20; p.nextShot=25;
 expect(switchWeapon(p,"sidearm",1)).toBe(true); expect(p.weapon).toBe("pistol"); expect(p.reloadAt).toBe(0);
 p.ammo=3; expect(switchWeapon(p,"primary",2)).toBe(true);
 expect(p.ammo).toBe(2); expect(p.reserve).toBe(60); expect(p.nextShot).toBe(25);
 expect(switchWeapon(p,"sidearm",3)).toBe(true); expect(p.ammo).toBe(3);
});
test("loadout selection waits for respawn and initializes faction equipment", () => {
 const g=make(), p=g.players[0]; g.step(idle()); g.selectLoadout(p,"support");
 expect(p.weapon).toBe("serviceRifle"); g.respawn(p); expect(p.weapon).toBe("machineGun"); expect(p.weaponId).toBe("Lewis Mk I");
 equipLoadout(p,"marksman"); expect(scoped(p)).toBe(true); switchWeapon(p,"sidearm",g.tick); expect(scoped(p)).toBe(false);
});
test("100-soldier roster has four supports, two marksmen and 44 riflemen per team", () => {
 const g = new Game(new TestCollision(trenchMap),true,100,5,undefined,{map:trenchMap,ambientArtillery:false});
 for(const team of ["blue","red"]) {
  const list=g.players.filter(p=>p.team===team);
  expect(list.filter(p=>p.loadout==="support")).toHaveLength(4);
  expect(list.filter(p=>p.loadout==="marksman")).toHaveLength(2);
  expect(list.filter(p=>p.loadout==="rifleman")).toHaveLength(44);
 }
});
test("human machine gun repeats held fire; pistol requires a new press",()=>{
 const g=make(),p=g.players[0]; equipLoadout(p,"support");
 for(let i=0;i<12;i++)g.step({...idle(),fire:true}); expect(p.ammo).toBe(56);
 switchWeapon(p,"sidearm",g.tick); for(let i=0;i<10;i++)g.step(idle());
 for(let i=0;i<30;i++)g.step({...idle(),fire:true}); expect(p.ammo).toBe(7);
});
test("marksman sights take half a second to settle and sidearm clears the scoped state",async()=>{
 const {sighted}=await import("./player-view");const g=make(),p=g.players[0];equipLoadout(p,"marksman");
 for(let i=0;i<15;i++)g.step({...idle(),aim:true,firstPerson:true});expect(sighted(p,g.tick)).toBe(false);
 g.step({...idle(),aim:true,firstPerson:true});expect(sighted(p,g.tick)).toBe(true);
 switchWeapon(p,"sidearm",g.tick);expect(scoped(p)).toBe(false);
});
