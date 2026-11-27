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
// Australians and New Zealanders, with a few names from the Māori Contingent
// that reached Anzac in July 1915.
const anzac = {
  initials: "JWAHGTCR",
  surnames: [
    "Murphy", "Kelly", "Ryan", "Campbell", "Stewart", "Macdonald", "Robertson", "Anderson", "Mitchell",
    "Kennedy", "Fraser", "Sullivan", "McKenzie", "Walsh", "Hunter", "Reid", "Morrison", "Tamihana",
    "O'Brien", "Gallagher", "Scott", "Paewai", "Ross", "Bell", "Rangi",
  ],
};
// Ottoman soldiers had no surnames until 1934; records named a man by his
// father, "Mehmed oğlu Ali": Ali, son of Mehmed.
const ottoman = {
  fathers: ["Mehmed", "Ahmed", "Hüseyin", "Mustafa", "İbrahim", "Osman", "Halil", "Yusuf"],
  names: [
    "Ali", "Hasan", "Mehmed", "Ahmed", "Hüseyin", "Mustafa", "İsmail", "Osman", "Süleyman",
    "Halil", "Ömer", "Yusuf", "Salih", "Recep", "Musa", "Ramazan", "Abdullah", "Hamdi",
    "Kâzım", "Rıza", "Şükrü", "Nuri", "Hakkı", "Veli", "Bekir",
  ],
};
const pools = { british, french, german, anzac, trainingBlue: british, trainingRed: german };

export function soldierName(p: Soldier, map: Game["map"]): string {
  if (p.id === 0) return "YOU";
  const faction = p.faction ?? factionFor(map, p.team);
  if (faction === "ottoman") {
    const name = ottoman.names[p.teamIndex % ottoman.names.length];
    const father = ottoman.fathers[(p.teamIndex % ottoman.names.length + Math.floor(p.teamIndex / ottoman.names.length)) % ottoman.fathers.length];
    return `${father === name ? ottoman.fathers[(ottoman.fathers.indexOf(father) + 1) % ottoman.fathers.length] : father} oğlu ${name}`;
  }
  const { initials, surnames } = pools[faction];
  const surname = surnames[p.teamIndex % surnames.length];
  // Stable across respawns. Each pass through the surname list uses different initials.
  const initial = initials[(p.teamIndex % surnames.length + Math.floor(p.teamIndex / surnames.length)) % initials.length];
  return `${initial}. ${surname}`;
}
