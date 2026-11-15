import { afterEach, expect, it, vi } from "vitest";
import { ArtilleryMap } from "./artillery-map";
import { headlandMap } from "./headland-map";
import { villageMap } from "./village-map";
import type { Game } from "./simulation";

// Only the SVG construction is under test; terrain painting and live game
// updates are separate from the road paths that caused the black polygons.
class Element {
  children: Element[] = [];
  attributes = new Map<string, string>();
  style = {};
  classList = { add() {}, remove() {} };
  constructor(readonly tagName: string, readonly namespaceURI = "http://www.w3.org/2000/svg") {}
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  append(...children: Element[]) { this.children.push(...children); }
  replaceChildren(...children: Element[]) { this.children = children; }
}
afterEach(() => vi.unstubAllGlobals());

it.each([headlandMap, villageMap])("draws $id streets as unfilled strokes over the terrain", (map) => {
  const ui = new Element("div");
  vi.stubGlobal("document", {
    createElement: (tag: string) => new Element(tag),
    createElementNS: (namespace: string, tag: string) => new Element(tag, namespace),
    getElementById: () => ui,
  });
  const game = { map, players: [{ hp: 100, x: 0, z: 0, yaw: 0 }], sectors: [], scoring: "domination" } as unknown as Game;
  const overlay = new ArtilleryMap(() => game, vi.fn());
  vi.spyOn(overlay, "update").mockImplementation(() => {});
  overlay.toggle();
  const svg = ui.children[0].children[0].children.find(e => e.tagName === "svg")!;
  const roads = svg.children.filter(e => e.attributes.get("stroke") === "#b1a587");
  expect(roads).toHaveLength(map.streets!.length);
  for (const road of roads) {
    expect(road.attributes.get("d")).toMatch(/^M.+L/);
    expect(road.attributes.get("fill")).toBe("none");
  }
});
