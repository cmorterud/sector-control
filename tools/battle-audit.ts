// Offline simulation audit; run with esbuild's node bundle (see HANDOFF).
import {Game,TestCollision,botCommand,idle} from '../src/simulation';
import {trenchMap} from '../src/trench-map';
import {verdunMap} from '../src/verdun-map';
const reports=[];
for(const [seed,map] of [[12345,trenchMap],[6842,verdunMap],[91821,verdunMap]] as const) {
 const g=new Game(new TestCollision(map),true,480*30,seed,undefined,{map,humanPlayerIds:[]});
 let shots=0,deaths=0,captures=0,impacts=0;const started=Date.now();
 while(g.phase==='playing'){
  g.step(g.players[0].hp>0?botCommand(g,g.players[0]):idle());
  for(const e of g.events){if(e.type==='fire')shots++;if(e.type==='death')deaths++;if(e.type==='capture')captures++;if(e.type==='artilleryImpact')impacts++;}
  if(g.players.some(p=>!Number.isFinite(p.x+p.y+p.z+p.hp)))throw new Error('Nonfinite state');
 }
 const report={seed,map:map.id,ticks:g.tick,seconds:(Date.now()-started)/1000,scores:g.scores,winner:g.winner,shots,deaths,captures,impacts,artillery:g.artilleryAudit};reports.push(report);console.log(JSON.stringify(report));
}
console.log(JSON.stringify({reports}));
