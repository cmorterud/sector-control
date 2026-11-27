// Gallipoli's ground: the climb from the beach at Anzac to the summit of the
// Sari Bair range, as a height above the sea in metres. Authored for play and
// compressed about five times in height against the real ridge (260 m in 2 km
// becomes 45 m in 170 m). The map (src/gallipoli-map.ts) bakes this into the
// terrain's `hill` field and digs its trenches into it.
//
// x runs west (sea) to east (summit), z north (negative) to south. Two lanes
// climb side by side: the north lane up Chailak Dere past Table Top to the Nek
// and Chunuk Bair, the south lane up Owen's Gully to Lone Pine and Scrubby
// Knoll. Plugge's Plateau, a steep-sided spur, divides them below the ridge,
// and Monash Valley cuts north to south behind it so either side can switch.

export const gallipoliGround = {
  // The waterline sits at the coastal sea level; the beach back is 2 m above it.
  beachWidth: 19,
  // The six flags, with the height above the sea (m) the ground is levelled
  // to around each, so a capture ring never spans a slope.
  places: {
    tableTop: { x: -46, z: -41, height: 16 },
    owensGully: { x: -40, z: 41, height: 14.5 },
    nek: { x: 17, z: -42, height: 28 },
    lonePine: { x: 13, z: 42, height: 26 },
    scrubbyKnoll: { x: 62, z: 40, height: 40 },
    chunukBair: { x: 62, z: -42, height: 45 },
  },
  // Level ground this far round each flag, easing back to the slope by
  // `padEase`: wide enough that the ease never steepens a slope much.
  padRadius: 5.5,
  padEase: 20,
};

const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// 1 inside [a, b], easing to 0 over `fade` outside it.
const band = (v: number, a: number, b: number, fade: number) => smooth(a - fade, a, v) * (1 - smooth(b, b + fade, v));
const bump = (dx: number, dz: number, radius: number) => {
  const r = Math.hypot(dx, dz) / radius;
  return r < 1 ? (1 - r * r) ** 2 : 0;
};

// The waterline: North Beach runs nearly straight, Anzac Cove bows inland.
export const shoreX = (z: number) => -96 + 1.1 * Math.sin(z * 0.07 + 0.6) + 2.6 * bump(0, z - 42, 30) - 1.4 * bump(0, z + 2, 10);

// The climb along both lanes, by distance inland: steep behind the beach,
// a long rise through the gullies to the ridge, the summit crest at x 76 and
// the reverse slope down to Battleship Hill.
const profile: [number, number][] = [
  [-77, 2], [-72, 4.6], [-64, 9.4], [-54, 12.8], [-44, 15.2], [-30, 17.4], [-16, 20.4], [-4, 23.6],
  [10, 26.6], [24, 29.6], [40, 34.6], [54, 39.4], [66, 42.4], [76, 43.6], [88, 41.2], [100, 38.6], [120, 35],
];
// Monotone cubic through the profile, so the climb never overshoots its points.
const tangents = profile.map((_, i) => {
  if (i === 0 || i === profile.length - 1) {
    const [a, b] = i === 0 ? [profile[0], profile[1]] : [profile[i - 1], profile[i]];
    return (b[1] - a[1]) / (b[0] - a[0]);
  }
  const s0 = (profile[i][1] - profile[i - 1][1]) / (profile[i][0] - profile[i - 1][0]);
  const s1 = (profile[i + 1][1] - profile[i][1]) / (profile[i + 1][0] - profile[i][0]);
  return s0 * s1 <= 0 ? 0 : (2 * s0 * s1) / (s0 + s1);
});
export function climb(x: number) {
  if (x <= profile[0][0]) return profile[0][1] + tangents[0] * (x - profile[0][0]);
  const last = profile.length - 1;
  if (x >= profile[last][0]) return profile[last][1] + tangents[last] * (x - profile[last][0]);
  let i = 0;
  while (x > profile[i + 1][0]) i++;
  const [x0, y0] = profile[i], [x1, y1] = profile[i + 1], h = x1 - x0, t = (x - x0) / h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * tangents[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * tangents[i + 1];
}

// A gully: a flat floor `floor` wide each side of its line, walls rising over
// `wall` metres, `depth` below the ground around it.
const gully = (across: number, depth: number, floor: number, wall: number) => -depth * (1 - smooth(floor, floor + wall, Math.abs(across)));

// A spur: a crest `rise` above the climb along line z = at, its flanks
// falling `steep` metres per metre once `top` metres off the crest line.
const spur = (across: number, rise: number, top: number, steep: number) => rise - Math.max(0, Math.abs(across) - top) * steep;

// Height above the sea at (x, z).
export function gallipoliHeight(x: number, z: number): number {
  const shore = shoreX(z), inland = x - shore, beach = gallipoliGround.beachWidth;
  // Sea bed, then the beach: 0 at the waterline to 2 m at its back.
  if (inland < 0) return Math.max(-4, inland * 0.3);
  // The coast's line bends the first slope with it; the climb is straight by the ridge.
  const bend = (shore + 96) * (1 - smooth(-70, -30, x)), along = x - bend;
  const backOfBeach = -96 + beach;
  const sand = 2 * Math.min(1, inland / beach) ** 1.25;
  if (along < backOfBeach) return sand;
  const base = climb(along), p = gallipoliGround.places;
  let h = base;
  // The gully country between the beach and the ridge, where spurs and gullies are deepest.
  const gullies = band(along, -70, -26, 8);

  // --- North lane (z < -16) ---------------------------------------------
  const north = 1 - smooth(-20, -14, z);
  // Table Top spur: a crest from North Beach to the flat top (16 m), which has a
  // near-sheer north face over Chailak Dere, then a neck east toward the Nek.
  {
    const dx = along - p.tableTop.x, dz = z - p.tableTop.z;
    const crest = dx < -7 ? p.tableTop.height + (dx + 7) * 0.5 : dx < 8 ? p.tableTop.height : p.tableTop.height - Math.min(1.6, (dx - 8) * 0.25);
    const fall = Math.max(0, dz < 0 ? -dz - 6 : dz - 7) * (dz < 0 ? 2.4 : 0.85);
    const reach = band(along, -77, -18, 6);
    h = Math.max(h, base + (crest - fall - base) * reach);
  }
  // Chailak Dere: a flat-floored gully from North Beach to below the Nek, the
  // easy, exposed way up.
  const chailakZ = -60 + (along + 77) * 0.04;
  h += north * gully(z - chailakZ, 6 * band(along, -72, -24, 6), 3.5, 7);
  // Sazli Beit Dere: a shallower gully under Plugge's north flank.
  h += north * gully(z + 25, 4 * band(along, -72, -30, 8), 2.5, 6);
  // Walden's Point: the north rim, outside the play area.
  h += 3 * gullies * smooth(-66, -76, z);

  // --- South lane (z > 16) ----------------------------------------------
  const south = smooth(14, 20, z);
  // Owen's Gully: up from Anzac Cove to its head at B, where the Ottoman
  // sniper posts look down it from the spurs either side.
  {
    const head = p.owensGully.x, z0 = p.owensGully.z + (head - along) * 0.06;
    const depth = 5.5 * smooth(head + 3, head - 14, along) * smooth(-78, -68, along);
    h += south * gully(z - z0, depth, 3.5, 7);
    h += south * band(along, -72, head + 8, 6) * (Math.max(0, spur(z - 28, 3, 3, 0.55)) + Math.max(0, spur(z - 55, 3.2, 3, 0.5)));
  }
  // Shrapnel Gully runs up from the cove into Monash Valley; Bolton's Ridge closes the south.
  h += south * gully(z - 19, 3.5 * band(along, -74, -30, 6), 2.5, 5);
  h += 3 * band(along, -72, 10, 10) * smooth(64, 74, z);
  h -= south * 1.2 * smooth(-62, -42, x);

  // --- Plugge's Plateau, between the lanes ---------------------------------
  {
    const crest = (12.5 + 7.5 * smooth(-77, -48, along)) * smooth(-82, -76, along) * (1 - smooth(-34, -23, x));
    const top = 6.5 + 2.5 * Math.sin(along * 0.11 + 1), fall = Math.max(0, Math.abs(z + 1) - top);
    // Sheer to the north (the Sphinx), steep to the south.
    h = Math.max(h, crest - fall * (z < -1 ? 2.3 : 1.3));
  }

  // --- Monash Valley: north to south behind Plugge's --------------------
  {
    const centre = -21 + 2.5 * Math.sin(z * 0.06), floor = 15.6 + 0.02 * z;
    const reach = 1 - smooth(28, 40, Math.abs(z));
    const across = Math.abs(x - centre), walls = floor + Math.max(0, across - 3.5) * 0.76;
    if (walls < h) h += (walls - h) * reach;
  }

  // --- The ridge --------------------------------------------------------
  // The Nek: a saddle about 30 m wide with steep drops both sides. North into
  // Malone's Gully, south into the head of Monash Valley (the Bloody Angle),
  // which eases out toward Lone Pine. Both gully heads open west and close
  // under Baby 700 to the east.
  {
    const span = smooth(-34, -8, x) * (1 - smooth(22, 40, x)), off = z - p.nek.z;
    const drop = off < 0 ? 8 * smooth(15, 21, -off) : 7 * smooth(15, 21, off) * (1 - smooth(-14, 18, z));
    h -= span * drop;
  }
  // Lone Pine: a broad, nearly level plateau.
  {
    const flat = band(x, -6, 30, 8) * band(z, 22, 64, 6);
    const level = p.lonePine.height + (x - p.lonePine.x) * 0.12;
    h += (level - h) * 0.75 * flat;
  }
  // The summit knolls: Chunuk Bair and Scrubby Knoll, and the long Battleship Hill crest.
  h += 2.8 * bump(x - p.chunukBair.x, z - p.chunukBair.z, 26);
  h += 1.2 * bump(x - p.scrubbyKnoll.x, z - p.scrubbyKnoll.z, 16) - 1.6 * smooth(10, 24, z) * smooth(30, 50, x);

  // Small irregular relief everywhere but the beach, gentler near the flags.
  const rough = 0.45 * Math.sin(x * 0.31 + z * 0.17) * Math.sin(z * 0.23 - x * 0.07) + 0.3 * Math.sin(x * 0.13 - z * 0.29 + 1.7);
  const calm = Math.min(...Object.values(p).map((q) => Math.hypot(x - q.x, z - q.z))) < 12 ? 0.3 : 1;
  h += rough * calm * smooth(backOfBeach, backOfBeach + 8, along);
  // Level each flag's ground: a soldier counts toward a capture only within
  // about a metre of the flag's height.
  for (const q of Object.values(p)) {
    const w = 1 - smooth(gallipoliGround.padRadius, gallipoliGround.padEase, Math.hypot(x - q.x, z - q.z));
    if (w > 0) h += (q.height - h) * w;
  }
  return Math.max(sand, h);
}
