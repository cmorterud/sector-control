import { expect, it } from "vitest";
import { Game, TestCollision, idle, botCommand } from "./simulation";
import { industrialMap, walkSegment, dist } from "./map";
import { reactToThreat, reactionCoverCommand, braceCommand, combatReactionPose } from "./combat-reaction";
import { suppressNearMiss } from "./suppression";
import { artilleryExplosionProfile } from "./destruction";
import { PlaytestLog } from "./playtest";

function scene(withCover = false) {
  const map = {...industrialMap, boxes: withCover
    ? [{x:2,z:2,w:.4,d:2,h:2,kind:"wood" as const}] : []};
  const g = new Game(new TestCollision(map), true, 3000, 12345, undefined, {map,teamSize:1,assaults:false,ambientArtillery:false});
  g.artillery.enabled = false;
  const p = g.players[1];
  Object.assign(p,{x:0,z:0,y:0,protectedUntil:0,nextThink:1e9});
  Object.assign(g.players[0],{x:20,z:0,y:0,protectedUntil:0});
  g.tick=100;
  return {g,p};
}
const from = {x:6,y:1.3,z:0};

it("reacts to actual close passes once per cooldown, ignores friendly/covered passes and keeps the shooter unrecognized",()=>{
  const {g,p}=scene();
  const shot={id:1,actor:0,team:"blue" as const,x:3,y:1.5,z:.6,vx:-192,vy:0,vz:0,remaining:50,bornAt:99};
  suppressNearMiss(g,p,shot,{x:3,y:1.5,z:.6},{x:-3,y:1.5,z:.6});
  expect(p.combatReaction?.kind).toBe("nearMiss");expect(p.target).toBe(-1);
  expect(p.awareness.observed).toBeNull();
  const braceUntil=p.combatReaction!.braceUntil;
  for(let tick=101;tick<112;tick++) {g.tick=tick;suppressNearMiss(g,p,{...shot,id:tick},{x:3,y:1.5,z:.6},{x:-3,y:1.5,z:.6});}
  expect(p.combatReaction!.braceUntil).toBe(braceUntil);
  expect(g.events.filter(e=>e.type==="combatReaction")).toHaveLength(1);
  g.respawn(p);p.protectedUntil=0;g.collision.ray=()=>0;
  suppressNearMiss(g,p,{...shot,id:200},{x:3,y:1.5,z:.6},{x:-3,y:1.5,z:.6});
  expect(p.combatReaction).toBeNull();
  g.collision.ray=()=>1;
  suppressNearMiss(g,p,{...shot,id:201,team:p.team},{x:3,y:1.5,z:.6},{x:-3,y:1.5,z:.6});
  expect(p.combatReaction).toBeNull();
});

it("moves toward reachable side cover, arrives crouched, then resumes instead of remaining pinned",()=>{
  const {g,p}=scene(true);
  reactToThreat(g,p,from,"hit",.95);g.tick=105;
  const c=reactionCoverCommand(g,p)!;
  expect(c.crouch).toBe(true);expect(c.fire).toBe(false);
  const goal={...p.combatCover!.goal};
  expect(walkSegment(p,goal,g.map)).toBe(true);
  expect(dist(p,goal)).toBeLessThanOrEqual(3.01);
  const log=new PlaytestLog();let arrived=false,resumed=false;
  for(let i=0;i<100;i++) {
    g.step(idle());
    arrived ||= g.events.some(e=>e.type==="reactionCover"&&e.phase==="arrived");
    resumed ||= g.events.some(e=>e.type==="reactionCover"&&e.phase==="resume");
    log.recordTick(g,idle(),i/30);
  }
  expect(arrived).toBe(true);expect(resumed).toBe(true);
  expect(p.combatCover).toBeNull();expect(log.summary().reactionCoverArrivals).toBe(1);
  expect(p.hp).toBe(100);
});

it("upgrades an actual projectile pass into a hit reaction without changing damage or spending extra ammunition",()=>{
  const {g,p}=scene();g.botSettings.engagementRange=0;
  const shooter=g.players[0];shooter.x=3;shooter.z=0;
  const ammo=shooter.ammo;
  g.step({...idle(),yaw:-Math.PI/2,aim:true,firstPerson:true,fire:true});
  for(let i=0;i<3;i++)g.step(idle());
  expect(p.hp).toBe(75);expect(p.combatReaction?.kind).toBe("hit");
  expect(shooter.ammo).toBe(ammo-1);expect(p.target).toBe(-1);
});

it("abandons newly destroyed shelter and never invents cover on an exposed field",()=>{
  const {g,p}=scene(true);reactToThreat(g,p,from,"hit",.95);g.tick=105;
  reactionCoverCommand(g,p);expect(p.combatCover).toBeTruthy();
  g.map.boxes=[];g.map.destruction!.revision++;g.tick++;
  expect(reactionCoverCommand(g,p)).toBeNull();expect(p.combatCover).toBeNull();
  const open=scene();reactToThreat(open.g,open.p,from,"hit",.95);open.g.tick=105;
  expect(reactionCoverCommand(open.g,open.p)).toBeNull();expect(open.p.combatCover).toBeNull();
});

it("rechecks a shelter route when a new physical cue arrives from the opposite side",()=>{
  const {g,p}=scene(true);reactToThreat(g,p,from,"hit",.95);g.tick=105;
  reactionCoverCommand(g,p);expect(p.combatCover).toBeTruthy();
  g.tick=135;reactToThreat(g,p,{x:-6,y:1.3,z:0},"hit",.95);
  expect(p.combatCover!.revision).toBe(-1);
  expect(reactionCoverCommand(g,p)).toBeNull();expect(p.combatCover).toBeNull();
});

it("leaves recovery gaps under continuous fire and never consumes trigger plans during the brief flinch",()=>{
  const {g,p}=scene();let braced=0,free=0;
  for(let tick=100;tick<240;tick++) {
    g.tick=tick;reactToThreat(g,p,from,"nearMiss",.7);
    const c=braceCommand(g,p,{...idle(),fire:true,sprint:true});
    if(c.crouch)braced++;else free++;
    if(g.tick<p.combatReaction!.pauseUntil)expect(c.fire).toBe(false);
  }
  expect(braced).toBeGreaterThan(30);expect(free).toBeGreaterThan(30);
  g.tick=p.combatReaction!.tick+1;
  p.target=0;p.focusUntil=1e9;p.spottedAt=0;
  Object.assign(g.players[0],{x:0,z:-8});
  p.awareness.observed={x:0,y:1.6,z:-8};p.awareness.seenAt=g.tick;
  p.awareness.confidence=1;p.awareness.visible=true;p.awareness.nextLook=1e9;p.awareness.nextTrigger=0;
  const before=p.awareness.stringShots;
  expect(botCommand(g,p).fire).toBe(false);
  expect(p.awareness.stringShots).toBe(before);
  g.tick=p.combatReaction!.pauseUntil+1;
  expect(botCommand(g,p).fire).toBe(true);
  expect(p.awareness.stringShots).toBe(before+1);
});

it("reacts only after a blast lands, softens the response behind earth and ignores protected spawns",()=>{
  const run=(covered:boolean,protectedSpawn=false)=>{
    const {g,p}=scene();p.x=2;g.collision.ray=()=>covered?0:1;
    if(protectedSpawn)p.protectedUntil=200;
    g.explode({x:0,y:1,z:0},0,"blue",{...artilleryExplosionProfile,damage:0,structuralDamage:0,craterRadius:0,craterDepth:0});
    return p;
  };
  const exposed=run(false),sheltered=run(true);
  expect(exposed.combatReaction?.kind).toBe("blast");
  expect(sheltered.combatReaction!.strength).toBeCloseTo(exposed.combatReaction!.strength*.3);
  expect(exposed.hp).toBe(100);expect(sheltered.hp).toBe(100);
  expect(run(false,true).combatReaction).toBeNull();
});

it("keeps human input and sight direction under player control and isolates/reset reaction snapshots",()=>{
  const {g}=scene(),p=g.players[0];
  reactToThreat(g,p,from,"hit",.95);
  const snapshot=g.snapshot();snapshot.players[0].combatReaction!.from.x=999;
  expect(p.combatReaction!.from.x).toBe(6);
  g.step({...idle(),x:.5,yaw:.6,pitch:.2,fire:true});
  expect(p.command.crouch).not.toBe(true);expect(p.command.fire).toBe(true);
  expect(p.yaw).toBe(.6);expect(p.pitch).toBe(.2);expect(p.combatCover).toBeNull();
  expect(g.events.some(e=>e.type==="fire"&&e.actor===0)).toBe(true);
  expect(combatReactionPose(p,p.combatReaction!.tick+3).brace).toBeGreaterThan(.3);
  expect(combatReactionPose(p,p.combatReaction!.tick+30).brace).toBe(0);
  g.respawn(p);expect(p.combatReaction).toBeNull();expect(p.combatCover).toBeNull();
});
