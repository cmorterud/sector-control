import {Game,TestCollision,idle,pathfind} from "./simulation";
import {industrialMap} from "./map";
import {artilleryExplosionProfile} from "./destruction";
import {battlePerformance} from "./battle-performance";
import {test,expect} from "vitest";
import {NavigationEdges} from "./navigation-edges";
import {dist,type Vec} from "./map";
// Independent full rebuild with the original bucket/order rules.
function rebuild(nodes:Vec[],step:number,walk:(a:Vec,b:Vec)=>boolean){
 const buckets=new Map<string,number[]>();nodes.forEach((p,i)=>{const k=`${Math.floor(p.x/step)},${Math.floor(p.z/step)}`;buckets.set(k,[...(buckets.get(k)??[]),i]);});
 return nodes.map((a,i)=>{const out:number[]=[],cx=Math.floor(a.x/step),cz=Math.floor(a.z/step);for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)for(const j of buckets.get(`${x},${z}`)??[])if(j!==i&&dist(a,nodes[j])<=step*1.45&&walk(a,nodes[j]))out.push(j);return out;});
}
test("cached directed adjacency matches full rebuilds through local obstructions, new craters, removed nodes and reordered indices",()=>{
 const cache=new NavigationEdges();let nodes=Array.from({length:160},(_,i)=>({x:(i%16)*.8-6,z:Math.floor(i/16)*.8-4}));let obstacle=false,calls=0;
 const walk=(a:Vec,b:Vec)=>{calls++;return !(obstacle && Math.min(a.x,b.x)<.2 && Math.max(a.x,b.x)>-.2 && Math.min(a.z,b.z)<1 && Math.max(a.z,b.z)>-1);};
 const check=()=>{const result=cache.build(nodes,nodes.map(p=>`${p.x},${p.z}`),2,walk);expect(result).toEqual(rebuild(nodes,2,walk));};
 check();calls=0;cache.build(nodes,nodes.map(p=>`${p.x},${p.z}`),2,walk);expect(calls).toBe(0);
 obstacle=true;cache.invalidate({minX:-.2,maxX:.2,minZ:-1,maxZ:1});check();
 nodes.push({x:.15,z:.25},{x:-.75,z:.65});check();nodes=nodes.filter((_,i)=>i%13!==0);check();nodes.reverse();check();
 obstacle=false;cache.invalidate({minX:-.2,maxX:.2,minZ:-1,maxZ:1});check();cache.invalidate();check();
});

test("a cosmetic bullet hit preserves route checks pending a local explosion rebuild",()=>{
 const map={...industrialMap,width:40,depth:40,navSpacing:2,boxes:[{kind:'wood' as const,x:0,z:0,w:1,d:10,h:2},{kind:'tree' as const,x:8,z:8,w:1,d:1,h:5}]};
 const g=new Game(new TestCollision(map),false,600,12345,undefined,{map,ambientArtillery:false});
 battlePerformance.enabled=true;battlePerformance.reset();
 try {
  pathfind({x:-10,z:0},{x:10,z:0},g.map);
  const original=battlePerformance.summary().counters.navigationChecks;
  expect(original).toBeGreaterThan(100);
  g.explode({x:-14,y:.05,z:14},-1,null,{...artilleryExplosionProfile,damage:0});
  const p=g.players[0];Object.assign(p,{x:8,y:0,z:12,yaw:0,pitch:0,command:idle()});g.fire(p);
  let cosmetic=false;for(let i=0;i<5;i++){g.step(idle());cosmetic ||= g.events.some(e=>e.type==='destruction'&&e.change.geometry===false);}
  expect(cosmetic).toBe(true);pathfind({x:-10,z:0},{x:10,z:0},g.map);
  const extra=battlePerformance.summary().counters.navigationChecks-original;
  expect(extra).toBeLessThan(original/2);
 } finally {battlePerformance.enabled=false;battlePerformance.reset();}
});

test("incremental adjacency yields one new check at a time and preserves complete graph ordering",()=>{
 const nodes=Array.from({length:100},(_,i)=>({x:i%10,z:Math.floor(i/10)})),keys=nodes.map(p=>`${p.x},${p.z}`);
 const cache=new NavigationEdges();let calls=0;const first:Vec[]=[];
 const work=cache.slices(nodes,keys,2,(a,b)=>{calls++;if(first.length<1)first.push(a);return a.x!==4 || b.x!==5;},[{x:9,z:9}]);
 let result=work.next();expect(calls).toBe(1);expect(first[0].x).toBeGreaterThanOrEqual(4);
 while(!result.done){const before=calls;result=work.next();expect(calls-before).toBeLessThanOrEqual(1);}
 expect(result.value).toEqual(rebuild(nodes,2,(a,b)=>a.x!==4 || b.x!==5));
});
