import type { MapDefinition } from "./map";
import { publicAsset } from "./public-assets";
import { supportsTanks } from "./tanks";
export const battlefieldInfo = {
  "fort-vaux": { setting: "Verdun · 1916", factions: "France · Imperial Germany", description: "Fight through flooded chambers and vaulted galleries for three flags. No artillery." },
  zeppelin: { setting: "Western Front · 1917", factions: "France · Imperial Germany", description: "Board a German airship adrift above the clouds at dusk. Fight along its keel, gallery and top walk for both engine stations and the bomb bay. No artillery." },
  training: {setting:"Field training camp",factions:"British, French & German equipment",description:"Eight guided exercises: movement, every weapon, grenades, bayonets, artillery, destruction and squad combat. Free practice and resettable stations."},
  verdun: {setting:"Verdun · June 1916", factions:"France · Imperial Germany", description:"Fleury and Thiaumont under a phosgene barrage: cratered woods, five flags and the Thiaumont crossroads at the center."},
  industrial: { setting: "Industrial skirmish", factions: "Training teams", description: "Close lanes and industrial cover. Three control points." },
  trenches: { setting: "Ypres salient · August 1917", factions: "Britain · Imperial Germany", description: "Frezenberg, east of Ypres: flooded farmland, farm pillboxes and exposed trench crossings. Four flags." },
  "night-raid": { setting: "Ypres salient · 1917", factions: "Britain · Imperial Germany", description: "Ypres after dark. You see fifteen meters; lamps, flares and shell bursts show the rest. Four flags." },
  headland: { setting: "Atlantic coast · 1917", factions: "France · Imperial Germany", description: "Graybox preview. A lighthouse headland with a town square between cliff-top parks. Three flags." },
  "spring-offensive": { setting: "St. Quentin · March 1918", factions: "Britain · Imperial Germany", description: "Three trench lines a side in morning fog: a ruined village, a hill redoubt, a chalk quarry and a tank lane. Germany attacks the forward zone, then the battle zone; also seven-flag domination." },
  gallipoli: { setting: "Anzac · August 1915", factions: "ANZAC · Ottoman Empire", description: "Graybox preview. Climb from the beach through scrub gullies to the Nek, Lone Pine and the summit of Chunuk Bair, 45 m above the sea. Six flags; no gas, no tanks." },
  village: { setting: "Western Front · 1917", factions: "Britain · Imperial Germany", description: "Nine village buildings, sheltered gardens and a destructible two-story manor. Five flags, including the manor." },
};
export function battlefieldCard(map: MapDefinition, href?: string) {
  const info = battlefieldInfo[map.id];
  const roster = map.id === "fort-vaux" ? `Indoor ${map.defaultTeamSize}v${map.defaultTeamSize}. ` : map.sky ? `Airship ${map.defaultTeamSize}v${map.defaultTeamSize}. ` : "";
  // Maps that field tanks say so on their card, over the preview image.
  const tanks = supportsTanks(map) ? `<em class="tank-badge">TANKS</em>` : "";
  const content = `${tanks}<img src="${publicAsset(`previews/${map.id}.jpg`)}" alt="${map.name} battlefield" width="320" height="180" loading="lazy"><strong>${map.name}</strong><small>${info.setting} · ${info.factions}</small><p>${roster}${info.description}</p>`;
  return href ? `<a data-battlefield="${map.id}" href="${href}">${content}</a>` : `<span data-battlefield="${map.id}" aria-current="page">${content}</span>`;
}
