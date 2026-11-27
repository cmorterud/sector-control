import { describe, expect, it, vi } from "vitest";
import { gallipoliMap } from "./gallipoli-map";
import { trenchMap } from "./trench-map";
import { groundHeight, hillHeight } from "./map";
import { eyeHeightOf } from "./crouch";
import { Game, TestCollision, exposedAimHeight, idle, type Command, type Soldier } from "./simulation";
import { carriesPeriscope, mirrorPoint, periscopeLift, periscopeRules, periscopeWeapon } from "./periscope";
import { equippedStats } from "./weapons";
import { factions } from "./loadouts";

vi.setConfig({ testTimeout: 120000 });

function match(map = gallipoliMap) {
  const g = new Game(new TestCollision(map), true, 3600, 7, undefined, { map, ambientArtillery: false, teamSize: 3 });
  g.commandOverride = () => idle();
  return g;
}
// Stand the player at (x, z) facing (tx, tz), still and unhurt.
function place(g: Game, p: Soldier, x: number, z: number, tx: number, tz: number) {
  const yaw = Math.atan2(tx - x, -(tz - z));
  Object.assign(p, { x, z, y: groundHeight(x, z, g.map), vx: 0, vz: 0, yaw, pitch: 0, protectedUntil: Infinity, hp: 100 });
  return yaw;
}
const aimAt = (p: Soldier, x: number, y: number, z: number, extra: Partial<Command> = {}): Command => {
  const eye = p.y + eyeHeightOf(p) + periscopeLift(p);
  return { ...idle(), aim: true, yaw: Math.atan2(x - p.x, -(z - p.z)), pitch: Math.atan2(y - eye, Math.hypot(x - p.x, z - p.z)), ...extra };
};
function armed(map = gallipoliMap) {
  const g = match(map), p = g.players[0];
  g.selectLoadout(p, "periscope");
  g.respawn(p);
  return { g, p };
}

describe("periscope rifle", () => {
  it("is issued only to ANZAC, as a marksman's choice", () => {
    expect(factions.anzac.periscope).toBe(periscopeWeapon);
    expect(factions.ottoman.periscope).toBeUndefined();
    expect(factions.british.periscope).toBeUndefined();
    const { p } = armed();
    expect(p.team).toBe("blue");
    expect(p.weaponId).toBe(periscopeWeapon);
    expect(carriesPeriscope(p)).toBe(true);
    expect(equippedStats(p)?.role).toBe("periscope");
    // Elsewhere the choice is refused and the soldier keeps the rifle.
    const other = match(trenchMap), q = other.players[0];
    other.selectLoadout(q, "periscope");
    other.respawn(q);
    expect(q.weaponId).not.toBe(periscopeWeapon);
  });

  it("rises over a few ticks while aimed, and comes down when the aim drops", () => {
    const { g, p } = armed();
    place(g, p, -40, 0, 0, 0);
    for (let i = 0; i < periscopeRules.raiseTicks / 2; i++) g.step(aimAt(p, 0, p.y + 2, 0));
    expect(periscopeLift(p)).toBeGreaterThan(0);
    expect(periscopeLift(p)).toBeLessThan(periscopeRules.lift);
    for (let i = 0; i < periscopeRules.raiseTicks; i++) g.step(aimAt(p, 0, p.y + 2, 0));
    expect(periscopeLift(p)).toBeCloseTo(periscopeRules.lift, 5);
    // Bots now see and aim at the mirror over the parapet, not the head below it.
    expect(exposedAimHeight(g.map, p)).toBeCloseTo(eyeHeightOf(p) + periscopeRules.lift + periscopeRules.mirrorAbove, 5);
    for (let i = 0; i < periscopeRules.raiseTicks; i++) g.step(idle());
    expect(periscopeLift(p)).toBe(0);
  });

  it("fires over the parapet from below it, out of a captured trench at Lone Pine", () => {
    const { g, p } = armed();
    // An Ottoman front-line bay, looking east to their next line.
    const x = 14, z = 42, tx = 27, ty = hillHeight(tx, z, g.map) + g.map.terrain!.bankHeight + 0.4;
    place(g, p, x, z, tx, z);
    const eye = { x, y: p.y + eyeHeightOf(p), z }, target = { x: tx, y: ty, z };
    // Standing on the floor the parapet hides the top of the next line; the raised mirror sees it.
    expect(g.collision.ray(eye, target)).toBeLessThan(1);
    expect(g.collision.ray({ ...eye, y: eye.y + periscopeRules.lift }, target)).toBe(1);
    // An Ottoman soldier in the open beyond their next line.
    const enemy = g.players.find((q) => q.team === "red")!;
    Object.assign(enemy, { x: tx + 3, z, vx: 0, vz: 0, hp: 100, protectedUntil: 0 });
    enemy.y = groundHeight(enemy.x, enemy.z, g.map);
    const chest = enemy.y + 1.1;
    let fired: { from: { y: number } } | undefined;
    for (let i = 0; i < periscopeRules.raiseTicks + 20; i++) g.step(aimAt(p, enemy.x, chest, z));
    expect(periscopeLift(p)).toBeCloseTo(periscopeRules.lift, 5);
    g.step(aimAt(p, enemy.x, chest, z, { fire: true }));
    for (const e of g.events) if (e.type === "fire" && e.actor === p.id) fired = e;
    expect(fired).toBeDefined();
    // The round leaves above the parapet, the shooter's head still below it.
    const parapet = hillHeight(x, z, g.map) + g.map.terrain!.bankHeight;
    expect(fired!.from.y).toBeGreaterThan(parapet);
    expect(p.y + eyeHeightOf(p)).toBeLessThan(parapet);
    let hit = false;
    for (let i = 0; i < 20 && !hit; i++) {
      g.step(aimAt(p, enemy.x, chest, z));
      hit = g.events.some((e) => e.type === "impact" && e.actor === p.id && e.target === enemy.id);
    }
    expect(hit).toBe(true);
  });

  it("loses its mirror to a round through it, and aims like a rifle until the next life", () => {
    const { g, p } = armed();
    place(g, p, -40, 0, 0, 0);
    for (let i = 0; i < periscopeRules.raiseTicks + 2; i++) g.step(aimAt(p, 0, p.y + 2, 0));
    const mirror = mirrorPoint(p), enemy = g.players.find((q) => q.team === "red")!;
    // An Ottoman round fired straight through the glass.
    const from = { x: mirror.x + 10, y: mirror.y, z: mirror.z };
    g.projectiles.push({ id: 9999, actor: enemy.id, team: "red", ...from, vx: -288, vy: 0, vz: 0, remaining: 60, bornAt: g.tick - 1, damage: 85 });
    let broken = false;
    for (let i = 0; i < 4 && !broken; i++) {
      g.step(aimAt(p, 0, p.y + 2, 0));
      broken = g.events.some((e) => e.type === "periscope" && e.phase === "broken" && e.owner === p.id && e.actor === enemy.id);
    }
    expect(broken).toBe(true);
    expect(p.hp).toBe(100);
    expect(p.periscope?.broken).toBe(true);
    for (let i = 0; i < periscopeRules.raiseTicks; i++) g.step(aimAt(p, 0, p.y + 2, 0));
    expect(periscopeLift(p)).toBe(0);
    expect(exposedAimHeight(g.map, p)).toBeCloseTo(1.65, 5);
    // A new life brings a whole mirror.
    g.respawn(p);
    expect(p.periscope).toBeUndefined();
    place(g, p, -40, 0, 0, 0);
    for (let i = 0; i < periscopeRules.raiseTicks + 2; i++) g.step(aimAt(p, 0, p.y + 2, 0));
    expect(periscopeLift(p)).toBeCloseTo(periscopeRules.lift, 5);
  });

  it("stops under head cover rather than rising through it", () => {
    const { g, p } = armed();
    // A Lone Pine log roof over the Ottoman trench floor.
    const roof = g.map.boxes.find((b) => b.supports && b.kind === "log" && b.baseY !== undefined)!;
    expect(roof).toBeDefined();
    place(g, p, roof.x, roof.z, roof.x + 20, roof.z);
    for (let i = 0; i < periscopeRules.raiseTicks + 2; i++) g.step(aimAt(p, roof.x + 20, p.y + 2, roof.z));
    expect(periscopeLift(p)).toBeLessThan(periscopeRules.lift - 0.2);
  });
});
