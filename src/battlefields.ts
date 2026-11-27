import { ctfMap, supportsCtf } from "./ctf";
import { dominationMap } from "./offensive";
import { fortVauxMap } from "./fort-vaux-map";
import { gallipoliMap } from "./gallipoli-map";
import { headlandMap } from "./headland-map";
import type { MapDefinition } from "./map";
import { nightRaidMap } from "./night-map";
import { springOffensiveMap } from "./spring-offensive-map";
import { trainingMap } from "./training-map";
import { trenchMap } from "./trench-map";
import { verdunMap } from "./verdun-map";
import { villageMap } from "./village-map";
import { zeppelinMap } from "./zeppelin-map";

// Maps offered in the briefing, in card order. Industrial is no longer
// offered, but ?map=industrial still opens it for the CI combat and Armory
// browser checks. A new map added here is picked up by the bot progress
// tests (src/bot-progress-suite.ts) on every mode battleModes lists for it.
export const battlefields: readonly MapDefinition[] = [fortVauxMap, zeppelinMap, trainingMap, trenchMap, nightRaidMap, villageMap, verdunMap, springOffensiveMap, gallipoliMap, headlandMap];

export interface BattleMode {
  // The ?mode= value, or "default" for the map's own scoring.
  id: string;
  map: MapDefinition;
}
// Every mode a battlefield can be played in. A new mode belongs here as well
// as in the briefing, so the bot progress tests play it.
export function battleModes(map: MapDefinition): BattleMode[] {
  return [
    { id: "default", map },
    // A map that plans an attack (src/offensive.ts) is also played as domination.
    ...(map.offensive ? [{ id: "domination", map: dominationMap(map) }] : []),
    ...(supportsCtf(map) ? [{ id: "ctf", map: ctfMap(map) }] : []),
  ];
}
