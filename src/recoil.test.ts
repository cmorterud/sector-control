import { describe, it, expect } from "vitest";
import { Game, idle, botCommand, type Event } from "./simulation";
import { weaponAim, recoilRules } from "./recoil";
import { industrialMap } from "./map";
type Shot = Extract<Event, { type: "fire" }>;
function scene(bots = false) {
  const g = new Game(
    { ray: () => 1, move: (p) => ({ x: p.x, z: p.z }) },
    bots,
    3000,
    12345,
    {
      aimError: 0,
      awareness: false,
      reactionTicks: 0,
      focusMaxTicks: 0,
      burstPeriodTicks: 1,
      burstFireTicks: 1,
    },
    { map: { ...industrialMap, boxes: [] }, teamSize: 1, assaults: false },
  );
  for (const p of g.players)
    Object.assign(p, {
      x: p.id ? 20 : 0,
      y: 0,
      z: 0,
      hp: 1000000,
      protectedUntil: 0,
      nextThink: 1e9,
    });
  return g;
}
describe("rifle recoil", () => {
  it("keeps the first shot centered, kicks the view immediately, and makes later human rounds climb and drift", () => {
    const g = scene(),
      p = g.players[0];
    const shots: Shot[] = [];
    for (let i = 0; i < 54; i++) {
      g.step({ ...idle(), fire: i % 6 === 0 });
      for (const e of g.events) if (e.type === "fire") shots.push(e);
      expect(p.pitch).toBe(0);
      expect(p.yaw).toBe(0);
    }
    expect(shots).toHaveLength(9);
    expect(shots[0].recoil).toEqual({ pitch: 0, yaw: 0 });
    expect(shots[1].recoil.pitch).toBeCloseTo(
      recoilRules.pitchKick * Math.exp((-recoilRules.recovery * 6) / 30),
    );
    expect(shots.at(-1)!.recoil.pitch).toBeGreaterThan(shots[1].recoil.pitch);
    expect(shots.slice(1).some((e) => Math.abs(e.recoil.yaw) > 0.0001)).toBe(
      true,
    );
    const slope = (e: Shot) =>
      (e.to.y - e.from.y) / Math.hypot(e.to.x - e.from.x, e.to.z - e.from.z);
    expect(slope(shots[1])).toBeGreaterThan(slope(shots[0]));
    expect(weaponAim(p).pitch).toBeGreaterThan(p.pitch);
    expect(p.recoilPitch).toBeLessThanOrEqual(recoilRules.maxPitch);
    expect(Math.abs(p.recoilYaw)).toBeLessThanOrEqual(recoilRules.maxYaw);
  });
  it("lets downward and sideways aim compensate without erasing the recoil state", () => {
    const g = scene(),
      p = g.players[0];
    g.fire(p);
    const initial = g.events.find((e) => e.type === "fire")!;
    expect(p.recoilPitch).toBeGreaterThan(0);
    p.pitch = -p.recoilPitch;
    p.yaw = -p.recoilYaw;
    expect(weaponAim(p)).toEqual({ pitch: 0, yaw: 0 });
    g.fire(p);
    const second = g.events.filter((e) => e.type === "fire")[1];
    if (initial.type !== "fire") throw Error("missing shot");
    expect(second.to).toEqual(initial.to);
    expect(second.from).toEqual(initial.from);
    expect(p.recoilPitch).toBeGreaterThan(0);
  });
  it("applies recoil after bot targeting so perfect re-aiming cannot cancel the kick", () => {
    const g = scene(true),
      p = g.players[1],
      shots = [];
    for (let i = 0; i < 150; i++) {
      g.step(idle());
      for (const e of g.events)
        if (e.type === "fire" && e.actor === p.id) shots.push(e);
    }
    expect(shots.length).toBeGreaterThanOrEqual(4);
    expect(shots[0].recoil.pitch).toBe(0);
    expect(shots[1].recoil.pitch).toBeGreaterThan(0);
    const commandedPitch = botCommand(g, p).pitch;
    const kick = p.recoilPitch;
    p.recoilPitch = 0;
    expect(botCommand(g, p).pitch).toBe(commandedPitch);
    p.recoilPitch = kick;
    expect(weaponAim(p).pitch).toBeGreaterThan(p.pitch);
    expect(shots[1].to.y).toBeGreaterThan(shots[0].to.y);
  });
  it("recovers when firing stops, braces with ADS/crouch and resets cleanly on respawn", () => {
    const kicks = [];
    for (const stance of [
      { aim: false, crouch: false },
      { aim: true, crouch: false },
      { aim: true, crouch: true },
    ]) {
      const g = scene(),
        p = g.players[0];
      g.step({ ...idle(), ...stance, fire: true });
      kicks.push(p.recoilPitch);
      const snapshot = g.snapshot();
      const kick = p.recoilPitch;
      for (let i = 0; i < 60; i++) g.step({ ...idle(), ...stance });
      expect(p.recoilPitch).toBe(0);
      expect(p.recoilYaw).toBe(0);
      expect(p.recoilShots).toBe(0);
      expect(snapshot.players[0].recoilPitch).toBe(kick);
      g.step({ ...idle(), fire: true });
      expect(p.recoilPitch).toBeGreaterThan(0);
      g.respawn(p);
      expect(p.recoilPitch).toBe(0);
      expect(p.recoilYaw).toBe(0);
      expect(p.lastShotAt).toBe(-1000);
    }
    expect(kicks[1]).toBeLessThan(kicks[0]);
    expect(kicks[2]).toBeLessThan(kicks[1]);
  });
  it("only kicks on actual shots, including a blocked muzzle, and stays still when empty or reloading", () => {
    const g = scene(),
      p = g.players[0];
    p.ammo = 0;
    for (let i = 0; i < 4; i++) g.step({ ...idle(), fire: true });
    expect(p.recoilPitch).toBe(0);
    p.ammo = 10;
    g.step({ ...idle(), reload: true, fire: true });
    expect(p.recoilPitch).toBe(0);
    p.reloadAt = 0;
    g.collision.ray = () => 0;
    g.step(idle());
    g.step({ ...idle(), fire: true });
    expect(g.events.some((e) => e.type === "impact" && e.target === null)).toBe(
      true,
    );
    expect(p.recoilPitch).toBeGreaterThan(0);
    const at = p.lastShotAt,
      ammo = p.ammo,
      kick = p.recoilPitch;
    g.step({ ...idle(), fire: true });
    expect(p.lastShotAt).toBe(at);
    expect(p.ammo).toBe(ammo);
    expect(p.recoilPitch).toBeLessThan(kick);
  });
});
