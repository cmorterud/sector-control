import type { KitPlan } from "./house-kit";

// Plans from docs/HOUSE_KIT.md. North is the street; cells are named by
// column letter from the west and row number from the street.

// Narrow townhouse: 3 × 5 bays, two stories, party walls on both sides so it
// can be built in terraces. The stair climbs north along the west party wall
// to a landing in the front room; an outside stair is a second route up.
export const narrowTownhouse: KitPlan = {
  id: "narrow-townhouse",
  name: "Townhouse",
  style: "townhouse",
  bays: { x: 3, z: 5 },
  party: ["west", "east"],
  paved: ["shop", "kitchen", "hall"],
  levels: [
    {
      cells: ["SSS", "SSS", "aKK", "aKK", "hKK"],
      rooms: {
        S: { type: "shop", name: "Shop" },
        K: { type: "kitchen", name: "Kitchen" },
        a: { type: "stair", name: "Stair" },
        h: { type: "hall", name: "Hall" },
      },
      stone: [["A2", "A3"], ["B2", "B3"], ["C2", "C3"]],
      open: [["A4", "A5"]],
      doors: [["C2", "C3"], ["A5", "B5"]],
      openings: [
        { at: "A1", side: "north", kind: "window" }, { at: "B1", side: "north", kind: "double" },
        { at: "C1", side: "north", kind: "window" },
        // The rear door sits under the outside stair's landing.
        { at: "C5", side: "south", kind: "door" },
      ],
      furniture: [
        { at: "B2", feature: "counter", w: 2.6, d: 0.8, h: 1.05, dz: -1.25 },
        { at: "A1", feature: "cupboard", w: 0.6, d: 1.6, h: 1.6, dx: -0.72, dz: 0.3 },
        { at: "B4", feature: "table", w: 1.8, d: 1, h: 0.85, dx: 0.45 },
        // The hearth also breaks the straight line from the spine door to the rear door.
        { at: "C4", feature: "hearth", w: 0.75, d: 1.6, h: 1.2, dx: 0.6 },
        { at: "B3", feature: "cupboard", w: 1.6, d: 0.6, h: 1.6, dz: -0.72 },
      ],
    },
    {
      cells: ["FFF", "FFF", "vBB", "vBB", "BBB"],
      rooms: {
        F: { type: "parlour", name: "Front room" },
        B: { type: "bedroom", name: "Back room" },
        v: { type: "void", name: "Stairwell" },
      },
      stone: [["B2", "B3"], ["C2", "C3"]],
      open: [["A2", "A3"]],
      doors: [["C2", "C3"]],
      openings: [
        { at: "A1", side: "north", kind: "window" }, { at: "B1", side: "north", kind: "window" },
        { at: "C1", side: "north", kind: "window" },
        { at: "A5", side: "south", kind: "window" }, { at: "B5", side: "south", kind: "window" },
        { at: "C5", side: "south", kind: "door" },
      ],
      furniture: [
        { at: "C1", feature: "bed", w: 1.8, d: 2.3, h: 0.85, dx: 0.1, dz: 0.55 },
        { at: "A1", feature: "cupboard", w: 0.6, d: 1.6, h: 1.6, dx: -0.72, dz: 0.3 },
        // Across the line between the two back-room doors.
        { at: "C4", feature: "desk", w: 1.6, d: 0.85, h: 0.9, dx: -0.55 },
        { at: "B3", feature: "cupboard", w: 0.6, d: 1.6, h: 1.6, dx: -0.87 },
        { at: "A5", feature: "bed", w: 1.8, d: 0.9, h: 0.85, dz: 0.5 },
      ],
    },
  ],
  flights: [
    { at: "A4", level: 0, climb: "north", steps: 16, from: 0, solid: true },
    // A timber outside stair along the yard wall reaches the back room door.
    { at: "A6", level: 0, climb: "east", steps: 16, from: 0, solid: true, route: "outside" },
  ],
  landings: [{ cells: ["C6"], level: 0, height: 3.4, route: "outside" }],
  chimneys: [{ at: "C4", side: "east" }],
  wings: [{ id: "house", from: "A1", to: "C5" }],
};

// Tenement: 4 × 5 bays, two stone stories and a mansard floor, corner variant
// with the east wall shared. The stone stair core (A3–B4) is open through
// every story: two eight-step half-flights per story and a mid landing.
const coreStone: [string, string][] = [["B3", "C3"], ["B4", "C4"], ["A4", "B4"]];
const spine: [string, string][] = [["A2", "A3"], ["B2", "B3"], ["C2", "C3"], ["D2", "D3"]];
export const tenement: KitPlan = {
  id: "tenement",
  name: "Tenement",
  bays: { x: 4, z: 5 },
  party: ["east"],
  mansard: true,
  paved: ["shop", "workroom", "hall"],
  levels: [
    {
      cells: ["SSSS", "SSSS", "mmWW", "abWW", "hhWW"],
      rooms: {
        S: { type: "shop", name: "Shop" },
        W: { type: "workroom", name: "Workroom" },
        m: { type: "stair", name: "Mid landing" },
        a: { type: "stair", name: "Stair" },
        b: { type: "stair", name: "Stair" },
        h: { type: "hall", name: "Hall" },
      },
      stone: [...spine, ...coreStone],
      open: [["A3", "A4"], ["B3", "B4"], ["A4", "A5"], ["B4", "B5"]],
      doors: [["D2", "D3"], ["B5", "C5"]],
      openings: [
        { at: "A1", side: "north", kind: "window" }, { at: "B1", side: "north", kind: "window" },
        { at: "C1", side: "north", kind: "double" }, { at: "D1", side: "north", kind: "window" },
        { at: "A1", side: "west", kind: "window" }, { at: "A2", side: "west", kind: "window" },
        { at: "A5", side: "south", kind: "door" }, { at: "D5", side: "south", kind: "window" },
      ],
      furniture: [
        { at: "B2", feature: "table", w: 1.8, d: 1, h: 0.85, dx: -1.25, dz: -1.25 },
        { at: "D2", feature: "counter", w: 2.6, d: 0.8, h: 1.05, dx: -1.25, dz: -1.25 },
        { at: "D4", feature: "workbench", w: 1.8, d: 0.85, h: 0.9, dx: -1.25 },
        { at: "C3", feature: "cupboard", w: 1.6, d: 0.6, h: 1.6, dz: -0.7 },
      ],
    },
    {
      cells: ["RRPP", "RRPP", "mmKK", "abKK", "LLKK"],
      rooms: {
        R: { type: "bedroom", name: "Corner bedroom", strongpoint: true },
        P: { type: "parlour", name: "Parlour" },
        K: { type: "kitchen", name: "Kitchen" },
        m: { type: "stair", name: "Mid landing" },
        a: { type: "stair", name: "Stair" },
        b: { type: "stair", name: "Stair" },
        L: { type: "landing", name: "Landing" },
      },
      stone: [...spine, ...coreStone],
      open: [["A3", "A4"], ["B3", "B4"], ["A4", "A5"], ["B4", "B5"]],
      doors: [["D2", "D3"], ["B5", "C5"], ["B1", "C1"]],
      openings: [
        { at: "A1", side: "north", kind: "window" }, { at: "B1", side: "north", kind: "window" },
        { at: "C1", side: "north", kind: "window" }, { at: "D1", side: "north", kind: "window" },
        { at: "A1", side: "west", kind: "window" }, { at: "A2", side: "west", kind: "window" },
        { at: "A5", side: "south", kind: "window" }, { at: "C5", side: "south", kind: "window" },
        { at: "D5", side: "south", kind: "window" },
      ],
      furniture: [
        { at: "A2", feature: "bed", w: 1.8, d: 2.3, h: 0.85, dx: -0.12, dz: -0.6 },
        { at: "D2", feature: "table", w: 1.8, d: 1, h: 0.85, dx: -1.25, dz: -1.25 },
        { at: "D4", feature: "table", w: 1.8, d: 1, h: 0.85, dx: -1.25 },
        { at: "D5", feature: "hearth", w: 0.75, d: 1.6, h: 1.2, dx: 0.6, dz: -0.6 },
        { at: "C3", feature: "cupboard", w: 1.6, d: 0.6, h: 1.6, dz: -0.7 },
      ],
    },
    {
      cells: ["FFGG", "FFGG", "vvRR", "vvRR", "LLRR"],
      rooms: {
        F: { type: "garret", name: "West garret", strongpoint: true },
        G: { type: "garret", name: "East garret" },
        R: { type: "garret", name: "Rear garret" },
        v: { type: "void", name: "Stairwell" },
        L: { type: "landing", name: "Landing" },
      },
      stone: [...spine, ["B3", "C3"], ["B4", "C4"]],
      open: [["B4", "B5"]],
      doors: [["D2", "D3"], ["B5", "C5"], ["B1", "C1"]],
      openings: [
        { at: "B1", side: "north", kind: "window" }, { at: "D1", side: "north", kind: "window" },
        { at: "A2", side: "west", kind: "window" }, { at: "C5", side: "south", kind: "window" },
      ],
      furniture: [
        { at: "A2", feature: "bed", w: 1.8, d: 2.3, h: 0.85, dx: -0.12, dz: -0.6 },
        { at: "D2", feature: "cupboard", w: 1.8, d: 0.9, h: 0.95, dx: -1.25, dz: -1.25 },
        { at: "D4", feature: "table", w: 1.8, d: 1, h: 0.85, dx: -1.25 },
      ],
    },
  ],
  flights: [
    { at: "A4", level: 0, climb: "north", steps: 8, from: 0, solid: true },
    { at: "B4", level: 0, climb: "south", steps: 8, from: 1.7, solid: true },
    { at: "A4", level: 1, climb: "north", steps: 8, from: 0 },
    { at: "B4", level: 1, climb: "south", steps: 8, from: 1.7 },
  ],
  landings: [
    { cells: ["A3", "B3"], level: 0, height: 1.7, solid: true },
    { cells: ["A3", "B3"], level: 1, height: 1.7 },
  ],
  chimneys: [{ at: "D4", side: "east" }],
  wings: [
    { id: "front", from: "A1", to: "D2" },
    { id: "core", from: "A3", to: "B5" },
    { id: "rear", from: "C3", to: "D5" },
  ],
};

export const kitPlans = [narrowTownhouse, tenement];
