import { describe, it, expect } from "vitest";
import {
  BattlefieldFeedback,
  duckboards,
  footSurface,
  intactBoard,
  type SoundCue,
} from "./battlefield";
import { Game, TestCollision, idle, type Event } from "./simulation";
import { trenchMap } from "./trench-map";
import { industrialMap } from "./map";
import { grenadeExplosionProfile } from "./destruction";
import { artilleryExplosionProfile } from "./destruction";
import { verdunMap } from "./verdun-map";
import { groundHeight } from "./map";
import { distantFlashes } from "./backdrop";
function scene(trench = true) {
  const g = new Game(
    new TestCollision(trench ? trenchMap : { ...industrialMap, boxes: [] }),
    false,
    5000,
    12345,
    undefined,
    { map: trench ? trenchMap : { ...industrialMap, boxes: [] } },
  );
  const cues: SoundCue[] = [];
  const feedback = new BattlefieldFeedback((c) => cues.push(c));
  feedback.reset(g);
  return { g, feedback, cues, p: g.players[0] };
}
const event = (e: object) => ({ tick: 0, id: 1, ...e }) as Event;
describe("battlefield presentation", () => {
  it("adds leaf steps only on intact forest floor, with irregular ambient cues that do not mutate the simulation",()=>{
    const g=new Game(new TestCollision(verdunMap),false,5000,12345,undefined,{map:verdunMap});
    const cues:SoundCue[]=[],f=new BattlefieldFeedback(c=>cues.push(c));
    let point:{x:number;z:number}|undefined;
    for(let x=-14;x<20&&!point;x++)for(let z=-14;z<20;z++)if(footSurface({x,z},g.map)==="leaves"){point={x,z};break;}
    expect(point).toBeDefined();
    expect(footSurface(point!,g.map)).toBe("leaves");
    Object.assign(g.players[0],{...point,y:groundHeight(point!.x,point!.z,g.map),protectedUntil:0});
    g.tick=450;f.reset(g);const snapshot=g.snapshot();f.step(g);
    expect(g.snapshot()).toEqual(snapshot);
    // Verdun's backdrop adds the battlefield ambience and times its distant
    // rumble to the bursts on its horizon, so the forest no longer adds its own.
    expect(cues.map(c=>c.kind)).toEqual(["forestWind","forestCreak","wireWind","distantGun"]);
    expect(cues.find(c=>c.kind==="forestWind")!.volume).toBeLessThan(.05);
    f.step(g);expect(cues).toHaveLength(4);
    g.explode({...point!,y:g.players[0].y+.03},-1,null,{...grenadeExplosionProfile,damage:0});
    expect(footSurface(point!,g.map)).toBe("mud");
    const plain=scene(false);plain.g.tick=500;plain.feedback.step(plain.g);
    expect(plain.cues).toHaveLength(0);
  });
  it("plays trench ambience: louder wind near the wire, distant guns, crows and bursts heard after their flash", () => {
    const listen = (x: number) => {
      const { g, feedback, cues, p } = scene();
      Object.assign(p, { x, z: 0, y: groundHeight(x, 0, trenchMap) });
      for (let t = 1; t <= 2400; t++) { g.tick = t; feedback.step(g); }
      return { cues, p, g };
    };
    const nearWire = listen(-78), middle = listen(0);
    const kinds = new Set(nearWire.cues.map((c) => c.kind));
    for (const kind of ["wireWind", "distantGun", "crow", "distantBattle"] as const) expect(kinds.has(kind)).toBe(true);
    const wind = (cues: SoundCue[]) => cues.find((c) => c.kind === "wireWind")!.volume;
    expect(wind(nearWire.cues)).toBeGreaterThan(wind(middle.cues) * 2);
    // Every rumble matches a timetabled burst, delayed by its distance at 343 m/s.
    const rumbles = middle.cues.filter((c) => c.kind === "distantBattle");
    expect(rumbles.length).toBeGreaterThan(10);
    for (const r of rumbles) {
      const flash = distantFlashes(trenchMap, 0, 2400).find((f) => f.x === r.at.x && f.z === r.at.z)!;
      expect(flash).toBeDefined();
      expect(r.seed - flash.tick).toBe(Math.round((Math.hypot(flash.x, flash.z) / 343) * 30));
    }
  });
  it("rattles the wire only while a soldier pushes through it", () => {
    const run = (x: number, vx: number) => {
      const { g, feedback, cues, p } = scene();
      Object.assign(p, { x, z: 0, y: groundHeight(x, 0, trenchMap), vx, vz: 0 });
      for (let t = 1; t <= 90; t++) { g.tick = t; feedback.step(g); }
      return cues.filter((c) => c.kind === "wireSnag");
    };
    const pushing = run(-81.5, -1.8);
    expect(pushing.length).toBeGreaterThanOrEqual(4);
    expect(pushing.length).toBeLessThanOrEqual(9);
    expect(pushing.every((c) => c.local)).toBe(true);
    expect(run(-81.5, 0)).toHaveLength(0);
    expect(run(-70, -4)).toHaveLength(0);
    // A soldier's own belt in no-man's land is clear to them.
    const own = trenchMap.wireBelts!.find((b) => b.team === "blue")!;
    const { g, feedback, cues, p } = scene();
    Object.assign(p, { x: own.x, z: own.z, y: groundHeight(own.x, own.z, trenchMap), vx: 2, vz: 0 });
    for (let t = 1; t <= 60; t++) { g.tick = t; feedback.step(g); }
    expect(cues.some((c) => c.kind === "wireSnag")).toBe(p.team !== "blue");
  });
  it("plays crown breakage and falling timber for Verdun IDs, with bounded nearby sounds",()=>{
    const g=new Game(new TestCollision(verdunMap),false,5000,12345,undefined,{map:verdunMap});
    const source=g.map.vegetation!.find(b=>b.id!.startsWith("verdun-wood-central")&&b.treeStyle==="pine")!;
    Object.assign(g.players[0],{x:source.x+4,z:source.z,y:source.baseY!,protectedUntil:0});
    const cues:SoundCue[]=[],f=new BattlefieldFeedback(c=>cues.push(c));f.reset(g);
    const at={x:source.x+source.w/2+.2,y:source.baseY!+.7,z:source.z};
    g.events=[];g.explode(at,-1,null,{...grenadeExplosionProfile,damage:0,craterRadius:0,terrainReach:0});
    for(const e of g.events)f.event(g,e);
    expect(cues.some(c=>c.kind==="branchSnap")).toBe(true);
    cues.length=0;g.events=[];
    g.explode(at,-1,null,{...artilleryExplosionProfile,damage:0,craterRadius:0,terrainReach:0});
    for(const e of g.events)f.event(g,e);
    expect(cues.some(c=>c.kind==="timber")).toBe(true);
    expect(cues.filter(c=>c.kind==="timber").length).toBeLessThanOrEqual(4);
  });
  it("plays close melee swings and contact sounds without speech or distant chatter", () => {
    const { g, p, feedback, cues } = scene();
    const at = { x: p.x, y: p.y + 1.2, z: p.z };
    feedback.event(
      g,
      event({
        type: "melee",
        phase: "start",
        kind: "bayonet",
        actor: 0,
        target: null,
        at,
      }),
    );
    feedback.event(
      g,
      event({
        type: "melee",
        phase: "strike",
        kind: "bayonet",
        actor: 0,
        target: 1,
        damage: 65,
        at,
      }),
    );
    feedback.event(
      g,
      event({
        type: "melee",
        phase: "strike",
        kind: "bayonet",
        actor: 0,
        target: null,
        damage: 0,
        at,
      }),
    );
    feedback.event(
      g,
      event({
        type: "melee",
        phase: "start",
        kind: "butt",
        actor: 99,
        target: null,
        at: { ...at, x: p.x + 40 },
      }),
    );
    expect(cues.map((c) => c.kind)).toEqual(["meleeSwing", "meleeHit"]);
    expect(feedback.stats.callouts).toBe(0);
  });
  it("plays service reports and local bolt/clip mechanics without distant mechanism chatter or speech", () => {
    const { g, p, feedback, cues } = scene();
    feedback.event(
      g,
      event({
        type: "fire",
        actor: 0,
        weapon: "serviceRifle",
        from: { x: p.x, y: p.y + 1.5, z: p.z },
      }),
    );
    for (const action of ["boltOpen", "clip", "boltClose"])
      feedback.event(g, event({ type: "weaponAction", actor: 0, action }));
    g.players.push({ ...structuredClone(p), id: 1, x: p.x + 20 });
    feedback.event(
      g,
      event({ type: "weaponAction", actor: 1, action: "boltOpen" }),
    );
    expect(cues.map((c) => c.kind)).toEqual([
      "serviceRifle",
      "bolt",
      "clip",
      "bolt",
    ]);
    expect(cues.every((c) => c.local)).toBe(true);
    expect(feedback.stats.callouts).toBe(0);
  });
  it("keeps battlefield effects audible without spoken smoke, grenade or incoming callouts", () => {
    const { g, p, feedback, cues } = scene(false);
    Object.assign(p, { x: 0, y: 0, z: 0 });
    g.players.push({ ...p, id: 1, x: 3 });
    const snapshot = g.snapshot();
    for (const e of [
      { type: "smokeThrow", actor: 0, from: { x: 0, y: 1, z: 0 } },
      { type: "grenadeThrow", actor: 1, from: { x: 3, y: 1, z: 0 } },
      { type: "artilleryLaunch", actor: -1, from: { x: 4, y: 35, z: 0 } },
      {
        type: "artilleryImpact",
        actor: -1,
        at: { x: 4, y: 1, z: 0 },
        radius: 12,
        hits: [],
      },
      { type: "fire", actor: 1, from: { x: 3, y: 1, z: 0 } },
    ]) {
      feedback.event(g, event(e));
      g.tick += 400;
    }
    expect(cues.map((c) => c.kind)).toEqual([
      "whistle",
      "artillery",
      "debris",
      "rifle",
    ]);
    expect(feedback.stats.callouts).toBe(0);
    expect(feedback.recent.some((c) => c.kind === "voice")).toBe(false);
    g.tick = snapshot.tick;
    expect(g.snapshot()).toEqual(snapshot);
  });
  it("uses the same visible duckboard footprints for wood steps, and excavation removes that surface", () => {
    const { g, p } = scene();
    const board = duckboards(g.map).find((b) => b.x === -41 && b.z === 8)!;
    expect(board).toBeDefined();
    expect(intactBoard(board, g.map)).toBe(true);
    expect(footSurface(board, g.map)).toBe("wood");
    expect(footSurface({ x: board.x + 1, z: board.z }, g.map)).toBe("mud");
    expect(footSurface(p, industrialMap)).toBe("concrete");
    g.explode({ ...board, y: 0.1 }, 0, "blue", {
      ...grenadeExplosionProfile,
      damage: 0,
    });
    expect(intactBoard(board, g.map)).toBe(false);
    expect(footSurface(board, g.map)).toBe("mud");
  });
  it("derives steps from actual grounded distance, with no steps while idle, blocked, airborne or teleporting", () => {
    const { g, p, feedback, cues } = scene(false);
    Object.assign(p, { x: 0, z: 0, y: 0 });
    feedback.step(g);
    for (let i = 0; i < 40; i++) {
      g.step({ ...idle(), x: 1 });
      feedback.step(g);
    }
    const moving = cues.length;
    expect(moving).toBeGreaterThan(2);
    expect(cues.every((c) => c.kind === "concrete")).toBe(true);
    for (let i = 0; i < 30; i++) {
      g.step(idle());
      feedback.step(g);
    }
    const stopped = cues.length;
    for (let i = 0; i < 30; i++) feedback.step(g);
    expect(cues.length).toBe(stopped);
    p.x += 30;
    feedback.step(g);
    expect(cues.length).toBe(stopped);
    p.fall = { startTick: g.tick, velocity: -3 };
    for (let i = 0; i < 20; i++) {
      p.x += 0.2;
      feedback.step(g);
    }
    expect(cues.length).toBe(stopped);
    expect(feedback.stats.concreteSteps).toBe(stopped);
  });
  it("keeps crouch footsteps quieter", () => {
    const { g, p, feedback, cues } = scene(false);
    Object.assign(p, { x: 0, z: 0, y: 0 });
    feedback.step(g);
    for (let i = 0; i < 40; i++) {
      g.step({ ...idle(), x: 1, crouch: true });
      feedback.step(g);
    }
    expect(cues.length).toBeGreaterThan(0);
    expect(cues.every((c) => c.volume < 0.05)).toBe(true);
    expect(cues.every((c) => c.local)).toBe(true);
  });
  it("routes distant rifles and shell whistles from their real positions, respecting cover and the range cap", () => {
    const { g, p, feedback, cues } = scene();
    Object.assign(p, { x: -21, z: -1, y: 0 });
    feedback.event(
      g,
      event({ type: "fire", actor: 5, from: { x: 19, y: 2.5, z: -1 } }),
    );
    expect(cues[0].kind).toBe("rifle");
    expect(cues[0].occluded).toBe(true);
    expect(cues[0].local).toBe(false);
    expect(feedback.stats.distantRifles).toBe(1);
    feedback.event(
      g,
      event({ type: "fire", actor: 0, from: { x: p.x, y: 1.5, z: p.z } }),
    );
    expect(cues[1].local).toBe(true);
    feedback.event(
      g,
      event({ type: "artilleryLaunch", from: { x: 0, y: 35, z: 0 } }),
    );
    const whistle = cues.find((c) => c.kind === "whistle")!;
    expect(whistle).toBeDefined();
    expect(whistle.at.y).toBe(35);
    const beforeDistantShot = cues.length;
    feedback.event(
      g,
      event({ type: "fire", actor: 9, from: { x: 200, y: 2, z: 0 } }),
    );
    expect(cues.length).toBe(beforeDistantShot);
  });
  it("plays cracks only for unobstructed simulation near-miss events belonging to the local listener, with a cooldown", () => {
    const { g, feedback, cues } = scene();
    const crack = event({
      type: "nearMiss",
      actor: 0,
      source: 8,
      at: { x: 0, y: 3, z: 0 },
      distance: 0.4,
    });
    feedback.event(g, crack);
    feedback.event(g, crack);
    feedback.event(g, { ...crack, actor: 1 } as Event);
    expect(cues.length).toBe(1);
    g.tick += 5;
    feedback.event(g, crack);
    expect(cues.length).toBe(2);
    expect(cues[0].kind).toBe("crack");
    expect(cues[0].occluded).toBe(false);
  });
  it("scales blast reaction with distance and cover, decays hearing and camera motion, and permits disabling motion", () => {
    const { g, p, feedback } = scene(false);
    Object.assign(p, { x: 0, y: 0, z: 0 });
    const before = JSON.stringify(g.snapshot());
    feedback.event(
      g,
      event({
        type: "grenadeExplosion",
        at: { x: 4, y: 1, z: 0 },
        radius: 7,
        hits: [],
      }),
    );
    const strength = feedback.state(g.tick).muffle;
    expect(strength).toBeGreaterThan(0.5);
    expect(Math.abs(feedback.state(g.tick + 1).pitch)).toBeGreaterThan(0.001);
    expect(Math.abs(feedback.state(g.tick + 1).pitch)).toBeLessThan(0.01);
    expect(feedback.state(g.tick + 2, false).pitch).toBe(0);
    expect(feedback.state(g.tick + 2, false).muffle).toBeGreaterThan(0);
    expect(feedback.state(g.tick + 120).muffle).toBe(0);
    expect(Math.abs(feedback.state(g.tick + 30).roll)).toBeLessThan(0.001);
    expect(JSON.stringify(g.snapshot())).toBe(before);
    g.tick += 150;
    g.collision.ray = () => 0.5;
    feedback.event(
      g,
      event({
        type: "grenadeExplosion",
        at: { x: 4, y: 1, z: 0 },
        radius: 7,
        hits: [],
      }),
    );
    expect(feedback.state(g.tick).muffle).toBeLessThan(strength * 0.5);
  });
  it("bounds stacked effects, clears death/respawn/restart feedback, and bounds diagnostics", () => {
    const { g, p, feedback, cues } = scene(false);
    Object.assign(p, { x: 0, z: 0, y: 0 });
    const blast = event({
      type: "artilleryImpact",
      at: { x: 1, y: 1, z: 0 },
      radius: 12,
      hits: [],
    });
    for (let i = 0; i < 200; i++) feedback.event(g, blast);
    expect(feedback.state(g.tick).muffle).toBeLessThanOrEqual(1);
    expect(feedback.recent.length).toBe(160);
    expect(cues.length).toBeGreaterThan(0);
    p.hp = 0;
    feedback.step(g);
    expect(feedback.state(g.tick).muffle).toBe(0);
    feedback.event(g, event({ type: "respawn", actor: 0 }));
    expect(feedback.state(g.tick).muffle).toBe(0);
    feedback.reset(g);
    expect(feedback.recent.length).toBe(0);
    expect(feedback.stats.blastReactions).toBe(0);
  });
});

it("limits audible footsteps to eight nearby soldiers even in a crowded formation", () => {
  const { g, p, feedback, cues } = scene(false);
  Object.assign(p, { x: 0, y: 0, z: 0 });
  for (let id = 1; id < 30; id++)
    g.players.push({ ...structuredClone(p), id, x: id * 0.05, z: id * 0.05 });
  feedback.step(g);
  for (let i = 0; i < 10; i++) {
    for (const soldier of g.players) soldier.x += 0.15;
    feedback.step(g);
  }
  expect(cues.length).toBeGreaterThan(0);
  expect(cues.length).toBeLessThanOrEqual(8);
});
