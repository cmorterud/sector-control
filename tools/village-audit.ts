// Simulation-only diagnostics, not a rendered/GPU frame-rate benchmark.
import {writeFileSync,readFileSync} from 'node:fs';
import {Game,TestCollision,botCommand,idle,pathfind} from '../src/simulation';
import {villageMap} from '../src/village-map';
import {groundHeight} from '../src/map';
import {artilleryExplosionProfile} from '../src/destruction';
import {kitWarningMaxTicks} from '../src/kit-collapse';
const destructionOnly=process.argv.includes('--destruction-only');
const g=new Game(new TestCollision(villageMap),true,120*30,12345,undefined,{map:villageMap,humanPlayerIds:[]});
let shots=0,deaths=0,captures=0,impacts=0;const upstairs=new Set<number>(),visits=new Set<string>(),began=performance.now();
while(!destructionOnly&&g.phase==='playing') {
  g.step(g.players[0].hp>0?botCommand(g,g.players[0]):idle());
  for(const p of g.players){
    if(!Number.isFinite(p.x+p.y+p.z+p.hp))throw Error('Nonfinite soldier state');
    if(p.hp>0&&p.y>5.65&&Math.abs(p.x)<15&&Math.abs(p.z)<13)upstairs.add(p.id);
    if(p.hp>0&&Math.abs(p.x)<60)visits.add(p.team);
  }
  for(const e of g.events){if(e.type==='fire')shots++;if(e.type==='death')deaths++;if(e.type==='capture')captures++;if(e.type==='artilleryImpact')impacts++;}
}
const battle=destructionOnly?JSON.parse(readFileSync('playtest-artifacts/village-redesign-audit.json','utf8')).battle:{simulationSeconds:g.tick/30,cpuSeconds:(performance.now()-began)/1000,shots,deaths,captures,impacts,scores:g.scores,teamsInVillage:[...visits],upstairsSoldiers:[...upstairs]};
if(!destructionOnly&&(shots<100||captures<2||visits.size!==2))throw Error('Battle did not progress');
const d=new Game(new TestCollision(villageMap),false,6000,1,undefined,{map:villageMap,ambientArtillery:false});
const initial=d.map.boxes.filter(b=>b.architecture?.building==='manor').length;
const manor=d.map.buildings!.find(building=>building.id==='manor')!.kit!;
const disallowedRemainders=()=>d.map.boxes.filter(b=>b.architecture?.building==='manor'&&
  !manor.survivors.includes(b.id!)&&!(b.architecture.part==='floor'&&!b.supports)&&!b.id!.includes('porch'));
// A failed house-kit part falls on a later simulation tick. The stone piers,
// ground slabs and standalone porch can remain after a structural collapse.
const settle=()=>{
  for(let i=0;i<kitWarningMaxTicks*2&&Object.keys(d.map.destruction?.failing??{}).length;i++)d.step(idle());
};
const strikes=[];const points=[[-10,-10],[10,-10],[-10,10],[10,10],[0,0],[-14,-4],[14,4]];
for(let n=0;n<35;n++) {
  const [x,z]=points[n%points.length],from={x,y:30,z},to={x,y:groundHeight(x,z,d.map)-.05,z};
  const fraction=d.collision.ray(from,to),at={x,y:from.y+(to.y-from.y)*fraction+.03,z};
  const start=performance.now();d.explode(at,-1,null,{...artilleryExplosionProfile,damage:0});
  const remaining=d.map.boxes.filter(b=>b.architecture?.building==='manor').length;
  strikes.push({n:n+1,atY:at.y,remaining,ms:performance.now()-start});
}
settle();
// Deliberately finish remaining ground-floor supports after the scattered
// vertical impacts, proving structural failure through real blast/occlusion rules.
for(let n=0;n<80 && disallowedRemainders().length;n++) {
  const object=Object.values(d.map.destruction!.objects).find(o=>o.stage!==2&&o.original.architecture?.building==='manor'&&o.original.architecture.bearing);
  if(!object)break;
  const b=object.original,alongX=b.w>b.d;
  const at={x:b.x+(alongX?0:-b.w/2-.12),y:(b.baseY??0)+.45,z:b.z+(alongX?-b.d/2-.12:0)};
  const start=performance.now();d.explode(at,-1,null,{...artilleryExplosionProfile,damage:0});
  strikes.push({n:strikes.length+1,atY:at.y,remaining:d.map.boxes.filter(b=>b.architecture?.building==='manor').length,ms:performance.now()-start});
  settle();
}
const standing=disallowedRemainders();
if(standing.length)throw Error(`Manor retained ${standing.length} structural parts after bearing support bombardment: ${standing.slice(0,4).map(b=>b.id).join(', ')}`);
let accessible=0;
for(const flag of d.sectors)if(pathfind(d.map.spawn.blue,flag,d.map).length)accessible++;
if(accessible!==5)throw Error('Collapse blocked an objective');
const report={battle,destruction:{initialManorParts:initial,finalManorParts:d.map.boxes.filter(b=>b.architecture?.building==='manor').length,finalBoxes:d.map.boxes.length,rubble:d.map.boxes.filter(b=>b.id?.startsWith('village-rubble-manor')).length,reachableFlags:accessible,strikes},initialBoxes:villageMap.boxes.length};
writeFileSync('playtest-artifacts/village-redesign-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
