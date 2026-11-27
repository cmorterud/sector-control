import { expect, it, vi } from "vitest";
import { artilleryRules, artilleryTargetReason } from "./artillery";
import { BatteryPlan, batteryGuns, batteryRules } from "./artillery-battery";
import { artillerySectors } from "./artillery-sectors";
import { gallipoliShips, gallipoliTurrets } from "./backdrop";
import { gallipoliMap } from "./gallipoli-map";
import { groundHeight } from "./map";
import { deadGround, navalExplosionProfile, navalRules, shellProfileFor } from "./naval-gunfire";
import { artilleryExplosionProfile } from "./destruction";
import { Game, TestCollision, idle } from "./simulation";
import { trenchMap } from "./trench-map";
import { headlandMap } from "./headland-map";

vi.setConfig({ testTimeout: 120000 });

it("fires ANZAC's artillery from the warships offshore", () => {
  const guns = batteryGuns(gallipoliMap);
  expect(guns).toHaveLength(batteryRules.guns * 2);
  // Each gun is a turret on one of the warships drawn at sea, not an invisible gun.
  const turrets = gallipoliTurrets();
  expect(turrets).toHaveLength(4);
  for (const gun of guns.filter((g) => g.team === "blue")) {
    expect(gun.hidden).toBe(true);
    expect(turrets.some((t) => t.x === gun.x && t.y === gun.y && t.z === gun.z)).toBe(true);
    const ship = gallipoliShips.find((s) => s.turrets && Math.abs(s.x - gun.x) < s.beam / 2 + 0.5 && Math.abs(s.z - gun.z) < s.length / 2)!;
    expect(ship).toBeDefined();
  }
  // The Ottoman guns stand visibly on the land behind the ridge.
  for (const gun of guns.filter((g) => g.team === "red")) {
    expect(gun.hidden).toBe(false);
    expect(gun.x).toBeGreaterThan(gallipoliMap.width / 2);
  }
});

it("cannot reach the dead ground behind the crest or down the gully, but reaches every flag", () => {
  const cells = artillerySectors(gallipoliMap), dead = cells.filter((c) => deadGround(gallipoliMap, "blue", c));
  // The Ottoman rear behind the last ridge.
  expect(dead.filter((c) => c.x > 80).length).toBeGreaterThanOrEqual(5);
  // The deep gully below the Nek.
  expect(dead.some((c) => c.x < 0)).toBe(true);
  // Most of the field is open to the ships, and every objective is.
  expect(dead.length).toBeLessThan(cells.length / 5);
  for (const s of gallipoliMap.sectors) expect(deadGround(gallipoliMap, "blue", s), s.id).toBe(false);
  // Only the fleet has dead ground; land guns fire high and drop anywhere.
  for (const c of dead) expect(deadGround(gallipoliMap, "red", c)).toBe(false);
  for (const map of [trenchMap, headlandMap]) expect(artillerySectors(map).some((c) => deadGround(map, "blue", c))).toBe(false);
});

it("refuses a fire mission into dead ground and fires one onto the ridge from the ships", () => {
  const map = gallipoliMap;
  const g = new Game(new TestCollision(map), true, 480 * 30, 5, undefined, { map, ambientArtillery: false, teamSize: 3 });
  g.commandOverride = () => idle();
  const human = g.players[0];
  expect(human.team).toBe("blue");
  Object.assign(human, { x: 40, z: 0, y: groundHeight(40, 0, map), vx: 0, vz: 0, protectedUntil: 0 });
  g.tick = artilleryRules.initialDelay;
  expect(artilleryTargetReason(g, human, { x: 96, z: 16, area: true })).toBe("Dead ground: the ships' guns can't reach it");
  const flag = map.sectors.find((s) => s.id === "E")!;
  expect(artilleryTargetReason(g, human, { x: flag.x, z: flag.z, area: true })).toBeNull();
  g.step({ ...idle(), artillery: { x: flag.x, z: flag.z, area: true } });
  expect(g.artillery.missions).toHaveLength(1);
  const shots = new BatteryPlan().update(g).filter((s) => s.team === "blue");
  expect(shots.length).toBeGreaterThan(0);
  for (const s of shots) expect(s.muzzle.x).toBeLessThan(-200);
});

it("hits a quarter harder and wider than field artillery, for the fleet's side only", () => {
  expect(navalRules.power).toBe(1.25);
  expect(navalExplosionProfile.radius).toBeCloseTo(artilleryExplosionProfile.radius * 1.25, 6);
  expect(navalExplosionProfile.damage).toBe(Math.round(artilleryExplosionProfile.damage * 1.25));
  expect(navalExplosionProfile.label).toBe("Naval gunfire");
  expect(shellProfileFor(gallipoliMap, "blue")).toBe(navalExplosionProfile);
  expect(shellProfileFor(gallipoliMap, "red")).toBe(artilleryExplosionProfile);
  expect(shellProfileFor(trenchMap, "blue")).toBe(artilleryExplosionProfile);
});
