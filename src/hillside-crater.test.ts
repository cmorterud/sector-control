import { describe, expect, it } from "vitest";
import { gallipoliMap } from "./gallipoli-map";
import { groundHeight, hillHeight, terrainResolution } from "./map";
import { Game, TestCollision } from "./simulation";
import { ambientArtilleryExplosionProfile, artilleryExplosionProfile, grenadeExplosionProfile, type ExplosionProfile } from "./destruction";
import { navalExplosionProfile } from "./naval-gunfire";

// Gallipoli's ground stands on a hillside (terrain.hill). A crater there is
// shaped against the slope it falls on: before, the slope itself read as a
// ledge to the crater rules, and one bomb on a steep spur cut a scar tens of
// metres long and over 3 m deep, which also stalled the tick it fell on.
const slopes: [number, number][] = [[24, -12.4], [-18.7, -24.6], [-65.3, 36.9]];

function blast(x: number, z: number, profile: ExplosionProfile) {
  const map = gallipoliMap;
  const g = new Game(new TestCollision(map), true, 100, 1, undefined, { map, teamSize: 1, ambientArtillery: false });
  g.explode({ x, y: groundHeight(x, z, g.map) + 0.1, z }, -1, null, profile);
  let cells = 0, reach = 0;
  for (const [key, depth] of Object.entries(g.map.destruction!.cuts)) {
    if (!depth) continue;
    const [cx, cz] = key.split(",").map(Number);
    cells++;
    reach = Math.max(reach, Math.hypot(cx * terrainResolution - x, cz * terrainResolution - z));
  }
  return { cells, reach };
}

describe("craters on a hillside", () => {
  it("are steep ground, not a ledge", () => {
    for (const [x, z] of slopes) {
      const rise = Math.hypot(hillHeight(x + 1, z, gallipoliMap) - hillHeight(x - 1, z, gallipoliMap), hillHeight(x, z + 1, gallipoliMap) - hillHeight(x, z - 1, gallipoliMap)) / 2;
      expect(rise).toBeGreaterThan(0.45);
    }
  });

  it.each([
    ["a grenade", grenadeExplosionProfile],
    ["a field shell", artilleryExplosionProfile],
    ["a naval shell", navalExplosionProfile],
    ["a stray heavy shell", ambientArtilleryExplosionProfile],
  ] as const)("stay round the point of impact for %s", (_, profile) => {
    for (const [x, z] of slopes) {
      const { cells, reach } = blast(x, z, profile);
      expect(cells).toBeGreaterThan(0);
      // The shaped crater reaches a little past its nominal radius; a trench
      // wall in range adds a bank cut within the blast radius.
      expect(reach).toBeLessThan(Math.max(profile.craterRadius * 1.6, 3) + 3);
      expect(cells).toBeLessThan(1600);
    }
  });
});
