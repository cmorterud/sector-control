import {test,expect} from "vitest";
import {Game,idle} from "./simulation";
import {industrialMap} from "./map";
import {auditArtilleryCall} from "./artillery-audit";
import {artilleryExplosionProfile} from "./destruction";
test("artillery audit counts repeat flag calls and actual cover prevention without changing damage rules",()=>{
 const g=new Game({ray:()=>0,move:p=>p},true,200,5,undefined,{map:{...industrialMap,boxes:[]},teamSize:1,ambientArtillery:false});
 const flag=g.sectors[0];auditArtilleryCall(g,"blue",flag);g.tick=900;auditArtilleryCall(g,"blue",flag);
 expect(g.artilleryAudit.repeatedFlagCalls).toBe(1);
 const p=g.players[0];Object.assign(p,{x:0,y:0,z:0,protectedUntil:0});g.players[1].hp=0;
 g.explode({x:0,y:.1,z:2},-1,null,{...artilleryExplosionProfile,craterRadius:0,terrainReach:0,structuralRadius:0});
 expect(p.hp).toBe(100);expect(g.artilleryAudit.coveredSoldiers).toBe(1);expect(g.artilleryAudit.damagePrevented).toBeGreaterThan(0);
 expect(g.snapshot().artilleryAudit).toEqual(g.artilleryAudit);
});
