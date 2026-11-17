import {expect,it} from "vitest";
import {Game,TestCollision,idle} from "./simulation";
import {villageMap} from "./village-map";
import {trainingMap} from "./training-map";
import {bodyBlocked,supportHeight} from "./map";
import {artilleryExplosionProfile} from "./destruction";
// The training map's demolition house keeps the older generator's long straight flights.
const scene=()=>new Game(new TestCollision(trainingMap),false,6000,12345,undefined,{map:trainingMap,ambientArtillery:false});
it("falls across broken stair treads without snapping to the floor or entering a surviving stair",()=>{
 const g=scene(),p=g.players[0];
 const tread=g.map.boxes.find(b=>b.id==="village-demolition-house-stair-1-9")!;
 g.explode({x:tread.x-tread.w/2-.1,y:tread.baseY!+tread.h-.1,z:tread.z},-1,null,
  {...artilleryExplosionProfile,damage:0,structuralRadius:.4,structuralDamage:2000,craterRadius:0,craterDepth:0,terrainReach:0});
 expect(g.map.boxes.some(b=>b.id===tread.id)).toBe(false);
 const standing=g.map.boxes.find(b=>b.id==="village-demolition-house-stair-1-12")!;
 Object.assign(p,{x:standing.x,z:standing.z,y:supportHeight(standing.x,standing.z,g.map,standing.baseY!+standing.h+.23,.45),vx:0,vz:0,protectedUntil:Infinity});
 let fell=false,maxDrop=0;
 for(let i=0;i<85;i++) {
  const old=p.y;g.step({...idle(),z:-1});maxDrop=Math.max(maxDrop,old-p.y);
  fell ||= !!p.fall;
 }
 expect(fell).toBe(true);expect(maxDrop).toBeLessThan(.36);
 expect(p.y).toBeLessThan(.6);expect(bodyBlocked(p.x,p.z,p.y,.4,g.map)).toBe(false);
 const oldX=p.x;
 for(let i=0;i<20;i++)g.step({...idle(),x:1});
 expect(p.x).toBeGreaterThan(oldX+1);
});
it("keeps a hop airborne over a damaged staircase and leaves a traversable landing",()=>{
 const g=scene(),p=g.players[0];
 const tread=g.map.boxes.find(b=>b.id==="village-demolition-house-stair-1-9")!;
 g.explode({x:tread.x-tread.w/2-.1,y:tread.baseY!+tread.h-.1,z:tread.z},-1,null,
  {...artilleryExplosionProfile,damage:0,structuralRadius:.4,structuralDamage:2000,craterRadius:0,craterDepth:0,terrainReach:0});
 expect(g.map.boxes.some(b=>b.id===tread.id)).toBe(false);
 const standing=g.map.boxes.find(b=>b.id==="village-demolition-house-stair-1-6")!;
 Object.assign(p,{x:standing.x,z:standing.z,y:supportHeight(standing.x,standing.z,g.map,standing.baseY!+standing.h+.23,.45),vx:0,vz:0,protectedUntil:Infinity});
 g.step({...idle(),x:1,mantle:true});
 let maxDrop=0;
 for(let i=0;i<80;i++){const old=p.y;g.step({...idle(),x:1});maxDrop=Math.max(maxDrop,old-p.y);}
 expect(maxDrop).toBeLessThan(.4);
 expect(p.fall).toBeNull();expect(p.hop).toBeNull();
 expect(p.y).toBeCloseTo(supportHeight(p.x,p.z,g.map,p.y+.23,.45));
 expect(bodyBlocked(p.x,p.z,p.y,.4,g.map)).toBe(false);
 // The destroyed treads form a real gap ahead; retreat remains clear.
 const oldZ=p.z;for(let i=0;i<25;i++)g.step({...idle(),z:-1});
 expect(p.z).toBeLessThan(oldZ-1);
});
it("vaults a low brick garden wall and rejects tall walls or a blocked landing",()=>{
 const base={...villageMap,boxes:[{id:"wall",x:0,z:0,w:.45,d:8,h:1.05,baseY:2.4,kind:"masonry" as const}],vegetation:[]};
 const g=new Game(new TestCollision(base),false,6000,1,undefined,{map:base,ambientArtillery:false}),p=g.players[0];
 Object.assign(p,{x:-.95,z:0,y:2.4,vx:0,vz:0,protectedUntil:Infinity});
 g.step({...idle(),x:1,yaw:Math.PI/2,mantle:true});
 expect(p.mantle?.vault).toBe(true);
 while(p.mantle)g.step(idle());
 expect(p.x).toBeGreaterThan(.8);expect(p.y).toBeCloseTo(2.4);
 expect(bodyBlocked(p.x,p.z,p.y,.45,g.map)).toBe(false);
 const blocked={...base,boxes:[...base.boxes,{id:"ceiling",x:0,z:0,w:5,d:8,h:.3,baseY:4.5,kind:"wood" as const}]};
 const b=new Game(new TestCollision(blocked),false,300,1,undefined,{map:blocked,ambientArtillery:false});
 Object.assign(b.players[0],{x:-.95,z:0,y:2.4});b.step({...idle(),x:1,yaw:Math.PI/2,mantle:true});
 expect(b.players[0].mantle).toBeNull();
 const tall={...base,boxes:[{...base.boxes[0],h:3}]};
 const t=new Game(new TestCollision(tall),false,300,1,undefined,{map:tall,ambientArtillery:false});
 Object.assign(t.players[0],{x:-.95,z:0,y:2.4});t.step({...idle(),x:1,yaw:Math.PI/2,mantle:true});expect(t.players[0].mantle).toBeNull();
});
