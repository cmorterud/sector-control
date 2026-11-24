import {test,expect} from "vitest";
import {BattlePerformance} from "./battle-performance";
test("attributes a hitch to preceding inclusive CPU phases/events and discards pauses",()=>{
 let now=0;const p=new BattlePerformance(()=>now);p.enabled=true;p.frame(0,10,false);
 const outer=p.begin();now=5;const inner=p.begin();now=25;p.end("terrain",inner);now=30;p.end("simulation",outer);p.count("shells",2);
 p.frame(55,11,false);p.frame(10000,12,true);p.frame(20000,12,false);p.frame(20016,13,false);
 const r=p.summary();expect(r.frames.count).toBe(2);expect(r.frames.maxMs).toBe(55);
 expect(r.stages.terrain.totalMs).toBe(20);expect(r.stages.simulation.totalMs).toBe(30);
 expect(r.slowFrames).toEqual([{tick:10,frameMs:55,phases:{terrain:20,simulation:30},counts:{shells:2}}]);
});
test("bounds diagnostic history, never reads the clock when disabled, and resets fully",()=>{
 const p=new BattlePerformance(()=>{throw Error('disabled clock');});expect(p.begin()).toBeUndefined();p.end("ignored",undefined);p.frame(100,0,false);expect(p.summary().frames.count).toBe(0);
 p.enabled=true;p.frame(0,0,false);for(let i=1;i<=1000;i++){p.count("deaths");p.frame(i*40,i,false);}
 expect(p.summary().slowFrames).toHaveLength(60);expect(p.summary().frames.count).toBe(1000);
 const saved=p.summary();saved.slowFrames[0].counts.deaths=999;expect(p.summary().slowFrames[0].counts.deaths).toBe(1);
 p.reset();expect(p.summary().frames.count).toBe(0);expect(p.summary().slowFrames).toEqual([]);
});

test("summarises sampled gauges and ignores them while disabled", () => {
  const p = new BattlePerformance(() => 0);
  p.gauge("drawables", 500);
  expect(p.summary().gauges).toEqual({});
  p.enabled = true;
  for (const n of [400, 600, 500]) p.gauge("drawables", n);
  expect(p.summary().gauges).toEqual({ drawables: { samples: 3, average: 500, max: 600 } });
  p.reset();
  expect(p.summary().gauges).toEqual({});
});
