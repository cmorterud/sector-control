// Simulation/route diagnostics only; does not submit browser frames.
import {writeFileSync} from "node:fs";
import {villageMap} from "../src/village-map";
import {Game,TestCollision,pathfind,idle} from "../src/simulation";
import {groundHeight} from "../src/map";
const label=process.argv[2]??"current",routes=[];
for(const team of ["blue","red"] as const)for(const flag of villageMap.sectors) {
 const g=new Game(new TestCollision(villageMap),false,6000,1,undefined,{map:villageMap,ambientArtillery:false}),p=g.players[0],start=villageMap.spawn[team];
 Object.assign(p,{...start,y:groundHeight(start.x,start.z,g.map),protectedUntil:Infinity});
 const path=pathfind(p,flag,g.map);let prior={...start},length=0,gap=0,longestGap=0,i=0;
 const solids=[...g.map.boxes,...(g.map.vegetation??[])].filter(b=>b.h>=.6&&(!b.architecture||b.architecture.part==='wall'&&b.architecture.level===0));
 for(const next of path){
  const d=Math.hypot(next.x-prior.x,next.z-prior.z),count=Math.max(1,Math.ceil(d));length+=d;
  for(let n=1;n<=count;n++) {
   const x=prior.x+(next.x-prior.x)*n/count,z=prior.z+(next.z-prior.z)*n/count;
   const cover=solids.some(b=>Math.hypot(Math.max(0,Math.abs(x-b.x)-b.w/2),Math.max(0,Math.abs(z-b.z)-b.d/2))<5.5);
   gap=cover?0:gap+d/count;longestGap=Math.max(longestGap,gap);
  }
  prior=next;
 }
 for(let tick=0;tick<2400&&i<path.length;tick++) {
  const next=path[i],dx=next.x-p.x,dz=next.z-p.z,d=Math.hypot(dx,dz);
  if(d<.45&&Math.abs(p.y-(next.y??groundHeight(next.x,next.z,g.map)))<.24){i++;continue;}
  g.step({...idle(),x:dx/Math.max(1,d),z:dz/Math.max(1,d),sprint:true});
 }
 routes.push({team,flag:flag.id,seconds:g.tick/30,length,longestGapWithoutNearbyCover:longestGap,reached:i===path.length});
}
if(routes.some(r=>!r.reached))throw Error('An actual soldier could not finish a flag route');
const report={label,routes,collisionObjects:villageMap.boxes.length,trees:villageMap.vegetation?.length,note:'Cover proximity is a route diagnostic, not a line-of-fire or visual quality measurement.'};
writeFileSync(`playtest-artifacts/village-outdoor-${label}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
