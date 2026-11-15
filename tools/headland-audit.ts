// Simulation-only route/battle evidence; not a browser or GPU benchmark.
import { writeFileSync } from "node:fs";
import { headlandMap } from "../src/headland-map";
import { Game, TestCollision, pathfind, botCommand, idle } from "../src/simulation";
import { groundHeight } from "../src/map";
import { coastalGeometry,coastalGrass } from "../src/coastal-scenery";
const label=process.argv[2]??"current",seconds=Number(process.argv[3]??120);
const routes=[];
for(const team of ["blue","red"] as const)for(const flag of headlandMap.sectors) {
  const g=new Game(new TestCollision(headlandMap),false,6000,12345,undefined,{map:headlandMap,ambientArtillery:false});
  const start=headlandMap.spawn[team],p=g.players[0],target={...flag,y:groundHeight(flag.x,flag.z,g.map)};
  Object.assign(p,{...start,y:groundHeight(start.x,start.z,g.map),protectedUntil:Infinity});
  const path=pathfind(p,target,g.map);let prior={...p},length=0;
  for(const next of path){length+=Math.hypot(prior.x-next.x,prior.z-next.z);prior={...prior,...next};}
  let i=0;
  for(let tick=0;tick<3600&&i<path.length;tick++) {
    const next=path[i],dx=next.x-p.x,dz=next.z-p.z,d=Math.hypot(dx,dz);
    if(d<.45&&Math.abs(p.y-(next.y??groundHeight(next.x,next.z,g.map)))<.24){i++;continue;}
    g.step({...idle(),x:dx/Math.max(1,d),z:dz/Math.max(1,d),sprint:true});
  }
  routes.push({team,flag:flag.id,length,seconds:g.tick/30,reached:i===path.length});
}
const battles=[];
for(const seed of [12345,27183,54321]) {
  const g=new Game(new TestCollision(headlandMap),true,seconds*30,seed,undefined,{map:headlandMap,humanPlayerIds:[],ambientArtillery:false});
  const firstAtB:Record<string,number>={},captures:Record<string,number>={};let shots=0,deaths=0;
  const b=g.sectors.find(s=>s.id==="B")!,began=performance.now();
  while(g.phase==="playing") {
    g.step(g.players[0].hp>0?botCommand(g,g.players[0]):idle());
    for(const p of g.players)if(p.hp>0&&Math.hypot(p.x-b.x,p.z-b.z)<7&&firstAtB[p.team]===undefined)firstAtB[p.team]=g.tick/30;
    for(const e of g.events){if(e.type==="fire")shots++;if(e.type==="death")deaths++;if(e.type==="capture")captures[e.sector]=(captures[e.sector]??0)+1;}
  }
  battles.push({seed,seconds:g.tick/30,cpuSeconds:(performance.now()-began)/1000,firstAtB,captures,shots,deaths,scores:g.scores});
}
if(routes.some(r=>!r.reached)||battles.some(b=>b.shots<100||b.deaths<5||b.firstAtB.blue===undefined||b.firstAtB.red===undefined))
  throw Error("Headland routes or battle did not progress");
const geometry=coastalGeometry(headlandMap);
const scenery={rockTriangles:geometry.rock.indices.length/3,foamTriangles:geometry.foam.indices.length/3,
  grassClumps:coastalGrass(headlandMap).length,streetProps:headlandMap.boxes.filter(b=>b.id?.startsWith("headland-street-")).length};
const report={label,routes,battles,scenery};
writeFileSync(`playtest-artifacts/headland-${label}-audit.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
