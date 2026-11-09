import { expect, it } from "vitest";
import { Entity, StandardMaterial } from "playcanvas";
import { Game, TestCollision, idle, type Event } from "./simulation";
import {
  advanceArtillery,
  ambientArtilleryRules,
  artilleryRules,
} from "./artillery";
import {
  ambientArtilleryExplosionProfile,
  artilleryExplosionProfile,
} from "./destruction";
import { industrialMap, dist } from "./map";
import { trenchMap } from "./trench-map";
import { Renderer } from "./rendering";
import { PlaytestLog } from "./playtest";

const flat = { ...industrialMap, boxes: [], scoring: "eliminations" as const };
const scene = (map = trenchMap, seed = 12345) =>
  new Game(new TestCollision(map), false, 5000, seed, undefined, { map });

it("lands reproducible single stray shells at irregular intervals, independently of combat and team charges", () => {
  function run(seed: number) {
    const g = scene(trenchMap, seed),
      events: Event[] = [];
    const charges = { ...g.artillery.readyAt },
      combatSeed = g.seed;
    for (let n = 0; n < 8; n++) {
      g.tick = g.artillery.ambient.nextAt;
      g.events = [];
      advanceArtillery(g);
      expect(g.artillery.shells).toHaveLength(1);
      expect(g.artillery.missions).toHaveLength(0);
      events.push(...g.events);
      for (let i = 0; i < artilleryRules.flightTicks + 5; i++) {
        g.tick++;
        g.events = [];
        advanceArtillery(g);
        events.push(...g.events);
      }
      expect(g.artillery.shells).toHaveLength(0);
    }
    expect(g.seed).toBe(combatSeed);
    expect(g.artillery.readyAt).toEqual(charges);
    const launches = events.filter((e) => e.type === "artilleryLaunch");
    const impacts = events.filter((e) => e.type === "artilleryImpact");
    expect(launches).toHaveLength(8);
    expect(impacts).toHaveLength(8);
    expect(events.some((e) => e.type === "artilleryCall")).toBe(false);
    const gaps = launches.slice(1).map((e, i) => e.tick - launches[i].tick);
    expect(new Set(gaps).size).toBeGreaterThan(3);
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(ambientArtilleryRules.minInterval);
      expect(gap).toBeLessThanOrEqual(ambientArtilleryRules.maxInterval);
    }
    for (const e of impacts) {
      expect(e.ambient).toBe(true);
      expect(e.actor).toBe(-1);
      expect(e.radius).toBe(24);
      expect(Math.abs(e.at.x)).toBeLessThan(g.map.width / 2 - 7.9);
      expect(Math.abs(e.at.z)).toBeLessThan(g.map.depth / 2 - 7.9);
      for (const spawn of Object.values(g.map.spawn))
        expect(dist(e.at, spawn)).toBeGreaterThan(33.9);
    }
    expect(
      g.map.destruction!.craters.some(
        (c) => c.shape && c.shape.radiusX > 4 && c.shape.radiusZ > 4,
      ),
    ).toBe(true);
    const log = new PlaytestLog();
    log.events.push(...events);
    expect(log.summary().ambientArtilleryImpacts).toBe(8);
    return impacts.map((e) => [e.tick, e.at.x, e.at.z]);
  }
  const first = run(12345);
  expect(run(12345)).toEqual(first);
  expect(run(9876)).not.toEqual(first);
});

it("damages both teams beyond the guided shell radius without awarding kills or team points; spawn protection remains", () => {
  const g = scene(flat),
    p = g.players[0];
  Object.assign(p, { x: -15, z: 0, y: 0, protectedUntil: 0 });
  g.players.push({ ...p, id: 1, team: "red", x: 15 });
  g.players.push({ ...p, id: 2, x: 2, protectedUntil: 100 });
  g.tick = 1;
  g.artillery.shells.push({
    id: 1,
    mission: 1,
    actor: -1,
    team: "blue",
    ambient: true,
    x: 0,
    z: 0,
    y: 0.03,
    vx: 0,
    vy: -20,
    vz: 0,
    bornAt: 0,
  });
  advanceArtillery(g);
  expect(g.players[0].hp).toBeLessThan(20);
  expect(g.players[1].hp).toBe(g.players[0].hp);
  expect(g.players[2].hp).toBe(100);
  for (const player of g.players.slice(0, 2)) player.hp = 1;
  g.explode(
    { x: 0, y: 0.05, z: 0 },
    -1,
    null,
    ambientArtilleryExplosionProfile,
  );
  expect(
    g.players
      .slice(0, 2)
      .every((p) => p.hp === 0 && p.deaths === 1 && p.kills === 0),
  ).toBe(true);
  expect(g.scores).toEqual({ blue: 0, red: 0 });
  expect(ambientArtilleryExplosionProfile.radius).toBe(
    artilleryExplosionProfile.radius * 2,
  );
  expect(ambientArtilleryExplosionProfile.craterRadius).toBe(
    artilleryExplosionProfile.craterRadius * 2,
  );
  expect(ambientArtilleryExplosionProfile.damage).toBe(
    artilleryExplosionProfile.damage,
  );
});

it("keeps intact trench earth protective against a heavy shell", () => {
  const g = scene(),
    p = g.players[0];
  Object.assign(p, { x: -21, z: -33, y: 0, protectedUntil: 0 });
  const hits = g.explode(
    { x: -15, y: 2.45, z: -33 },
    -1,
    null,
    ambientArtilleryExplosionProfile,
  );
  expect(hits).toEqual([]);
  expect(p.hp).toBe(100);
});

it("only enables ambient artillery on trench maps, snapshots the schedule and resets it with the match", () => {
  const g = scene(),
    original = g.artillery.ambient.nextAt;
  expect(scene(flat).artillery.ambient.enabled).toBe(false);
  expect(g.artillery.ambient.enabled).toBe(true);
  const snapshot = g.snapshot();
  snapshot.artillery.ambient.nextAt = -1;
  expect(g.artillery.ambient.nextAt).toBe(original);
  g.tick = original - 1;
  advanceArtillery(g);
  expect(g.artillery.shells).toHaveLength(0);
  g.artillery.enabled = false;
  g.tick = original;
  advanceArtillery(g);
  expect(g.artillery.shells).toHaveLength(0);
  g.artillery.enabled = true;
  g.artillery.ambient.enabled = false;
  advanceArtillery(g);
  expect(g.artillery.shells).toHaveLength(0);
  g.artillery.ambient.enabled = true;
  g.phase = "ended";
  g.step(idle());
  expect(g.artillery.shells).toHaveLength(0);
  expect(scene().artillery.ambient.nextAt).toBe(original);
  const off = new Game(
    new TestCollision(trenchMap),
    false,
    1000,
    1,
    undefined,
    { map: trenchMap, ambientArtillery: false },
  );
  expect(off.artillery.ambient.enabled).toBe(false);
});

it("renders a twice-size heavy flash/dust footprint without extending the effect lifetime", () => {
  function render(ambient: boolean) {
    const r = Object.assign(Object.create(Renderer.prototype), {
      app: { root: new Entity("test") },
      camera: new Entity("camera"),
      blasts: [],
      casualties: [],
      blastSequence: 0,
      people: new Map(),
      dustMaterial: () => new StandardMaterial(),
      joint(name: string, parent: Entity) {
        const entity = new Entity(name);
        entity.addComponent = () => null as never;
        parent.addChild(entity);
        return entity;
      },
    });
    r.camera.setEulerAngles(-20, 47, 0);
    r.effect({
      type: "artilleryImpact",
      id: 1,
      tick: 1,
      actor: -1,
      mission: 1,
      shell: 1,
      at: { x: 0, y: 0, z: 0 },
      radius: ambient ? 24 : 12,
      hits: [],
      ambient,
    });
    return r;
  }
  const regular = render(false),
    heavy = render(true);
  for (const delta of [0.08, 0.6]) {
    regular.drawBlasts(delta);
    heavy.drawBlasts(delta);
    const normalParts = regular.app.root.children[0].children as Entity[];
    const heavyParts = heavy.app.root.children[0].children as Entity[];
    for (let i = 0; i < normalParts.length; i++) {
      expect(heavyParts[i].getWorldTransform().getScale().length()).toBeCloseTo(
        normalParts[i].getWorldTransform().getScale().length() * 2,
        4,
      );
      expect(heavyParts[i].getPosition().length()).toBeCloseTo(
        normalParts[i].getPosition().length() * 2,
        4,
      );
    }
  }
  regular.drawBlasts(7);
  heavy.drawBlasts(7);
  expect(regular.app.root.children).toHaveLength(0);
  expect(heavy.app.root.children).toHaveLength(0);
});
