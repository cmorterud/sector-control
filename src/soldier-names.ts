import { factionFor } from "./loadouts";
import type { Game, Soldier } from "./simulation";

const british = {
  initials: "AEJTWCRH",
  surnames: [
    "Smith", "Taylor", "Wilson", "Brown", "Davies", "Evans", "Walker", "Wright", "Thompson",
    "Green", "Roberts", "Hall", "Clarke", "Wood", "Hughes", "Lewis", "Turner", "Harris",
    "Jackson", "Cooper", "Hill", "Ward", "Morris", "Baker", "Cook",
  ],
};
const french = {
  initials: "JPLMECAH",
  surnames: [
    "Martin", "Bernard", "Thomas", "Petit", "Robert", "Richard", "Durand", "Dubois", "Moreau",
    "Laurent", "Simon", "Michel", "Lefèvre", "Leroy", "Roux", "David", "Bertrand", "Morel",
    "Fournier", "Girard", "Bonnet", "Dupont", "Lambert", "Fontaine", "Rousseau",
  ],
};
const german = {
  initials: "FWHOKEGP",
  surnames: [
    "Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Hoffmann",
    "Schulz", "Koch", "Bauer", "Richter", "Klein", "Wolf", "Neumann", "Schwarz", "Zimmermann",
    "Braun", "Krüger", "Hofmann", "Hartmann", "Lange", "König", "Werner",
  ],
};
const pools = { british, french, german, trainingBlue: british, trainingRed: german };

export function soldierName(p: Soldier, map: Game["map"]): string {
  if (p.id === 0) return "YOU";
  const { initials, surnames } = pools[p.faction ?? factionFor(map, p.team)];
  const surname = surnames[p.teamIndex % surnames.length];
  // Stable across respawns. Each pass through the surname list uses different initials.
  const initial = initials[(p.teamIndex % surnames.length + Math.floor(p.teamIndex / surnames.length)) % initials.length];
  return `${initial}. ${surname}`;
}
