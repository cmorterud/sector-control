import {expect,it} from "vitest";
import {Game,TestCollision} from "./simulation";
import {industrialMap,type MapDefinition} from "./map";
import {artilleryExplosionProfile,grenadeExplosionProfile} from "./destruction";
const map:MapDefinition={...industrialMap,width:40,depth:40,spawn:{blue:{x:-10,z:0},red:{x:10,z:0}},sectors:[],boxes:[
 {id:"wall",x:0,z:0,w:4,d:.44,h:3,kind:"masonry",baseY:0,architecture:{building:"house",part:"wall",level:0,bearing:true}},
],buildings:[{id:"house",name:"House",x:0,z:0,w:8,d:8,stories:1,baseY:0,posts:[]}]};
const scene=()=>new Game(new TestCollision(map),false,6000,1,undefined,{map,ambientArtillery:false});
const blast={...artilleryExplosionProfile,craterRadius:0,craterDepth:0,terrainReach:0};
it("preserves walls through nearby artillery splash while contact hits breach them",()=>{
 const g=scene();
 Object.assign(g.players[0],{x:0,z:-5,y:0,protectedUntil:0});
 g.explode({x:0,y:1,z:-3},-1,null,blast);
 expect(g.map.destruction!.objects.wall.hp).toBeGreaterThan(125);
 expect(g.players[0].hp).toBe(0); // Soldier blast damage remains dangerous.
 g.explode({x:0,y:1,z:-3},-1,null,blast);
 expect(g.map.boxes.some(b=>b.id==="wall")).toBe(true);
 g.explode({x:0,y:1,z:-.25},-1,null,blast);
 expect(g.map.destruction!.objects.wall.stage).toBe(2);
 expect(g.map.boxes.some(b=>b.id==="wall")).toBe(false);
});
it("keeps grenade structural damage unchanged",()=>{
 const g=scene(),grenade={...grenadeExplosionProfile,damage:0,craterRadius:0,craterDepth:0,terrainReach:0};
 g.explode({x:0,y:1,z:-.25},-1,null,grenade);
 expect(g.map.destruction!.objects.wall.stage).toBe(1);
 g.explode({x:0,y:1,z:-.25},-1,null,grenade);
 expect(g.map.destruction!.objects.wall.stage).toBe(2);
});
