// The trench mortar kit's tubes and balance (src/mortar.ts runs them). One
// tube per army, set up like the emplaced machine gun and fired one bomb at a
// time, one trench line ahead: a small, precise strike where artillery is a
// wide one.
import type { FactionId } from "./loadouts";
import type { ExplosionProfile } from "./destruction";

export interface MortarStats {
  id: string;
  name: string;
  faction: FactionId;
  bomb: string;
  // Real service details, for the Armory.
  historical: { calibre: string; range: string; note: string };
  summary: string;
}

export const mortarStats: MortarStats[] = [
  {
    id: "stokes", name: "Stokes 3-inch mortar", faction: "british", bomb: "3-inch HE bomb",
    historical: { calibre: "81 mm (3 in)", range: "about 700 m", note: "Wilfred Stokes' smooth-bore tube, in service from 1916. A bomb dropped down the barrel fired itself on the firing pin; good crews had several in the air at once." },
    summary: "A light tube and baseplate. Drops a bomb every two seconds into the next trench line.",
  },
  {
    id: "granatenwerfer", name: "Granatenwerfer 16", faction: "german", bomb: "Finned 1.9 kg bomb",
    historical: { calibre: "Spigot, 1.9 kg bomb", range: "about 300 m", note: "A small spigot bomb thrower adopted in 1916, light enough for one man to carry forward. The heavier Minenwerfer needed a crew." },
    summary: "A one-man spigot thrower. The same reach and blast as the other tubes.",
  },
  {
    id: "crapouillot", name: "Mortier de 58 mm T No. 2", faction: "french", bomb: "Finned 58 mm bomb",
    historical: { calibre: "58 mm, over-calibre bomb", range: "about 450 m", note: "The \"crapouillot\" fired a large finned bomb from a short tube. The real one was a crew weapon; here one soldier carries a lightened tube." },
    summary: "France's trench tube, lightened for one soldier. The same reach and blast as the other tubes.",
  },
];

export const mortarFor = (faction: FactionId | undefined) =>
  mortarStats.find(m => m.faction === faction) ?? mortarStats[0];
export const isMortarWeapon = (name: string) => mortarStats.some(m => m.name === name);

export const mortarRules = {
  // One trench line ahead: never under the bomb's arming distance, never at the rear.
  minRange: 40,
  maxRange: 80,
  startRange: 60,
  // W/S (or a bot's order) wind the range card in or out this fast, in metres per second.
  rangeRate: 12,
  bombs: 7,
  // A bomb down the tube every two seconds.
  loadTicks: 60,
  // A high lob: 2.5 s at the shortest range, 4 s at the longest.
  flightTicks: [75, 120] as const,
  gravity: 9.8,
  // Bombs land inside this ring around the aim point when the tube has settled (m).
  spread: 1.5,
  // The ring blooms when the tube is turned, the range changed or a bomb fired,
  // then settles back over a couple of seconds.
  bloomMax: 5,
  bloomPerRadian: 6,
  bloomPerMetre: 0.12,
  bloomPerShot: 1.6,
  bloomSettle: 2.2,
  // The bomb's whistle is heard this long before it lands.
  whistleTicks: 36,
  // Aim points this close to either side's deployment line are refused.
  spawnClearance: 34,
  // The tube's mouth above its baseplate, and where the bomb leaves it.
  muzzleHeight: 0.9,
  // How far behind the baseplate the mortarman kneels.
  operatorOffset: 0.75,
};

// Between a grenade (7 m, 140) and an artillery shell (9 m, 240). Bombs hurt
// either side: a short round in a crowded trench is a real risk.
export const mortarExplosionProfile: ExplosionProfile = {
  kind: "mortar",
  radius: 8,
  damage: 190,
  partialCover: true,
  friendlyFire: true,
  structuralRadius: 3,
  structuralDamage: 160,
  craterRadius: 1.2,
  craterDepth: 0.6,
  terrainReach: 2.5,
  bankDepth: 0.9,
  craterVariation: 0.12,
};
