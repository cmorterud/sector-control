// Seeded simulation audit; does not measure native rendering or GPU performance.
import { Game, TestCollision, botCommand, idle } from '../src/simulation';
import { flagOccupant } from '../src/domination';
import { verdunMap } from '../src/verdun-map';

const seconds=Number(process.argv[2] ?? 180),seed=Number(process.argv[3] ?? 12345);
const g=new Game(new TestCollision(verdunMap),true,seconds*30,seed,undefined,{map:verdunMap,humanPlayerIds:[]});
const relay=g.sectors.find(s=>s.id==='C')!;
const visitors={blue:new Set<number>(),red:new Set<number>()};
const captures:Record<string,number>={},relayCaptures:unknown[]=[],shotsPerMinute:number[]=[];
let deaths=0,shells=0,contestedTicks=0;
for(let i=0;i<seconds*30;i++) {
  g.step(g.players[0].hp>0?botCommand(g,g.players[0]):idle());
  const present={blue:0,red:0};
  for(const p of g.players)if(flagOccupant(g,p,relay)){visitors[p.team].add(p.id);present[p.team]++;}
  if(present.blue&&present.red)contestedTicks++;
  for(const e of g.events) {
    if(e.type==='fire')shotsPerMinute[Math.floor(i/1800)]=(shotsPerMinute[Math.floor(i/1800)]??0)+1;
    if(e.type==='capture'){
      captures[e.sector]=(captures[e.sector]??0)+1;
      if(e.sector==='C')relayCaptures.push({seconds:g.tick/30,event:e});
    }
    if(e.type==='death')deaths++;
    if(e.type==='artilleryImpact')shells++;
  }
}
const finite=g.players.every(p=>[p.x,p.y,p.z,p.hp].every(Number.isFinite));
const result={seed,seconds,players:g.players.length,shotsPerMinute,captures,relayCaptures,
  relayVisitors:{blue:visitors.blue.size,red:visitors.red.size},contestedSeconds:contestedTicks/30,deaths,shells,scores:g.scores,finite};
console.log(JSON.stringify(result,null,2));
if(!finite||!visitors.blue.size||!visitors.red.size||!relayCaptures.length||!shotsPerMinute[2])process.exitCode=1;
