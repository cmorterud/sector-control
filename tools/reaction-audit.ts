// CPU-only seeded battle audit: continued fighting and bounded reaction states.
// This is simulation evidence, not a browser/GPU performance measurement.
import { Game, TestCollision, botCommand, idle, prepareNavigation } from '../src/simulation';
import {battlePerformance} from '../src/battle-performance';
import { verdunMap } from '../src/verdun-map';
const seconds=Number(process.argv[2] ?? 120),seed=Number(process.argv[3] ?? 12345);
const g=new Game(new TestCollision(verdunMap),true,seconds*30,seed,undefined,{map:verdunMap,humanPlayerIds:[]});
const kinds:Record<string,number>={},cover:Record<string,number>={},shotsPerMinute:number[]=[],captures:Record<string,number>={};
let peakMoving=0,peakBracing=0,deaths=0,shells=0,coverTicks=0,livingTicks=0;
const profile=process.argv.includes('--perf');
if(profile){prepareNavigation(g.map);battlePerformance.enabled=true;battlePerformance.reset();}
let peakNavigationChecksPerTick=0;
const start=performance.now();
for(let i=0;i<seconds*30;i++) {
  const checks=profile ? (battlePerformance.summary().counters.navigationChecks??0) : 0;
  g.step(g.players[0].hp>0?botCommand(g,g.players[0]):idle());
  if(profile)peakNavigationChecksPerTick=Math.max(peakNavigationChecksPerTick,(battlePerformance.summary().counters.navigationChecks??0)-checks);
  for(const e of g.events) {
    if(e.type==='combatReaction')kinds[e.kind]=(kinds[e.kind]??0)+1;
    if(e.type==='reactionCover')cover[e.phase]=(cover[e.phase]??0)+1;
    if(e.type==='fire')shotsPerMinute[Math.floor(i/1800)]=(shotsPerMinute[Math.floor(i/1800)]??0)+1;
    if(e.type==='capture')captures[e.sector]=(captures[e.sector]??0)+1;
    if(e.type==='death')deaths++;
    if(e.type==='artilleryImpact')shells++;
  }
  const live=g.players.filter(p=>p.hp>0);
  const moving=live.filter(p=>p.combatCover&&p.combatCover.arrivedAt===null).length;
  peakMoving=Math.max(peakMoving,moving);coverTicks+=moving;livingTicks+=live.length;
  peakBracing=Math.max(peakBracing,live.filter(p=>p.combatReaction&&g.tick<p.combatReaction.braceUntil).length);
}
console.log(JSON.stringify({seed,seconds,cpuMs:performance.now()-start,reactions:kinds,cover,peakMoving,peakBracing,
  fractionOfLivingTicksSeekingCover:coverTicks/livingTicks,shotsPerMinute,captures,deaths,shells,scores:g.scores,
  ...(profile?{peakNavigationChecksPerTick,performance:battlePerformance.summary()}:{}),
  finite:g.players.every(p=>[p.x,p.y,p.z,p.hp].every(Number.isFinite))},null,2));
