// CPU-only seeded diagnostic; does not measure browser/GPU performance.
import {createHash} from 'node:crypto';
import {Game,TestCollision,botCommand,idle} from '../src/simulation';
import {trenchMap} from '../src/trench-map';
import {verdunMap} from '../src/verdun-map';
import {battlePerformance} from '../src/battle-performance';
const map=process.argv[2]==='verdun'?verdunMap:trenchMap;
const ticks=Number(process.argv[3]??1800);
const g=new Game(new TestCollision(map),true,ticks+1,12345,undefined,{map,humanPlayerIds:[]});
battlePerformance.enabled=true;battlePerformance.reset();
const hash=createHash('sha256'),times:number[]=[];let deaths=0,shells=0;
for(let i=0;i<ticks;i++){
 const start=performance.now();g.step(g.players[0].hp>0?botCommand(g,g.players[0]):idle());times.push(performance.now()-start);
 hash.update(JSON.stringify(g.events));for(const e of g.events){if(e.type==='death')deaths++;if(e.type==='artilleryImpact')shells++;}
}
hash.update(JSON.stringify(g.snapshot()));times.sort((a,b)=>a-b);
console.log(JSON.stringify({map:map.id,ticks,deaths,shells,stateAndEvents:hash.digest('hex'),cpuTickMs:{total:times.reduce((a,b)=>a+b,0),p95:times[Math.ceil(times.length*.95)-1],p99:times[Math.ceil(times.length*.99)-1],max:times.at(-1)},profile:battlePerformance.summary()},null,2));
