// The player's soldier on paper: each life is a named man of a real unit that
// fought on (or, on the invented maps, in the kind of action fought on) that
// ground. Presentation only: nothing here changes a rule.
import { factionFor, type FactionId } from "./loadouts";
import { anzac, british, french, german, ottoman } from "./soldier-names";
import type { Game, Team } from "./simulation";

// private: what the unit called its private soldier (rank titles differ by arm).
type Unit = { name: string; formation: string; private?: string };
type Side = { division: string; units: Unit[] };
type Setting = { place: string; date?: string; sides: Partial<Record<FactionId, Side>> };

// Sources and caveats are listed in docs/SOLDIER_RECORD.md.
const ypres1917: Setting["sides"] = {
  british: {
    division: "16th (Irish) Division",
    units: [
      { name: "9th Bn, Royal Dublin Fusiliers", formation: "48th Brigade, 16th (Irish) Division" },
      { name: "8th Bn, Royal Inniskilling Fusiliers", formation: "49th Brigade, 16th (Irish) Division" },
      { name: "7th/8th Bn, Royal Irish Fusiliers", formation: "49th Brigade, 16th (Irish) Division" },
      { name: "2nd Bn, Royal Irish Regiment", formation: "49th Brigade, 16th (Irish) Division" },
    ],
  },
  german: {
    division: "12. Reserve-Division",
    units: [
      { name: "Reserve-Infanterie-Regiment Nr. 23", formation: "12. Reserve-Division", private: "Reservist" },
      { name: "Reserve-Infanterie-Regiment Nr. 38", formation: "12. Reserve-Division", private: "Reservist" },
      { name: "Reserve-Infanterie-Regiment Nr. 51", formation: "12. Reserve-Division", private: "Reservist" },
    ],
  },
};
const settings: Record<string, Setting> = {
  trenches: { place: "Frezenberg", date: "16 August 1917", sides: ypres1917 },
  "night-raid": { place: "Ypres salient", date: "August 1917", sides: ypres1917 },
  verdun: {
    place: "Fleury", date: "23 June 1916",
    sides: {
      french: {
        division: "121e bataillon de chasseurs à pied",
        units: [{ name: "121e bataillon de chasseurs à pied", formation: "Verdun, rive droite", private: "Chasseur" }],
      },
      german: {
        division: "Alpenkorps",
        units: [
          { name: "Königlich Bayerisches Infanterie-Leib-Regiment", formation: "Alpenkorps", private: "Infanterist" },
          { name: "Jäger-Regiment Nr. 2", formation: "Alpenkorps", private: "Jäger" },
        ],
      },
    },
  },
  "fort-vaux": {
    place: "Fort Vaux", date: "June 1916",
    sides: {
      french: {
        division: "Garrison of Commandant Raynal",
        units: [
          { name: "6e compagnie, 142e régiment d'infanterie", formation: "Garnison du fort de Vaux" },
          { name: "3e compagnie de mitrailleurs, 142e régiment d'infanterie", formation: "Garnison du fort de Vaux" },
          { name: "101e régiment d'infanterie", formation: "Garnison du fort de Vaux" },
          { name: "3e compagnie de mitrailleurs, 53e régiment d'infanterie", formation: "Garnison du fort de Vaux" },
        ],
      },
      german: {
        division: "50. Infanterie-Division",
        units: [
          { name: "Niederrheinisches Füsilier-Regiment Nr. 39", formation: "50. Infanterie-Division", private: "Füsilier" },
          { name: "Infanterie-Regiment Nr. 158", formation: "50. Infanterie-Division" },
        ],
      },
    },
  },
  gallipoli: {
    place: "Anzac", date: "August 1915",
    sides: {
      anzac: {
        division: "Australian and New Zealand Army Corps",
        units: [
          { name: "2nd Battalion, AIF", formation: "1st Australian Brigade" },
          { name: "3rd Battalion, AIF", formation: "1st Australian Brigade" },
          { name: "4th Battalion, AIF", formation: "1st Australian Brigade" },
          { name: "8th Light Horse Regiment", formation: "3rd Light Horse Brigade", private: "Tpr." },
          { name: "10th Light Horse Regiment", formation: "3rd Light Horse Brigade", private: "Tpr." },
          { name: "Wellington Battalion", formation: "New Zealand Infantry Brigade" },
          { name: "Auckland Battalion", formation: "New Zealand Infantry Brigade" },
        ],
      },
      ottoman: {
        division: "Ottoman Fifth Army",
        units: [
          { name: "47. Alay (47th Regiment)", formation: "16. Tümen" },
          { name: "125. Alay (125th Regiment)", formation: "16. Tümen" },
          { name: "18. Alay (18th Regiment)", formation: "19. Tümen" },
          { name: "57. Alay (57th Regiment)", formation: "19. Tümen" },
        ],
      },
    },
  },
  "spring-offensive": {
    place: "St Quentin front", date: "21 March 1918",
    sides: {
      british: {
        division: "30th Division",
        units: [
          { name: "16th Bn, Manchester Regiment", formation: "90th Brigade, 30th Division" },
          { name: "17th Bn, Manchester Regiment", formation: "90th Brigade, 30th Division" },
          { name: "2nd Bn, Wiltshire Regiment", formation: "21st Brigade, 30th Division" },
          { name: "2nd Bn, Bedfordshire Regiment", formation: "89th Brigade, 30th Division" },
        ],
      },
      german: {
        division: "111. Infanterie-Division",
        units: [
          { name: "Füsilier-Regiment Nr. 73", formation: "111. Infanterie-Division", private: "Füsilier" },
          { name: "Infanterie-Regiment Nr. 76", formation: "111. Infanterie-Division" },
          { name: "Infanterie-Regiment Nr. 164", formation: "111. Infanterie-Division" },
        ],
      },
    },
  },
  village: {
    place: "Saint-Martin", date: "August 1914",
    sides: {
      british: {
        division: "3rd Division, BEF",
        units: [
          { name: "4th Bn, Royal Fusiliers", formation: "9th Brigade, 3rd Division" },
          { name: "1st Bn, Royal Scots Fusiliers", formation: "9th Brigade, 3rd Division" },
        ],
      },
      german: {
        division: "III. Armee-Korps",
        units: [
          { name: "Grenadier-Regiment Nr. 12", formation: "5. Infanterie-Division", private: "Grenadier" },
          { name: "Infanterie-Regiment Nr. 84", formation: "18. Infanterie-Division" },
        ],
      },
    },
  },
  headland: {
    place: "Flanders coast", date: "1915",
    sides: {
      french: {
        division: "Brigade de fusiliers marins",
        units: [
          { name: "1er régiment de fusiliers marins", formation: "Brigade de fusiliers marins", private: "Matelot" },
          { name: "2e régiment de fusiliers marins", formation: "Brigade de fusiliers marins", private: "Matelot" },
        ],
      },
      german: {
        division: "Marinekorps Flandern",
        units: [
          { name: "Matrosen-Regiment Nr. 1", formation: "1. Marine-Division", private: "Matrose" },
          { name: "Matrosen-Regiment Nr. 2", formation: "1. Marine-Division", private: "Matrose" },
        ],
      },
    },
  },
  zeppelin: {
    place: "Above the clouds", date: "October 1917",
    sides: {
      french: {
        division: "Brigade de fusiliers marins",
        units: [{ name: "1er régiment de fusiliers marins", formation: "Brigade de fusiliers marins", private: "Matelot" }],
      },
      german: {
        division: "Marine-Luftschiff-Abteilung",
        units: [{ name: "Besatzung L 49", formation: "Marine-Luftschiff-Abteilung", private: "Matrose" }],
      },
    },
  },
  industrial: {
    place: "Training ground",
    sides: {
      trainingBlue: { division: "Training Reserve", units: [{ name: "Training Reserve", formation: "Cannock Chase Camp" }] },
      trainingRed: { division: "Rekrutendepot", units: [{ name: "Rekrutendepot", formation: "Truppenübungsplatz Döberitz", private: "Rekrut" }] },
    },
  },
};
// A side whose army the map does not field (the ?factions= override) takes its
// army's usual unit list.
const fallback: Record<FactionId, () => Side> = {
  british: () => ypres1917.british!, german: () => ypres1917.german!,
  french: () => settings["fort-vaux"].sides.french!, anzac: () => settings.gallipoli.sides.anzac!,
  ottoman: () => settings.gallipoli.sides.ottoman!,
  trainingBlue: () => settings.industrial.sides.trainingBlue!, trainingRed: () => settings.industrial.sides.trainingRed!,
};
type Ranks = { private: string; others: string[] };
const ranks: Record<FactionId, Ranks> = {
  british: { private: "Pte.", others: ["L/Cpl.", "Cpl.", "Sgt."] },
  anzac: { private: "Pte.", others: ["L/Cpl.", "Cpl.", "Sgt."] },
  french: { private: "Soldat", others: ["Caporal", "Sergent"] },
  german: { private: "Musketier", others: ["Gefreiter", "Unteroffizier"] },
  ottoman: { private: "Nefer", others: ["Onbaşı", "Çavuş"] },
  trainingBlue: { private: "Recruit", others: ["L/Cpl."] },
  trainingRed: { private: "Rekrut", others: ["Gefreiter"] },
};
// Companies as each army wrote them.
const company = (faction: FactionId, n: number) =>
  faction === "british" || faction === "anzac" || faction === "trainingBlue" ? `${"ABCD"[n % 4]} Coy`
  : faction === "french" ? `${n % 4 + 1}e Cie`
  : faction === "ottoman" ? `${n % 3 + 1}. Tabur`
  : `${n % 12 + 1}. Kompanie`;

export type SoldierIdentity = {
  life: number; faction: FactionId;
  rank: string; name: string; number?: string;
  unit: string; company?: string; formation: string;
  // How this life ended, once it has.
  fate?: { kind: "killed" | "redeployed"; place: string };
};

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length) % list.length];

export function setting(map: { id: string; name: string }) {
  return settings[map.id] ?? { place: map.name, sides: {} };
}
export function sideFor(map: { id: string; name: string }, team: Team): Side & { faction: FactionId } {
  const faction = factionFor(map, team);
  return { faction, ...(setting(map).sides[faction] ?? fallback[faction]()) };
}

// The same seed and life always give the same soldier.
export function soldierIdentity(map: { id: string; name: string }, team: Team, seed: number, life: number): SoldierIdentity {
  const r = random(seed * 1013 + life * 7919 + 17);
  const side = sideFor(map, team), faction = side.faction;
  const unit = pick(r, side.units);
  const rankRoll = r(), titles = ranks[faction];
  const rank = rankRoll < 0.72 ? unit.private ?? titles.private : titles.others[Math.min(titles.others.length - 1, Math.floor((rankRoll - 0.72) / 0.28 * titles.others.length))];
  let name: string;
  if (faction === "ottoman") {
    const own = pick(r, ottoman.names);
    const father = pick(r, ottoman.fathers.filter((f) => f !== own));
    name = `${father} oğlu ${own}`;
  } else {
    const pool = faction === "french" ? french : faction === "german" || faction === "trainingRed" ? german : faction === "anzac" ? anzac : british;
    name = `${pick(r, pool.initials.split(""))}. ${pick(r, pool.surnames)}`;
  }
  // British and Dominion soldiers were known by a regimental number.
  const number = faction === "british" || faction === "anzac" ? String(1000 + Math.floor(r() * 49000)) : undefined;
  // A unit already named down to the company keeps its own.
  const coy = /compagnie|Besatzung|Rekrut|Training/.test(unit.name) ? undefined : company(faction, Math.floor(r() * 12));
  return { life, faction, rank, name, number, unit: unit.name, company: coy, formation: unit.formation };
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const soldierTitle = (s: SoldierIdentity) => `${s.rank} ${s.number ? s.number + " " : ""}${s.name}`;
export const soldierUnit = (s: SoldierIdentity) => `${s.company ? s.company + ", " : ""}${s.unit}`;

// Where a soldier fell, for the note: the nearest named flag.
export function placeOfDeath(g: Game, at: { x: number; z: number }) {
  let best: { id: string; name?: string } | undefined, d = Infinity;
  for (const s of g.sectors) {
    const k = Math.hypot(s.x - at.x, s.z - at.z);
    if (k < d) { d = k; best = s; }
  }
  if (!best) return setting(g.map).place;
  return best.name ? best.name : `flag ${best.id}`;
}

// Shown for a few seconds as each life deploys.
export function deployNotice(s: SoldierIdentity) {
  return `<small>${s.life ? "REPLACEMENT · " : ""}DEPLOYING</small><strong>${escape(soldierTitle(s))}</strong><span>${escape(soldierUnit(s))} · ${escape(s.formation)}</span>`;
}

// The head of the death card: what the battalion clerk would have written.
export function casualtyNote(s: SoldierIdentity, map: { id: string; name: string }) {
  const where = setting(map), killed = s.fate?.kind !== "redeployed";
  return `<div class="casualty-note"><small>CASUALTY NOTE · ${escape(where.place.toUpperCase())}${where.date ? " · " + escape(where.date.toUpperCase()) : ""}</small><strong>${escape(soldierTitle(s))}</strong><span>${escape(soldierUnit(s))}</span><em>${killed ? `Killed in action${s.fate ? " near " + escape(s.fate.place) : ""}.` : "Struck off strength: returned to the line."}</em></div>`;
}

// The briefing's head: an operation order addressed to the first life.
export function operationOrderHead(s: SoldierIdentity, map: { id: string; name: string }, seed: number) {
  const where = setting(map);
  return `<div class="op-order"><small>SECRET · OPERATION ORDER No. ${seed % 47 + 3}</small><p><b>To</b> ${escape(soldierTitle(s))}, ${escape(soldierUnit(s))} · ${escape(s.formation)}</p><p><b>Ref.</b> ${escape(where.place)}${where.date ? ", " + escape(where.date) : ""}</p></div>`;
}
export const orderHeadings = { intention: "1 · INTENTION", method: "2 · METHOD", administration: "3 · ADMINISTRATION", tanks: "4 · TANKS" };

// The match's end: each side's losses and the player's own lives.
export function casualtyReturn(g: Game, lives: SoldierIdentity[]) {
  const where = setting(g.map);
  const row = (team: Team) => {
    const side = sideFor(g.map, team), men = g.players.filter((p) => p.team === team);
    const fallen = men.reduce((n, p) => n + p.deaths, 0);
    return `<tr class="${team}"><th scope="row">${escape(side.division)}</th><td>${men.length}</td><td>${fallen}</td></tr>`;
  };
  const record = lives.map((s) => `<li><b>${escape(soldierTitle(s))}</b>, ${escape(soldierUnit(s))}: ${s.fate ? s.fate.kind === "killed" ? "killed in action near " + escape(s.fate.place) : "struck off strength" : "survived the action"}</li>`).join("");
  return `<section class="casualty-return" aria-label="Casualty return"><small>CASUALTY RETURN · ${escape(where.place.toUpperCase())}${where.date ? " · " + escape(where.date.toUpperCase()) : ""}</small><table><thead><tr><th></th><th scope="col">Strength</th><th scope="col">Casualties</th></tr></thead><tbody>${row(g.players[0]?.team ?? "blue")}${row(g.players[0]?.team === "red" ? "blue" : "red")}</tbody></table>${lives.length ? `<small>YOUR SERVICE IN THIS ACTION</small><ol>${record}</ol>` : ""}</section>`;
}
