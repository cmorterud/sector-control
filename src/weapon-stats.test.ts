import { expect, it } from "vitest";
import { factions } from "./loadouts";
import { armouryFactions, gameMuzzleVelocity, hitZones, shotsToKill, soldierHealth, timeToKill, weaponStats } from "./weapon-stats";

it("gives every Armoury faction a rifle, scoped rifle, pistol and machine gun", () => {
  for (const f of armouryFactions) {
    expect(factions[f].name).toBeTruthy();
    expect(weaponStats.filter(w => w.faction === f).map(w => w.role).sort()).toEqual(["machineGun", "pistol", "rifle", "scoped"]);
  }
  expect(new Set(weaponStats.map(w => w.id)).size).toBe(weaponStats.length);
});

it("follows the damage design rules", () => {
  for (const w of weaponStats) {
    for (const z of hitZones) expect(w.damage[z.id]).toBeGreaterThan(0);
    // Limbs always take less than the stomach, and the stomach less than the chest.
    expect(w.damage.arms).toBeLessThan(w.damage.stomach);
    expect(w.damage.legs).toBeLessThan(w.damage.stomach);
    expect(w.damage.stomach).toBeLessThanOrEqual(w.damage.chest);
    if (w.role === "rifle" || w.role === "scoped") {
      // A rifle to the head or chest always kills; anywhere else takes two or more.
      expect(shotsToKill(w, "head")).toBe(1);
      expect(shotsToKill(w, "chest")).toBe(1);
      expect(shotsToKill(w, "stomach")).toBe(2);
    } else {
      expect(shotsToKill(w, "chest")).toBeGreaterThanOrEqual(3);
      expect(shotsToKill(w, "chest")).toBeLessThanOrEqual(4);
    }
  }
});

it("derives hits and time to kill, and game velocity, from the stats", () => {
  const vickers = weaponStats.find(w => w.id === "vickers")!;
  expect(shotsToKill(vickers, "chest")).toBe(Math.ceil(soldierHealth / 38));
  expect(timeToKill(vickers, "chest")).toBeCloseTo((3 - 1) * 60 / 450, 6);
  expect(timeToKill(weaponStats.find(w => w.id === "smle")!, "chest")).toBe(0);
  expect(gameMuzzleVelocity(weaponStats.find(w => w.id === "smle")!)).toBe(192);
  const fastest = [...weaponStats].sort((a, b) => gameMuzzleVelocity(b) - gameMuzzleVelocity(a))[0];
  expect(fastest.faction).toBe("german");
});
