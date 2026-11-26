// CPU-only seeded diagnostic: simulation cost per tick as team size grows.
// Usage: performance-scale <map> <ticks> <teamSize>[,<teamSize>...]
import {createHash} from 'node:crypto';
import {Game,TestCollision,botCommand,idle} from '../src/simulation';
import {trenchMap} from '../src/trench-map';
import {verdunMap} from '../src/verdun-map';
import {springOffensiveMap} from '../src/spring-offensive-map';
import {battlePerformance} from '../src/battle-performance';
const maps={trenches:trenchMap,verdun:verdunMap,'spring-offensive':springOffensiveMap} as const;
const map=maps[(process.argv[2]??'spring-offensive') as keyof typeof maps];
const ticks=Number(process.argv[3]??900);
const sizes=(process.argv[4]??'16,32,50,64').split(',').map(Number);
const out=[];
for(const teamSize of sizes){
 const g=new Game(new TestCollision(map),true,ticks+1,12345,undefined,{map,teamSize,humanPlayerIds:[]});
 battlePerformance.enabled=true;battlePerformance.reset();
 const times:number[]=[];const hash=createHash('sha256');
 for(let i=0;i<ticks;i++){const s=performance.now();g.step(g.players[0].hp>0?botCommand(g,g.players[0]):idle());times.push(performance.now()-s);hash.update(JSON.stringify(g.events));}
 hash.update(JSON.stringify(g.snapshot()));
 times.sort((a,b)=>a-b);const total=times.reduce((a,b)=>a+b,0);
 const stages=battlePerformance.summary().stages as Record<string,{totalMs:number,maxMs:number}>;
 out.push({teamSize,hash:hash.digest('hex').slice(0,16),soldiers:g.players.length,avgTickMs:+(total/ticks).toFixed(2),p95:+times[Math.ceil(ticks*.95)-1].toFixed(2),p99:+times[Math.ceil(ticks*.99)-1].toFixed(2),max:+times.at(-1)!.toFixed(1),
  perStageMsPerTick:Object.fromEntries(Object.entries(stages).map(([k,v])=>[k,+(v.totalMs/ticks).toFixed(3)]))});
}
console.log(JSON.stringify({map:map.id,ticks,results:out},null,1));
