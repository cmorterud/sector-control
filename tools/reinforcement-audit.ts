// Offline audit of the final-phase reinforcement rule. Bundle with esbuild for Node:
//   npx esbuild tools/reinforcement-audit.ts --bundle --platform=node --format=esm --outfile=<out>.mjs
//   node <out>.mjs <map> <seed> [durationSeconds]
// Every soldier, the player slot included, is a bot.
import {Game,TestCollision,botCommand,idle} from '../src/simulation';
import {trenchMap} from '../src/trench-map';
import {nightRaidMap} from '../src/night-map';
import {verdunMap} from '../src/verdun-map';
import {villageMap} from '../src/village-map';
import {headlandMap} from '../src/headland-map';
import {fortVauxMap} from '../src/fort-vaux-map';
import {zeppelinMap} from '../src/zeppelin-map';
const maps={trenches:trenchMap,'night-raid':nightRaidMap,verdun:verdunMap,village:villageMap,headland:headlandMap,'fort-vaux':fortVauxMap,zeppelin:zeppelinMap};
const [id='trenches',seedText='12345',secondsText='480']=process.argv.slice(2);
const map=maps[id as keyof typeof maps];
if(!map)throw Error(`Unknown map ${id}; one of ${Object.keys(maps).join(', ')}`);
const seed=Number(seedText),duration=Number(secondsText)*30;
const g=new Game(new TestCollision(map),true,duration,seed,undefined,{map,humanPlayerIds:[]});
const started=Date.now();
const deaths={blue:0,red:0},finalDeaths={blue:0,red:0};
let finalAt:number|null=null;const emptyAt:Record<string,number>={};
while(g.phase==='playing'){
 g.step(g.players[0].hp>0?botCommand(g,g.players[0]):idle());
 const r=g.reinforcements;
 if(finalAt===null&&r.finalAt!==null)finalAt=r.finalAt;
 for(const team of ['blue','red'] as const)if(r.finalAt!==null&&r.remaining[team]===0&&emptyAt[team]===undefined)emptyAt[team]=g.tick;
 for(const e of g.events)if(e.type==='death'){const t=g.players[e.actor].team;deaths[t]++;if(finalAt!==null)finalDeaths[t]++;}
}
const living={blue:0,red:0};for(const p of g.players)if(p.hp>0)living[p.team]++;
console.log(JSON.stringify({map:id,seed,teamSize:g.teamSize,ticks:g.tick,seconds:(Date.now()-started)/1000,scores:g.scores,winner:g.winner,eliminated:g.reinforcements.eliminated,trigger:g.reinforcements.trigger,
 deaths,finalAt,finalDeaths,pool:g.reinforcements.pool,remaining:g.reinforcements.remaining,emptyAt,living}));
