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
        { at: "A2", feature: "cupboard", w: 0.6, d: 1.6, h: 1.6, dx: -0.72 },
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

// Manor: 6 × 5 bays, two stories, for a capture building. Flag C sits in
// the entrance hall (C1–D2). A stone stair core behind it (C3–D4) opens onto
// a rear hall, so the hall has no straight shot through to the back. Upstairs
// the rooms form a ring around the stairwell.
const manorSpine: [string, string][] = [["A2", "A3"], ["B2", "B3"], ["C2", "C3"], ["D2", "D3"], ["E2", "E3"], ["F2", "F3"]];
const manorCore: [string, string][] = [["B3", "C3"], ["B4", "C4"], ["D3", "E3"], ["D4", "E4"]];
export const manor: KitPlan = {
  id: "manor",
  name: "Manor",
  style: "manor",
  bays: { x: 6, z: 5 },
  paved: ["hall"],
  levels: [
    {
      cells: ["PPhhDD", "PPhhDD", "LLmmKK", "LLabKK", "LLrrKK"],
      rooms: {
        P: { type: "parlour", name: "Salon" },
        h: { type: "hall", name: "Entrance hall" },
        D: { type: "parlour", name: "Dining room" },
        L: { type: "parlour", name: "Library" },
        K: { type: "kitchen", name: "Kitchen" },
        r: { type: "hall", name: "Rear hall" },
        m: { type: "stair", name: "Mid landing" },
        a: { type: "stair", name: "Stair" },
        b: { type: "stair", name: "Stair" },
      },
      stone: [...manorSpine, ...manorCore, ["C4", "D4"]],
      open: [["C3", "C4"], ["D3", "D4"], ["C4", "C5"], ["D4", "D5"]],
      doors: [["B2", "C2"], ["D1", "E1"], ["A2", "A3"], ["F2", "F3"], ["B5", "C5"], ["D5", "E5"]],
      openings: [
        { at: "A1", side: "north", kind: "window" }, { at: "B1", side: "north", kind: "window" },
        { at: "C1", side: "north", kind: "double" }, { at: "D1", side: "north", kind: "window" },
        { at: "E1", side: "north", kind: "window" }, { at: "F1", side: "north", kind: "window" },
        { at: "A2", side: "west", kind: "window" }, { at: "A4", side: "west", kind: "window" },
        { at: "F2", side: "east", kind: "window" }, { at: "F4", side: "east", kind: "door" },
        { at: "B5", side: "south", kind: "window" }, { at: "C5", side: "south", kind: "door" },
        { at: "D5", side: "south", kind: "window" }, { at: "E5", side: "south", kind: "window" },
      ],
      furniture: [
        { at: "B2", feature: "table", w: 1.8, d: 1, h: 0.85, dx: -1.25, dz: -1.25 },
        { at: "F2", feature: "table", w: 1.8, d: 1, h: 0.85, dx: -1.25, dz: -1.25 },
        { at: "B3", feature: "bookcase", w: 1.8, d: 0.6, h: 2, dz: -0.72 },
        { at: "A5", feature: "bookcase", w: 1.8, d: 0.6, h: 2, dz: 0.72 },
        { at: "B4", feature: "desk", w: 1.6, d: 0.85, h: 0.9, dx: -0.6 },
        { at: "E4", feature: "table", w: 1.8, d: 1, h: 0.85 },
        { at: "F5", feature: "hearth", w: 0.75, d: 1.6, h: 1.2, dx: 0.6, dz: -0.2 },
      ],
    },
    {
      cells: ["BBGGRR", "BBGGRR", "WWvvEE", "WWvvEE", "WWllEE"],
      rooms: {
        B: { type: "bedroom", name: "West bedroom" },
        G: { type: "parlour", name: "Gallery" },
        R: { type: "bedroom", name: "East bedroom" },
        W: { type: "bedroom", name: "West room" },
        E: { type: "parlour", name: "Study" },
        v: { type: "void", name: "Stairwell" },
        l: { type: "landing", name: "Landing" },
      },
      stone: [...manorSpine, ...manorCore],
      open: [["D4", "D5"]],
      doors: [["B2", "C2"], ["D2", "E2"], ["A2", "A3"], ["F2", "F3"], ["B5", "C5"], ["D5", "E5"]],
      openings: [
        { at: "A1", side: "north", kind: "window" }, { at: "B1", side: "north", kind: "window" },
        { at: "C1", side: "north", kind: "window" }, { at: "D1", side: "north", kind: "window" },
        { at: "E1", side: "north", kind: "window" }, { at: "F1", side: "north", kind: "window" },
        { at: "A2", side: "west", kind: "window" }, { at: "A4", side: "west", kind: "window" },
        { at: "F2", side: "east", kind: "window" }, { at: "F4", side: "east", kind: "window" },
        { at: "A5", side: "south", kind: "window" }, { at: "C5", side: "south", kind: "window" },
        { at: "F5", side: "south", kind: "window" },
      ],
      furniture: [
        { at: "A1", feature: "bed", w: 1.8, d: 2.3, h: 0.85, dx: -0.12, dz: 0.6 },
        { at: "F1", feature: "bed", w: 1.8, d: 2.3, h: 0.85, dx: 0.12, dz: 0.6 },
        { at: "D1", feature: "desk", w: 1.6, d: 0.85, h: 0.9, dx: -1.25, dz: 0.1 },
        { at: "B4", feature: "bed", w: 1.8, d: 2.3, h: 0.85, dx: -0.35 },
        { at: "A4", feature: "cupboard", w: 0.6, d: 1.6, h: 1.6, dx: -0.72 },
        { at: "F4", feature: "desk", w: 1.6, d: 0.85, h: 0.9, dx: -0.4 },
        { at: "E3", feature: "bookcase", w: 1.8, d: 0.6, h: 2, dz: -0.72 },
      ],
    },
  ],
  flights: [
    { at: "C4", level: 0, climb: "north", steps: 8, from: 0, solid: true },
    { at: "D4", level: 0, climb: "south", steps: 8, from: 1.7, solid: true },
  ],
  landings: [{ cells: ["C3", "D3"], level: 0, height: 1.7, solid: true }],
  // One stack, in the kitchen's back corner, clear of every door approach.
  chimneys: [{ at: "F5", side: "east" }],
  wings: [
    { id: "west", from: "A1", to: "B5" },
    { id: "centre", from: "C1", to: "D5" },
    { id: "east", from: "E1", to: "F5" },
  ],
};

// Cottage: 4 × 4 bays, one story. Four rooms in a ring around a stone
// spine, with front and back doors and a kitchen hearth.
export const cottage: KitPlan = {
  id: "cottage",
  name: "Cottage",
  style: "cottage",
  bays: { x: 4, z: 4 },
  paved: ["kitchen", "store"],
  levels: [{
    cells: ["PPKK", "PPKK", "BBSS", "BBSS"],
    rooms: {
      P: { type: "parlour", name: "Parlour" },
      K: { type: "kitchen", name: "Kitchen" },
      B: { type: "bedroom", name: "Bedroom" },
      S: { type: "store", name: "Scullery" },
    },
    stone: [["A2", "A3"], ["B2", "B3"], ["C2", "C3"], ["D2", "D3"]],
    doors: [["B2", "C2"], ["A2", "A3"], ["D2", "D3"], ["B4", "C4"]],
    openings: [
      { at: "A1", side: "north", kind: "window" }, { at: "B1", side: "north", kind: "door" },
      { at: "C1", side: "north", kind: "window" },
      { at: "A2", side: "west", kind: "window" }, { at: "A3", side: "west", kind: "window" },
      { at: "D2", side: "east", kind: "window" },
      { at: "B4", side: "south", kind: "window" }, { at: "C4", side: "south", kind: "door" },
      { at: "D4", side: "south", kind: "window" },
    ],
    furniture: [
      { at: "B2", feature: "table", w: 1.8, d: 1, h: 0.85, dx: -1.25, dz: -1.25 },
      { at: "D1", feature: "hearth", w: 0.75, d: 1.6, h: 1.2, dx: 0.6 },
      { at: "C1", feature: "table", w: 1.4, d: 0.8, h: 0.8, dx: 0.4, dz: 0.3 },
      { at: "A4", feature: "bed", w: 1.8, d: 2.3, h: 0.85, dx: -0.12, dz: -0.15 },
      { at: "D4", feature: "cupboard", w: 0.6, d: 1.6, h: 1.6, dx: 0.72 },
    ],
  }],
  flights: [],
  chimneys: [{ at: "D1", side: "east" }],
  wings: [{ id: "house", from: "A1", to: "D4" }],
};

// Bakery: the cottage's rooms, with the kitchen hearth replaced by an oven
// and a baker's workbench in the scullery.
export const bakery: KitPlan = {
  ...cottage,
  id: "bakery",
  name: "Bakery",
  style: "bakery",
  levels: [{
    ...cottage.levels[0],
    rooms: { ...cottage.levels[0].rooms, K: { type: "kitchen", name: "Bakehouse" }, S: { type: "store", name: "Flour store" } },
    furniture: [
      ...cottage.levels[0].furniture!.filter((f) => f.feature !== "hearth" && f.feature !== "cupboard"),
      { at: "D1", feature: "oven", w: 0.9, d: 1.8, h: 1.3, dx: 0.52 },
      { at: "C3", feature: "workbench", w: 1.8, d: 0.85, h: 0.9, dz: -0.2 },
    ],
  }],
};

// Barn or workshop: 6 × 4 bays, one story, plank walls. Cart doors at
// both ends are offset so they never line up; posts and stalls supply the
// cover that a big working room needs.
export const barn: KitPlan = {
  id: "barn",
  name: "Barn",
  style: "stable",
  bays: { x: 6, z: 4 },
  exterior: "timber",
  paved: ["barn"],
  levels: [{
    cells: ["BBBBBB", "BBBBBB", "BBBBBB", "BBBBBB"],
    rooms: { B: { type: "barn", name: "Workshop" } },
    openings: [
      { at: "A2", side: "west", kind: "double" }, { at: "F3", side: "east", kind: "double" },
      { at: "C1", side: "north", kind: "window" }, { at: "C4", side: "south", kind: "door" },
    ],
    furniture: [
      { at: "B1", feature: "stall", w: 2, d: 1, h: 1.05, dz: -0.6 },
      { at: "D1", feature: "stall", w: 2, d: 1, h: 1.05, dz: -0.6 },
      { at: "B4", feature: "stall", w: 2, d: 1, h: 1.05, dz: 0.53 },
      { at: "E4", feature: "stall", w: 2, d: 1, h: 1.05, dz: 0.53 },
      // Across the line in from each cart door.
      { at: "B2", feature: "workbench", w: 1.8, d: 0.85, h: 0.9 },
      { at: "E3", feature: "workbench", w: 1.8, d: 0.85, h: 0.9 },
      // Working clutter in the middle bays breaks the diagonals between posts.
      { at: "C2", feature: "workbench", w: 1.6, d: 0.85, h: 0.9, dx: 0.3 },
      { at: "D3", feature: "workbench", w: 1.6, d: 0.85, h: 0.9, dx: -0.3 },
      { at: "F1", feature: "stall", w: 1, d: 2, h: 1.05, dx: 0.53 },
      { at: "A4", feature: "stall", w: 1, d: 2, h: 1.05, dx: -0.53 },
    ],
  }],
  // A staggered grid: no straight run across the floor misses a post.
  posts: [{ at: [2, 1] }, { at: [4, 1] }, { at: [1, 2] }, { at: [3, 2] }, { at: [5, 2] }, { at: [2, 3] }, { at: [4, 3] }],
  flights: [],
  wings: [{ id: "barn", from: "A1", to: "F4" }],
};

// Capture house: 6 × 5 bays, one story, for a flag building. The flag
// stands in a 5 × 5 m hall (C1–D2) with doors to the front, both side rooms
// and a lobby (C3–D3) that leads on to the back. The hall's door to the
// lobby and the lobby's door to the back are offset, so no line runs
// through. Variants change only the rooms' names and furniture.
type Furniture = NonNullable<KitPlan["levels"][number]["furniture"]>;
const captureHouse = (id: string, name: string, rooms: Record<"W" | "H" | "L" | "E" | "S" | "B" | "K", string>, furniture: Furniture): KitPlan => ({
  id,
  name,
  style: id,
  bays: { x: 6, z: 5 },
  paved: ["hall", "kitchen", "store"],
  levels: [{
    cells: ["WWHHEE", "WWHHEE", "WWLLEE", "SSBBKK", "SSBBKK"],
    rooms: {
      W: { type: "parlour", name: rooms.W }, H: { type: "hall", name: rooms.H }, L: { type: "hall", name: rooms.L }, E: { type: "parlour", name: rooms.E },
      S: { type: "store", name: rooms.S }, B: { type: "parlour", name: rooms.B }, K: { type: "kitchen", name: rooms.K },
    },
    stone: [["A3", "A4"], ["B3", "B4"], ["C3", "C4"], ["D3", "D4"], ["E3", "E4"], ["F3", "F4"]],
    // The hall doorways sit on offset rows, so no line crosses the house.
    doors: [["B1", "C1"], ["D2", "E2"], ["C2", "C3"], ["D3", "D4"], ["B3", "B4"], ["E3", "E4"], ["B5", "C5"], ["D5", "E5"]],
    openings: [
      { at: "A1", side: "north", kind: "window" }, { at: "C1", side: "north", kind: "double" },
      { at: "F1", side: "north", kind: "window" },
      // Each team's approach gets a full-bay door straight into a side room
      // beside the hall, so a 50-strong side doesn't funnel through back rooms.
      { at: "A1", side: "west", kind: "window" }, { at: "A2", side: "west", kind: "double" },
      { at: "F1", side: "east", kind: "window" }, { at: "F2", side: "east", kind: "double" },
      { at: "A5", side: "west", kind: "door" }, { at: "F4", side: "east", kind: "door" },
      { at: "C5", side: "south", kind: "door" }, { at: "E5", side: "south", kind: "window" },
    ],
    // Cupboards mid-wall in the side rooms and beside the front door break
    // the long lines past the windows and in from the doorway.
    furniture: [
      { at: "A3", feature: "cupboard", w: 0.6, d: 1.6, h: 1.6, dx: -0.72 },
      { at: "F3", feature: "cupboard", w: 0.6, d: 1.6, h: 1.6, dx: 0.72 },
      { at: "D1", feature: "cupboard", w: 1.6, d: 0.6, h: 1.6, dz: -0.72 },
      // A small table between the east room's two doors breaks the run past them.
      { at: "E2", feature: "table", w: 0.7, d: 0.7, h: 0.85, dx: 1.05 },
      ...furniture,
    ],
  }],
  flights: [],
  chimneys: [{ at: "F5", side: "east" }],
  wings: [{ id: "west", from: "A1", to: "B5" }, { id: "centre", from: "C1", to: "D5" }, { id: "east", from: "E1", to: "F5" }],
});
const kitchenHearth: Furniture = [{ at: "F5", feature: "hearth", w: 0.75, d: 1.6, h: 1.2, dx: 0.6, dz: 0.2 }];
export const schoolhouse = captureHouse("school", "Schoolhouse",
  { W: "Classroom", H: "Entrance hall", L: "Cloakroom", E: "Aid post", S: "Store", B: "Teacher's room", K: "Kitchen" }, [
    { at: "B2", feature: "desk", w: 1.6, d: 0.8, h: 0.8, dx: -0.6 },
    { at: "E1", feature: "bed", w: 0.9, d: 2, h: 0.7, dx: -0.7 },
    { at: "C4", feature: "desk", w: 1.6, d: 0.8, h: 0.8, dz: -0.3 },
    ...kitchenHearth,
  ]);
export const farmhouse = captureHouse("farm", "Farmhouse",
  { W: "Parlour", H: "Farm hall", L: "Boot room", E: "Dairy", S: "Feed store", B: "Back kitchen", K: "Kitchen" }, [
    { at: "B2", feature: "table", w: 1.8, d: 1, h: 0.85, dx: -0.6 },
    { at: "E1", feature: "workbench", w: 1.8, d: 0.85, h: 0.9, dx: 0.4, dz: 0.5 },
    { at: "C4", feature: "table", w: 1.6, d: 0.9, h: 0.85, dz: -0.3 },
    ...kitchenHearth,
  ]);
export const villageInn = captureHouse("inn", "Inn",
  { W: "Bar", H: "Common room", L: "Passage", E: "Dining room", S: "Cellar store", B: "Back room", K: "Kitchen" }, [
    { at: "B2", feature: "counter", w: 0.8, d: 2.2, h: 1.05, dx: -0.6 },
    { at: "E1", feature: "table", w: 1.8, d: 1, h: 0.85, dx: 0.4, dz: 0.5 },
    { at: "C4", feature: "table", w: 1.6, d: 0.9, h: 0.85, dz: -0.3 },
    ...kitchenHearth,
  ]);
export const townHall = captureHouse("hall", "Town hall",
  { W: "Post office", H: "Public hall", L: "Corridor", E: "Mayor's office", S: "Archive", B: "Clerk's room", K: "Kitchen" }, [
    { at: "B2", feature: "counter", w: 0.8, d: 2.2, h: 1.05, dx: -0.6 },
    { at: "E1", feature: "desk", w: 1.6, d: 0.85, h: 0.9, dx: 0.4, dz: 0.5 },
    { at: "C4", feature: "desk", w: 1.6, d: 0.8, h: 0.8, dz: -0.3 },
    ...kitchenHearth,
  ]);

export const kitPlans = [narrowTownhouse, tenement, manor, cottage, bakery, barn, schoolhouse, farmhouse, villageInn, townHall];
