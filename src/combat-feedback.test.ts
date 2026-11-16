import {expect,it} from "vitest";
import {CombatFeedback,deathCard} from "./combat-feedback";
import {combatRules} from "./combat-history";
import {scoreboardTable} from "./scoreboard";
import {Game,TestCollision,idle,type Event} from "./simulation";
import {industrialMap} from "./map";
import {trenchMap} from "./trench-map";

const scene=()=>new Game(new TestCollision(industrialMap),true,6000,1,undefined,{map:industrialMap,teamSize:5,ambientArtillery:false});
const hit=(tick=0,from={x:10,y:1.65,z:8}):Extract<Event,{type:"damage"}>=>({type:"damage",actor:0,source:5,amount:25,at:{x:0,y:0,z:8},from,kind:"bullet",weapon:"AR-01",tick,id:tick+1});
const kill=(g:Game,f:CombatFeedback)=>{
  Object.assign(g.players[0],{x:0,y:0,z:8,protectedUntil:0});g.events=[];
  (g as any).damage(g.players[0],100,5,"red",{kind:"bullet",weapon:"AR-01",from:{x:10,y:1.65,z:8}});
  for(const e of g.events)f.event(g,e);
};
it("rotates an incoming hit with the player's view without following the attacker",()=>{
  const g=scene(),f=new CombatFeedback();f.event(g,hit());
  expect(f.html(g,0)).toContain(`rotate(${Math.PI/2}rad)`);
  expect(f.html(g,Math.PI/2)).toContain("rotate(0rad)");
  const before=f.html(g,0);g.players[5].x=100;g.players[5].z=-100;expect(f.html(g,0)).toBe(before);
  g.tick=combatRules.indicatorTicks;expect(f.html(g,0)).not.toContain("damage-bearing");
});
it("merges repeated hits, bounds simultaneous directions and ignores unknown/zero damage",()=>{
  const g=scene(),f=new CombatFeedback();
  for(let i=0;i<80;i++)f.event(g,hit());
  expect(f.html(g,0).match(/class="damage-bearing"/g)).toHaveLength(1);
  for(let i=0;i<16;i++){const a=i*Math.PI/8;f.event(g,hit(0,{x:Math.sin(a)*20,y:1,z:8-Math.cos(a)*20}));}
  expect(f.html(g,0).match(/class="damage-bearing"/g)!.length).toBeLessThanOrEqual(8);
  f.reset();f.event(g,{...hit(),from:undefined});f.event(g,{...hit(),amount:0});
  expect(f.html(g,0)).not.toContain("damage-bearing");
});
it("briefly looks toward a frozen attack point and ends immediately at respawn",()=>{
  const g=scene(),f=new CombatFeedback();kill(g,f);
  const view=f.camera(g,20,{yaw:0,pitch:0})!;expect(view.yaw).toBeCloseTo(Math.PI/2);expect(view.zoom).toBe(1);
  g.players[5].x=-100;expect(f.camera(g,30,{yaw:0,pitch:0})).toEqual(view);
  expect(f.camera(g,combatRules.killerViewTicks,{yaw:0,pitch:0})).toBeNull();
  g.respawn(g.players[0]);expect(f.camera(g,20,{yaw:0,pitch:0})).toBeNull();
});
it("keeps the death view wide behind cover and never zooms at voluntary redeploy",()=>{
  const g=scene(),f=new CombatFeedback();g.collision.ray=()=>.4;kill(g,f);
  expect(f.camera(g,20,{yaw:0,pitch:0})?.zoom).toBe(0);
  g.respawn(g.players[0]);g.redeploy();expect(f.camera(g,g.tick+20,{yaw:0,pitch:0})).toBeNull();
});
it("retains only your death position for six seconds after respawn and resets between matches",()=>{
  const g=scene(),f=new CombatFeedback();kill(g,f);const at={x:0,y:0,z:8};
  expect(f.marker(g)).toEqual(at);g.tick=150;g.events=[];g.respawn(g.players[0]);for(const e of g.events)f.event(g,e);
  g.players[5].x=-100;g.players[0].x=100;expect(f.marker(g)).toEqual(at);
  g.tick+=combatRules.deathMarkerTicks-1;expect(f.marker(g)).toEqual(at);
  g.tick++;expect(f.marker(g)).toBeUndefined();f.reset();expect(f.marker(g)).toBeUndefined();
});
it("shows the cause, distance, actual damage/hits and bounded assist notices",()=>{
  const g=scene(),f=new CombatFeedback();kill(g,f);
  const html=f.html(g,0);expect(html).toContain("KILLED BY");expect(html).toContain("AR-01");expect(html).toContain("DISTANCE 10 m");
  expect(html).toContain("100 damage · 1 hit");expect(html).not.toContain("damage-bearing");
  for(let n=0;n<10;n++)f.event(g,{type:"assist",id:n,tick:0,actor:0,target:5,damage:25});
  expect(f.html(g,0).match(/class="assist-notice"/g)).toHaveLength(3);
  g.tick=90;expect(f.html(g,0)).not.toContain("assist-notice");
  expect(deathCard({...g.players[0].lastDeath!,weapon:'<img src="x">'},4)).toContain("&lt;img");
});
it("includes assists in small, large and elimination scoreboards without changing the objective columns",()=>{
  for(const map of [industrialMap,trenchMap,{...industrialMap,scoring:"eliminations" as const}]) {
    const g=new Game(new TestCollision(map),true,6000,1,undefined,{map,ambientArtillery:false});
    Object.assign(g.players[0],{kills:3,assists:2,deaths:4,captures:1});const html=scoreboardTable(g);
    expect(html).toContain('title="Assists">A');expect(html).toContain("YOU</span><span>3</span><span>2</span><span>4</span>");
    expect(html.includes("<span>CAP</span>")).toBe(g.scoring!=="eliminations");
    expect(html.includes('class="rosters"')).toBe(g.teamSize>8);
  }
});
