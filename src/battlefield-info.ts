import type { MapDefinition } from "./map";
export const battlefieldInfo = {
  verdun: {setting:"Verdun-inspired · 1917", factions:"France · Imperial Germany", description:"An extended forest front with five flags and the ruined Broken Relay at its center."},
  industrial: { setting: "Training ground", factions: "Training teams", description: "Close lanes and industrial cover. Three control points." },
  trenches: { setting: "Western Front · 1917", factions: "Britain · Imperial Germany", description: "Flooded farmland, broken farmyards and exposed trench crossings. Four flags." },
  headland: { setting: "Atlantic coast · 1917", factions: "France · Imperial Germany", description: "Greybox preview. A lighthouse headland with a town square between cliff-top parks. Three flags." },
  village: { setting: "Western Front · 1917", factions: "Britain · Imperial Germany", description: "Nine village buildings, sheltered gardens and a destructible two-story manor. Five flags, including the manor." },
};
export function battlefieldCard(map: MapDefinition, href?: string) {
  const info = battlefieldInfo[map.id];
  const content = `<img src="/previews/${map.id}.${map.buildings ? "svg" : "jpg"}" alt="${map.name} ${map.buildings ? "layout overview" : "battlefield"}" width="320" height="180" loading="lazy"><strong>${map.name}</strong><small>${info.setting} · ${info.factions}</small><p>${info.description}</p>`;
  return href ? `<a href="${href}">${content}</a>` : `<span aria-current="page">${content}</span>`;
}
