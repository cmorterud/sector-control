import type { MapDefinition } from "./map";
import { publicAsset } from "./public-assets";
export const battlefieldInfo = {
  "fort-vaux": { setting: "Verdun · 1916", factions: "France · Imperial Germany", description: "Fight through flooded chambers and vaulted galleries for three flags. No artillery." },
  training: {setting:"Field training camp",factions:"British, French & German equipment",description:"Eight guided exercises: movement, every weapon, grenades, bayonets, artillery, destruction and squad combat. Free practice and resettable stations."},
  verdun: {setting:"Verdun-inspired · 1917", factions:"France · Imperial Germany", description:"An extended forest front with five flags and the ruined Broken Relay at its center."},
  industrial: { setting: "Industrial skirmish", factions: "Training teams", description: "Close lanes and industrial cover. Three control points." },
  trenches: { setting: "Western Front · 1917", factions: "Britain · Imperial Germany", description: "Flooded farmland, broken farmyards and exposed trench crossings. Four flags." },
  "night-raid": { setting: "Western Front · 1917", factions: "Britain · Imperial Germany", description: "Trench front after dark. You see fifteen meters; lamps, flares and shell bursts show the rest. Four flags." },
  headland: { setting: "Atlantic coast · 1917", factions: "France · Imperial Germany", description: "Greybox preview. A lighthouse headland with a town square between cliff-top parks. Three flags." },
  village: { setting: "Western Front · 1917", factions: "Britain · Imperial Germany", description: "Nine village buildings, sheltered gardens and a destructible two-story manor. Five flags, including the manor." },
};
export function battlefieldCard(map: MapDefinition, href?: string) {
  const info = battlefieldInfo[map.id];
  const overview=!!map.buildings&&map.id!=="village"&&!map.fort,extension=map.id==="village"?"png":overview?"svg":"jpg";
  const roster = map.id === "fort-vaux" ? `Indoor ${map.defaultTeamSize}v${map.defaultTeamSize}. ` : "";
  const content = `<img src="${publicAsset(`previews/${map.id}.${extension}`)}" alt="${map.name} ${overview ? "layout overview" : "battlefield"}" width="320" height="180" loading="lazy"><strong>${map.name}</strong><small>${info.setting} · ${info.factions}</small><p>${roster}${info.description}</p>`;
  return href ? `<a data-battlefield="${map.id}" href="${href}">${content}</a>` : `<span data-battlefield="${map.id}" aria-current="page">${content}</span>`;
}
