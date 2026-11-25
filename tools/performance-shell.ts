// CPU cost of a shell landing on the tick it lands, without a browser/GPU.
// Seeded impact points on each map; the hash fingerprints every crater,
// cover change and resulting game state so optimisations can prove equality.
import {createHash} from 'node:crypto';
import {Game,TestCollision} from '../src/simulation';
import {groundHeight} from '../src/map';
import {artilleryExplosionProfile} from '../src/destruction';
import {battlePerformance} from '../src/battle-performance';
import {trenchMap} from '../src/trench-map';
import {verdunMap} from '../src/verdun-map';
import {villageMap} from '../src/village-map';
import {headlandMap} from '../src/headland-map';
import {fortVauxMap} from '../src/fort-vaux-map';
const maps={trenches:trenchMap,verdun:verdunMap,village:villageMap,headland:headlandMap,'fort-vaux':fortVauxMap};
const pick=process.argv[2];
const impacts=Number(process.argv[3]??40);
const report:Record<string,unknown>={};
for(const [id,source] of Object.entries(maps)){
 if(pick&&pick!=='all'&&pick!==id)continue;
 const g=new Game(new TestCollision(source),false,100000,12345,undefined,{map:source,ambientArtillery:false});
 let seed=7;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
 const hash=createHash('sha256'),times:number[]=[];
 battlePerformance.enabled=true;battlePerformance.reset();
 for(let i=0;i<impacts;i++){
  // Mostly inside the fighting area, with repeat hits clustering into old craters.
  const x=(rand()-.5)*source.width*.6,z=(rand()-.5)*source.depth*.5;
  const at={x,z,y:groundHeight(x,z,g.map)+.02};
  const start=performance.now();
  g.explode(at,-1,null,artilleryExplosionProfile);
  times.push(performance.now()-start);
  hash.update(JSON.stringify(g.events));g.events=[];
 }
 hash.update(JSON.stringify(g.map.destruction));hash.update(JSON.stringify(g.players.map(p=>[p.hp,p.x,p.z,p.path])));
 const stages=battlePerformance.summary().stages;
 const sorted=[...times].sort((a,b)=>a-b);
 report[id]={impacts,boxes:g.map.boxes.length,destructible:Object.keys(g.map.destruction!.objects).length,
  explodeMs:{average:times.reduce((a,b)=>a+b,0)/times.length,p95:sorted[Math.ceil(sorted.length*.95)-1],max:sorted.at(-1)},
  deformMs:stages.explosionDeform?.averageMs,applyMs:stages.explosionApply?.averageMs,fingerprint:hash.digest('hex')};
}
console.log(JSON.stringify(report,null,2));
