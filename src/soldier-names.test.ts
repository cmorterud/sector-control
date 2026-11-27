import { expect, test } from "vitest";
import { soldierName } from "./soldier-names";
import { industrialMap } from "./map";
import type { Soldier } from "./simulation";

const soldier = (faction: Soldier["faction"], teamIndex: number) => ({ id: 1 + teamIndex, teamIndex, team: "blue", faction }) as Soldier;
test("ANZAC soldiers have Australian and New Zealand names, Ottoman soldiers are named by their fathers", () => {
  expect(soldierName(soldier("anzac", 0), industrialMap)).toMatch(/^[A-Z]\. \S/);
  const ottoman = Array.from({ length: 50 }, (_, i) => soldierName(soldier("ottoman", i), industrialMap));
  for (const name of ottoman) {
    expect(name).toMatch(/^\S+ oğlu \S+$/);
    // Never "Mehmed oğlu Mehmed".
    const [father, , own] = name.split(" ");
    expect(father).not.toBe(own);
  }
  expect(new Set(ottoman).size).toBe(50);
});
