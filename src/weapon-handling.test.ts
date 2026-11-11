import {test,expect} from "vitest";
import {Game,TestCollision,idle} from "./simulation";
import {trenchMap} from "./trench-map";
import {switchWeapon,equipLoadout} from "./loadouts";
import {switchPose,visualWeapon} from "./weapon-handling";
import {mechanicalVoice,shotVoice} from "./weapon-sound";
const scene=()=>new Game(new TestCollision(trenchMap),false,3000,5,undefined,{map:trenchMap,ambientArtillery:false});
test("switching lowers the old gun, replaces it out of view and raises the new gun within the existing readiness lock",()=>{
 const g=scene(),p=g.players[0];switchWeapon(p,"sidearm",10);
 expect(visualWeapon(p,11).weapon).toBe("serviceRifle");expect(visualWeapon(p,14).weapon).toBe("pistol");
 expect(switchPose(p,13.999).lower).toBeCloseTo(1,5);expect(switchPose(p,14).lower).toBe(1);
 expect(switchPose(p,19).active).toBe(false);expect(p.nextShot).toBe(19);
 const before=switchPose(p,12).lower;switchWeapon(p,"primary",12);
 expect(switchPose(p,12).lower).toBe(before);expect(visualWeapon(p,12).weapon).toBe("serviceRifle");
});
test("queued reload during drawing gets a full loading cycle, with no early ammo or burst and mechanical events at their real phases",()=>{
 const g=scene(),p=g.players[0];p.inventory!.sidearm.ammo=2;
 g.step({...idle(),equip:"sidearm"});g.step({...idle(),reload:true});
 expect(p.reloadAt).toBe(46);const actions:string[]=[];
 for(let i=0;i<43;i++){g.step({...idle(),fire:true});for(const e of g.events)if(e.type==="weaponAction")actions.push(e.action);}
 expect(p.ammo).toBe(2);g.step(idle());expect(p.ammo).toBe(8);expect(actions).toEqual(["draw","cylinderOpen","cartridges","cylinderClose"]);
});
test("support magazines and sidearm actions have distinct mechanical cues and bounded weapon-specific reports",()=>{
 expect(mechanicalVoice("bolt","cylinderClose","Webley Mk VI").frequency).toBeLessThan(mechanicalVoice("bolt","rack","Ruby").frequency);
 expect(mechanicalVoice("equip","holster").volume).toBeLessThan(mechanicalVoice("magazine","magazineIn").volume);
 expect(shotVoice("Lewis Mk I")).not.toBe(shotVoice("Chauchat"));
 const g=scene(),p=g.players[0];equipLoadout(p,"support");p.ammo=2;g.step({...idle(),reload:true});
 const actions:string[]=[];for(let i=0;i<45;i++){g.step(idle());for(const e of g.events)if(e.type==="weaponAction")actions.push(e.action);}
 expect(actions).toEqual(["magazineOut","magazineIn","rack"]);
});
