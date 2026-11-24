// Night raid: Trench front's ground after dark. The trenches, wire and flags
// are the same, so a soldier who knows the day map can find the way by memory.
// What changes is how far anyone can see (src/night.ts) and the size of the fight.
import type { MapDefinition } from "./map";
import { trenchMap } from "./trench-map";

export const nightRaidMap: MapDefinition = {
  ...trenchMap,
  id: "night-raid",
  name: "Night raid",
  // Night fighting was raiding parties, not battalions.
  defaultTeamSize: 24,
  night: { sight: 15 },
};
