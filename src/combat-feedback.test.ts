import {expect,it} from "vitest";
import {CombatFeedback,deathCard} from "./combat-feedback";
import {combatRules} from "./combat-history";
import {soldierName} from "./soldier-names";
import {scoreboardTable} from "./scoreboard";
import {Game,TestCollision,idle,type Event} from "./simulation";
import {industrialMap} from "./map";
import {trenchMap} from "./trench-map";
import {fortVauxMap} from "./fort-vaux-map";

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
it("confirms only credited player kills and keeps a short team-colored feed", () => {
  const g = scene(), f = new CombatFeedback();
  const damage = (actor: number, source: number, team: "blue" | "red" | null) => {
    g.events = [];
    (g as any).damage(g.players[actor], 100, source, team);
    for (const event of g.events) f.event(g, event);
  };
  damage(5, 0, "blue");
  expect(f.killConfirmation(g)).toBe(`You killed ${soldierName(g.players[5], g.map)}`);
  expect(f.killFeed(g)).toContain('kill-feed-entry red');
  expect(f.killFeed(g)).toContain('<b class="blue">YOU</b>');
  damage(6, 0, "blue");
  expect(f.killConfirmation(g)).toContain(" + 1 more");
  const confirmation = f.killConfirmation(g);
  damage(2, 7, "red");
  damage(3, 3, "blue");
  damage(8, -1, null);
  expect(f.killConfirmation(g)).toBe(confirmation);
  expect(f.killFeed(g)).toContain('kill-feed-entry blue');
  expect(f.killFeed(g).match(/kill-feed-entry/g)).toHaveLength(4);
  const feed = f.killFeed(g);
  g.events = [];
  g.redeploy(0);
  for (const event of g.events) f.event(g, event);
  expect(f.killFeed(g)).toBe(feed);
  g.tick = 90;
  expect(f.killConfirmation(g)).toBe("");
  expect(f.killFeed(g)).toBe(feed);
  g.tick = 180;
  expect(f.killFeed(g)).toBe("");
  f.reset();
  expect(f.killFeed(g)).toBe("");
});
it("ranks each roster by personal points and shows K/D in every mode",()=>{
  for(const map of [industrialMap,trenchMap,{...industrialMap,scoring:"eliminations" as const}]) {
    const g=new Game(new TestCollision(map),true,6000,1,undefined,{map,ambientArtillery:false});
    Object.assign(g.players[0],{kills:3,assists:2,deaths:4,captures:1});
    Object.assign(g.players[1],{kills:1,captures:3});
    const html=scoreboardTable(g), canCapture=g.scoring!=="eliminations";
    const teammate=soldierName(g.players[1],map);
    expect(html).toContain('title="Assists">A');
    expect(html).toContain(`YOU</th><td>3</td><td>2</td><td>4</td>${canCapture?"<td>1</td>":""}<td>0.75</td><td class="personal-points">${canCapture?750:450}</td>`);
    expect(html).toContain(`<td>1.00</td><td class="personal-points">${canCapture?1000:100}</td>`);
    expect(html.includes('title="Captures">CAP')).toBe(canCapture);
    expect(html.includes("300 per capture")).toBe(canCapture);
    expect(html.indexOf(`>${teammate}</th>`) < html.indexOf(">YOU</th>")).toBe(canCapture);
    expect(g.scores).toEqual({ blue: 0, red: 0 });
  }
});
it("keeps names distinct at full roster size and consistent after respawning", () => {
  const g = new Game(new TestCollision(trenchMap), true, 6000, 1, undefined, { map: trenchMap, teamSize: 50 });
  const names = g.players.map((p) => soldierName(p, g.map));
  expect(names[0]).toBe("YOU");
  expect(new Set(names).size).toBe(100);
  expect(names[50]).toBe("F. Müller");
  const fort = new Game(new TestCollision(fortVauxMap), true, 6000, 1, undefined, { map: fortVauxMap, teamSize: 6 });
  const french = fort.players[1];
  expect(soldierName(french, fort.map)).toBe("P. Bernard");
  fort.respawn(french);
  expect(soldierName(french, fort.map)).toBe("P. Bernard");
});
