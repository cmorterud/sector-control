import { factionFor, type FactionId } from "./loadouts";
import type { MapDefinition } from "./map";

// How a side's hand bomb looks and what the kill feed calls it. Everywhere
// but Gallipoli it is the usual fragmentation grenade. At Anzac in 1915 the
// ANZACs made their own from jam tins packed with explosive and scrap, lit
// from a fuse; the Ottomans threw round cast-iron bombs the ANZACs called
// cricket balls.
export interface GrenadeLook {
  name: string;
  shape: "egg" | "tin" | "ball";
  body: string;
  // The fuse or lever on top.
  fuse: string;
}

const looks: Partial<Record<FactionId, GrenadeLook>> = {
  anzac: { name: "Jam-tin bomb", shape: "tin", body: "#9a978b", fuse: "#3b2f22" },
  ottoman: { name: "Cricket-ball bomb", shape: "ball", body: "#24231f", fuse: "#a8834a" },
};
const standard: GrenadeLook = { name: "Fragmentation grenade", shape: "egg", body: "#414d29", fuse: "#ebc77a" };

export const factionGrenade = (faction: FactionId | undefined): GrenadeLook => (faction && looks[faction]) || standard;
export const grenadeLook = (map: Pick<MapDefinition, "id">, team: "blue" | "red"): GrenadeLook =>
  factionGrenade(factionFor(map, team));
