// Ypres at night: Ypres's ground after dark. The trenches, wire and flags
// are the same, so a soldier who knows the day map can find the way by memory.
// What changes is how far anyone can see (src/night.ts); the fight is the
// same size as by day, 50 a side across the full 160 m sector.
import type { MapDefinition } from "./map";
import { trenchMap } from "./trench-map";

export const nightRaidMap: MapDefinition = {
  ...trenchMap,
  id: "night-raid",
  name: "Ypres at night",
  night: { sight: 15 },
};
