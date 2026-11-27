import { expect, it, vi } from "vitest";
import { gallipoliMap } from "./gallipoli-map";
import { trenchMap } from "./trench-map";
import { groundHeight } from "./map";
import { grenadeLook } from "./grenade-look";
import { Game, TestCollision, idle } from "./simulation";

vi.setConfig({ testTimeout: 120000 });

it("gives Gallipoli's sides their own hand bombs and leaves the western front's alone", () => {
  expect(grenadeLook(gallipoliMap, "blue")).toMatchObject({ name: "Jam-tin bomb", shape: "tin" });
  expect(grenadeLook(gallipoliMap, "red")).toMatchObject({ name: "Cricket-ball bomb", shape: "ball" });
  for (const team of ["blue", "red"] as const) expect(grenadeLook(trenchMap, team)).toMatchObject({ name: "Fragmentation grenade", shape: "egg" });
});

it("names a thrown bomb in the death report after its side's look", () => {
  const map = gallipoliMap;
  const g = new Game(new TestCollision(map), true, 3600, 3, undefined, { map, humanPlayerIds: [], ambientArtillery: false, teamSize: 3 });
  g.commandOverride = () => idle();
  const thrower = g.players.find((p) => p.team === "blue")!, victim = g.players.find((p) => p.team === "red")!;
  const x = -60, z = 0, y = groundHeight(x, z, map);
  Object.assign(victim, { x, z, y, vx: 0, vz: 0, hp: 1, protectedUntil: 0 });
  g.grenades.push({ id: 999, actor: thrower.id, team: "blue", x: x + 0.5, y: y + 0.2, z, vx: 0, vy: 0, vz: 0, bornAt: g.tick, explodeAt: g.tick + 1 });
  for (let i = 0; i < 3; i++) g.step(idle());
  expect(victim.lastDeath?.weapon).toBe("Jam-tin bomb");
});
