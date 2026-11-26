import { expect, it } from "vitest";
import { burstRadius, lightAt, nightLamps, nightRules, sightLimit, tapeBoxes, wireLanes } from "./night";
import { artilleryExplosionProfile, grenadeExplosionProfile } from "./destruction";
import { nightRaidMap } from "./night-map";
import { trenchMap } from "./trench-map";
import { groundHeight, inWire, trenchGround } from "./map";
import { mapLooks } from "./map-look";
import { Game, TestCollision, botCommand, resolveTeamSize, rifleHeight } from "./simulation";

const match = (map = nightRaidMap) => new Game(new TestCollision(map), true, 3600, 12345, undefined,
  { map, teamSize: 6, humanPlayerIds: [], ambientArtillery: false });

it("is Ypres's ground after dark, with a raiding party each side", () => {
  expect(nightRaidMap.id).toBe("night-raid");
  expect(nightRaidMap.name).toBe("Ypres at night");
  expect(resolveTeamSize(nightRaidMap)).toBe(50);
  expect(resolveTeamSize(trenchMap)).toBe(50);
  // The same trenches, wire, flags and spawns: knowing the day map is knowing this one.
  for (const key of ["terrain", "sectors", "spawn", "wireBelts", "playArea", "boundary", "boxes", "width", "depth"] as const)
    expect(nightRaidMap[key], key).toBe(trenchMap[key]);
  expect(trenchGround(nightRaidMap)).toBe(true);
  expect(trenchGround(trenchMap)).toBe(true);
  expect(nightRaidMap.night).toEqual({ sight: 15 });
  expect(trenchMap.night).toBeUndefined();
  // Both run the same assault game.
  expect(match().assaults.enabled).toBe(true);
});

it("has a night look: no sun shadows, a near-black sky, and the eye reaching about the sight distance", () => {
  const look = mapLooks["night-raid"], day = mapLooks.trenches;
  expect(look.sun.shadowStrength).toBe(0);
  expect(look.sun.intensity).toBeLessThanOrEqual(day.sun.intensity);
  const brightness = (hex: string) => [1, 3, 5].reduce((n, i) => n + parseInt(hex.slice(i, i + 2), 16), 0) / 3;
  expect(brightness(look.sky.horizon)).toBeLessThan(brightness(day.sky.horizon) / 4);
  expect(brightness(look.sky.zenith)).toBeLessThan(brightness(day.sky.zenith) * 0.6);
  // The viewer's own sight reaches a little past the sight rule, so what a
  // player makes out unaided and what a bot sees agree.
  expect(look.nightVision!.range).toBeGreaterThan(nightRaidMap.night!.sight);
  expect(look.nightVision!.range).toBeLessThan(nightRaidMap.night!.sight * 1.6);
  expect(day.nightVision).toBeUndefined();
  // Fog stays far: ground lit by a flare has to show from across the field.
  expect(look.fog.end).toBeGreaterThan(150);
});

it("burns lamps at the braziers, lanterns and flags, and nowhere by day", () => {
  expect(nightLamps(trenchMap)).toEqual([]);
  const lamps = nightLamps(nightRaidMap);
  expect(nightLamps(nightRaidMap)).toBe(lamps);
  const kinds = (kind: string) => lamps.filter((l) => l.kind === kind);
  expect(kinds("flag").map((l) => [l.x, l.z])).toEqual(nightRaidMap.sectors.map((s) => [s.x, s.z]));
  expect(kinds("brazier").length).toBeGreaterThanOrEqual(8);
  expect(kinds("lantern").length).toBeGreaterThanOrEqual(8);
  // A budget the renderer can light without shadows on a modest machine.
  expect(lamps.length).toBeLessThanOrEqual(40);
  for (const lamp of lamps) {
    expect(lamp.radius).toBe(nightRules.radius[lamp.kind]);
    // Only an open fire gives away whoever stands in its light.
    expect(lamp.reveals).toBe(lamp.kind === "brazier");
    expect(lamp.y).toBeGreaterThan(groundHeight(lamp.x, lamp.z, nightRaidMap));
    expect(lamp.y).toBeLessThan(groundHeight(lamp.x, lamp.z, nightRaidMap) + 2.2);
  }
  // Both sides have light of their own.
  for (const side of [-1, 1]) expect(lamps.filter((l) => Math.sign(l.x) === side).length).toBeGreaterThanOrEqual(8);
});

it("limits sight to fifteen meters in the dark and restores it in lamplight", () => {
  const lamp = nightLamps(nightRaidMap).find((l) => l.kind === "brazier")!;
  // No limit by day, anywhere.
  expect(sightLimit({ map: trenchMap }, lamp)).toBe(Infinity);
  expect(sightLimit({ map: trenchMap }, { x: 0, z: 0 })).toBe(Infinity);
  // The middle of no-man's land has no lamp.
  expect(lightAt({ map: nightRaidMap }, { x: 0, z: 10 })).toBe(0);
  expect(sightLimit({ map: nightRaidMap }, { x: 0, z: 10 })).toBe(15);
  // Standing at a lamp, a soldier is seen from across the field.
  expect(lightAt({ map: nightRaidMap }, lamp)).toBeCloseTo(1, 6);
  expect(sightLimit({ map: nightRaidMap }, lamp)).toBeCloseTo(nightRules.litSight, 6);
  // The light falls away to nothing at the lamp's radius.
  let previous = Infinity;
  for (const step of [0, 0.25, 0.5, 0.75, 0.999]) {
    const limit = sightLimit({ map: nightRaidMap }, { x: lamp.x, z: lamp.z + lamp.radius * step });
    expect(limit).toBeLessThanOrEqual(previous);
    previous = limit;
  }
  expect(previous).toBeLessThan(16);
  expect(sightLimit({ map: nightRaidMap }, { x: lamp.x, z: lamp.z + lamp.radius * 0.5 })).toBeGreaterThan(60);
  // A shaded lantern or a flag's lamp is something to steer by, not to be shot by:
  // a soldier holding a flag is no easier to see than one in the open.
  for (const shaded of nightLamps(nightRaidMap).filter((l) => !l.reveals)) {
    if (nightLamps(nightRaidMap).some((l) => l.reveals && Math.hypot(l.x - shaded.x, l.z - shaded.z) < l.radius)) continue;
    expect(sightLimit({ map: nightRaidMap }, shaded), shaded.kind).toBe(15);
  }
  for (const flag of nightRaidMap.sectors) expect(sightLimit({ map: nightRaidMap }, flag)).toBe(15);
});

// One soldier looks at another across open, level ground with a clear line between them.
function facing(map: typeof nightRaidMap, distance: number, at = { x: 0, z: 22 }) {
  const g = match(map), p = g.players[0], enemy = g.players[g.teamSize];
  for (const q of g.players) if (q !== p && q !== enemy) Object.assign(q, { x: q.team === "blue" ? -70 : 70, z: 55, hp: 0 });
  Object.assign(enemy, { x: at.x, z: at.z, y: groundHeight(at.x, at.z, g.map) });
  Object.assign(p, { x: at.x - distance, z: at.z, yaw: Math.PI / 2 });
  p.y = groundHeight(p.x, p.z, g.map);
  p.awareness.nextLook = g.tick;
  const clear = g.collision.ray({ x: p.x, y: p.y + rifleHeight(g.map, p), z: p.z }, { x: enemy.x, y: enemy.y + 1.25, z: enemy.z });
  botCommand(g, p);
  return { clear, seen: p.target === enemy.id };
}

it("lets a bot see an unlit enemy only within the sight distance", () => {
  // The same pair by day: seen at every one of these distances.
  for (const distance of [8, 13, 20, 28]) {
    const day = facing(trenchMap, distance);
    expect(day.clear, `clear line at ${distance} m`).toBe(1);
    expect(day.seen, `day, ${distance} m`).toBe(true);
    expect(facing(nightRaidMap, distance).seen, `night, ${distance} m`).toBe(distance < 15);
  }
});

it("lets a bot see an enemy standing by a brazier from well beyond the sight distance", () => {
  // Find lamps with a clear line from 22 m away, on either side.
  const g = match(), p = g.players[0], enemy = g.players[g.teamSize];
  for (const q of g.players) if (q !== p && q !== enemy) Object.assign(q, { x: q.team === "blue" ? -70 : 70, z: 55, hp: 0 });
  const sightings = nightLamps(nightRaidMap).filter((lamp) => lamp.reveals).flatMap((lamp) => [-22, 22].map((offset) => {
    Object.assign(enemy, { x: lamp.x, z: lamp.z, y: groundHeight(lamp.x, lamp.z, g.map) });
    Object.assign(p, { x: lamp.x, z: lamp.z + offset, yaw: offset > 0 ? 0 : Math.PI, target: -1 });
    p.y = groundHeight(p.x, p.z, g.map);
    p.awareness.nextLook = g.tick;
    const clear = g.collision.ray({ x: p.x, y: p.y + rifleHeight(g.map, p), z: p.z }, { x: enemy.x, y: enemy.y + 1.25, z: enemy.z }) > 0.99;
    botCommand(g, p);
    return { clear, seen: p.target === enemy.id };
  })).filter((s) => s.clear);
  expect(sightings.length).toBeGreaterThanOrEqual(3);
  expect(sightings.every((s) => s.seen)).toBe(true);
});

it("tapes the lanes each side left through its own wire", () => {
  expect(wireLanes(trenchMap).length).toBe(wireLanes(nightRaidMap).length);
  const lanes = wireLanes(nightRaidMap);
  expect(lanes.filter((l) => l.team === "blue").length).toBeGreaterThanOrEqual(3);
  expect(lanes.filter((l) => l.team === "red").length).toBeGreaterThanOrEqual(3);
  for (const lane of lanes) {
    // A lane is a real way through: its center is clear of that side's belt for an enemy too.
    expect(inWire(lane.x, lane.z, nightRaidMap, lane.team === "blue" ? "red" : "blue")).toBe(false);
    expect(lane.width).toBeGreaterThan(2);
  }
  const boxes = tapeBoxes(nightRaidMap);
  expect(boxes.length).toBe(lanes.length * 2 * 10);
  for (const b of boxes) {
    // Tape lies on the ground it crosses and never inside the wire it marks a way through.
    expect(b.y).toBeGreaterThanOrEqual(groundHeight(b.x, b.z, nightRaidMap) - 1e-9);
    expect(b.y).toBeLessThan(groundHeight(b.x, b.z, nightRaidMap) + 0.05);
    expect(inWire(b.x, b.z, nightRaidMap, "blue") && inWire(b.x, b.z, nightRaidMap, "red")).toBe(false);
  }
});

it("shows the ground around a burst for a moment, and only at night", () => {
  const g = match(), at = { x: 4, y: groundHeight(4, 12, g.map) + 0.1, z: 12 };
  g.tick = 600;
  expect(lightAt(g, { x: 14, z: 12 })).toBe(0);
  g.explode(at, -1, null, artilleryExplosionProfile);
  expect(g.bursts).toHaveLength(1);
  expect(g.bursts[0]).toMatchObject({ x: 4, z: 12, tick: 600, radius: burstRadius(artilleryExplosionProfile.radius) });
  // A shell lights about 35 m; a grenade less.
  expect(burstRadius(artilleryExplosionProfile.radius)).toBe(36);
  expect(burstRadius(grenadeExplosionProfile.radius)).toBe(28);
  expect(lightAt(g, { x: 14, z: 12 })).toBeGreaterThan(0.8);
  expect(sightLimit(g, { x: 14, z: 12 })).toBeGreaterThan(70);
  expect(lightAt(g, { x: 4 + 37, z: 12 })).toBe(0);
  // The flash fades and is gone in under half a second.
  g.tick += 6;
  const fading = lightAt(g, { x: 14, z: 12 });
  expect(fading).toBeGreaterThan(0);
  expect(fading).toBeLessThan(0.6);
  g.tick += nightRules.burstTicks;
  expect(lightAt(g, { x: 14, z: 12 })).toBe(0);
  expect(sightLimit(g, { x: 14, z: 12 })).toBe(15);
  // The list stays short however long the shelling goes on.
  for (let i = 0; i < 40; i++) g.explode(at, -1, null, grenadeExplosionProfile);
  expect(g.bursts.length).toBeLessThanOrEqual(16);
  // By day there is nothing to light.
  const day = match(trenchMap);
  day.explode(at, -1, null, artilleryExplosionProfile);
  expect(day.bursts).toHaveLength(0);
});

it("gives a bot a glimpse of an enemy by a burst's flash", () => {
  const g = match(), p = g.players[0], enemy = g.players[g.teamSize];
  for (const q of g.players) if (q !== p && q !== enemy) Object.assign(q, { x: q.team === "blue" ? -70 : 70, z: 55, hp: 0 });
  const look = () => {
    Object.assign(enemy, { x: 0, z: 12, y: groundHeight(0, 12, g.map), hp: 100, lastShotAt: -1000 });
    Object.assign(p, { x: -28, z: 12, yaw: Math.PI / 2, target: -1, hp: 100 });
    p.y = groundHeight(p.x, p.z, g.map);
    p.awareness.nextLook = g.tick;
    expect(g.collision.ray({ x: p.x, y: p.y + rifleHeight(g.map, p), z: p.z }, { x: enemy.x, y: enemy.y + 1.25, z: enemy.z })).toBe(1);
    botCommand(g, p);
    return p.target === enemy.id;
  };
  g.tick = 600;
  expect(look()).toBe(false);
  // A shell lands 12 m beyond the enemy: for a moment they stand out against it.
  g.bursts.push({ x: 12, z: 12, tick: g.tick, radius: 36 });
  expect(look()).toBe(true);
  g.tick += nightRules.burstTicks + 1;
  expect(look()).toBe(false);
});

it("gives away a soldier who has just fired", () => {
  const g = match(), p = g.players[0], enemy = g.players[g.teamSize];
  for (const q of g.players) if (q !== p && q !== enemy) Object.assign(q, { x: q.team === "blue" ? -70 : 70, z: 55, hp: 0 });
  const look = (distance: number, firedAgo: number) => {
    Object.assign(enemy, { x: 0, z: 12, y: groundHeight(0, 12, g.map), hp: 100, lastShotAt: g.tick - firedAgo });
    Object.assign(p, { x: -distance, z: 12, yaw: Math.PI / 2, target: -1, hp: 100 });
    p.y = groundHeight(p.x, p.z, g.map);
    p.awareness.nextLook = g.tick;
    botCommand(g, p);
    return p.target === enemy.id;
  };
  g.tick = 600;
  // Silent, 28 m off: unseen. Having fired a third of a second ago: seen.
  expect(look(28, 1000)).toBe(false);
  expect(look(28, 10)).toBe(true);
  // The flash is forgotten after a second.
  expect(look(28, nightRules.muzzleTicks + 1)).toBe(false);
  expect(sightLimit(g, { x: 6, z: 12, lastShotAt: g.tick - 10 })).toBe(nightRules.muzzleSight);
  expect(sightLimit(g, { x: 6, z: 12, lastShotAt: g.tick - nightRules.muzzleTicks })).toBe(15);
  // By day firing changes nothing about how far a soldier is seen.
  expect(sightLimit({ map: trenchMap, tick: 600 }, { x: 6, z: 12, lastShotAt: 590 })).toBe(Infinity);
});
