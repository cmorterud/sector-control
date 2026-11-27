import type { Atmosphere } from "./atmosphere";
import type { MapDefinition } from "./map";

// Each map's light and mood: sun, generated sky, fog and colour grade.
// Colours are sRGB hex. The sky's horizon colour is also the fog colour, so
// distant ground fades into the sky without a seam.
export interface MapLook {
  sun: { color: string; intensity: number; elevation: number; azimuth: number; shadowStrength: number };
  sky: { zenith: string; horizon: string; ground: string; clouds: number; cloud: string; glow: string };
  fog: { start: number; end: number };
  grade: { brightness: number; contrast: number; saturation: number; tint: string };
  vignette: number;
  exposure: number;
  // How much brighter the sky's ambient light is than the sky looks.
  ambient: number;
  // Camera far clip in metres; fog must close before it. Default 210 (180 on Industrial).
  farClip?: number;
  // Ground mist, brazier and crater smoke, cloth on the wire (src/atmosphere.ts).
  atmosphere?: Atmosphere;
  // Night maps: what the eye makes out unaided. A soft light that travels with
  // the viewer and reaches about as far as the map's sight rule, so distant
  // ground is dark until a lamp, a flare or a burst lights it.
  nightVision?: { color: string; intensity: number; range: number };
  // A map in the sky looks down on a sea of cloud instead of ground: sunlit
  // tops over shaded hollows, `scale` puffs per unit of view slope.
  cloudSea?: { top: string; shade: string; scale: number };
  // Fog that starts this close and opens out to `fog` over `seconds` of match
  // time: a morning fog lifting. Presentation only; bots see as usual.
  fogLift?: { start: number; end: number; seconds: number };
}

export const mapLooks: Record<MapDefinition["id"], MapLook> = {
  // Smoky, hazy noon among the warehouses.
  industrial: {
    sun: { color: "#ffe4b8", intensity: 1.55, elevation: 58, azimuth: -30, shadowStrength: 0.85 },
    sky: { zenith: "#8a979e", horizon: "#b4b1a3", ground: "#5c584d", clouds: 0.55, cloud: "#c9c4b5", glow: "#f3e2bd" },
    fog: { start: 35, end: 115 },
    grade: { brightness: 0, contrast: 1.05, saturation: 0.9, tint: "#fff3e3" },
    vignette: 0.3, exposure: 1.05, ambient: 1.35,
  },
  // Cold grey dawn over no man's land: a low warm sun under a heavy cloud
  // deck, long shadows, mist lying in the field and pooled in the trenches.
  trenches: {
    sun: { color: "#f2c9a0", intensity: 1.15, elevation: 14, azimuth: 70, shadowStrength: 0.6 },
    sky: { zenith: "#66758a", horizon: "#aab0b3", ground: "#47483f", clouds: 0.85, cloud: "#959aa0", glow: "#efc497" },
    // Long enough to layer the distant woods, ruins and balloons into the haze.
    fog: { start: 30, end: 280 },
    // Tuned on a real GPU, which renders shade far darker than CI's software
    // renderer: a Blue player faces east into this sun, at banks lit only by
    // the sky. Ambient this high keeps them readable; the sky does the mood.
    grade: { brightness: 0, contrast: 1.06, saturation: 0.78, tint: "#e4ecf3" },
    vignette: 0.36, exposure: 1.1, ambient: 1.9, farClip: 420,
    atmosphere: { fieldMist: 0.2, trenchMist: 0.16 },
  },
  // A moonless, overcast night. The sky gives almost nothing: unlit ground is
  // black beyond what the eye makes out at about fifteen meters. Fog stays
  // far, so ground lit by a lamp, a flare or a burst shows at any distance.
  "night-raid": {
    sun: { color: "#a9c0ea", intensity: 0.16, elevation: 48, azimuth: -40, shadowStrength: 0 },
    sky: { zenith: "#1c2536", horizon: "#0b0f15", ground: "#07090c", clouds: 0.7, cloud: "#161d2a", glow: "#141b28" },
    fog: { start: 60, end: 260 },
    grade: { brightness: 0, contrast: 1.04, saturation: 0.6, tint: "#c8d8f6" },
    vignette: 0.45, exposure: 1.4, ambient: 1.0, farClip: 420,
    atmosphere: { fieldMist: 0.03, trenchMist: 0.03 },
    nightVision: { color: "#a9bfe6", intensity: 1.5, range: 21 },
  },
  // 21 March 1918: thick white fog over the chalk at dawn, burning off as
  // the sun climbs behind the German lines.
  "spring-offensive": {
    sun: { color: "#f4dcb8", intensity: 1.05, elevation: 18, azimuth: 80, shadowStrength: 0.5 },
    sky: { zenith: "#7d8a98", horizon: "#c3c6c2", ground: "#55564b", clouds: 0.7, cloud: "#b9bcba", glow: "#f1d6ae" },
    fog: { start: 40, end: 300 },
    fogLift: { start: 4, end: 55, seconds: 180 },
    grade: { brightness: 0, contrast: 1.05, saturation: 0.8, tint: "#eef0ee" },
    vignette: 0.34, exposure: 1.1, ambient: 1.8, farClip: 440,
    atmosphere: { fieldMist: 0.26, trenchMist: 0.2, fieldWidth: 140 },
  },
  // A hot August evening at Anzac: a low sun over the sea behind the
  // attackers, dry dust haze over the scrub and long shadows up the gullies.
  gallipoli: {
    sun: { color: "#ffd9a8", intensity: 1.7, elevation: 24, azimuth: -80, shadowStrength: 0.85 },
    sky: { zenith: "#5f86b4", horizon: "#d9cfb6", ground: "#6a624e", clouds: 0.2, cloud: "#f3e6cf", glow: "#ffd49a" },
    fog: { start: 70, end: 340 },
    grade: { brightness: 0, contrast: 1.05, saturation: 0.95, tint: "#fff4e4" },
    vignette: 0.28, exposure: 1.02, ambient: 1.4, farClip: 440,
  },
  // Overcast late morning; green-grey haze between the trees.
  verdun: {
    sun: { color: "#ece9dc", intensity: 0.95, elevation: 30, azimuth: -20, shadowStrength: 0.6 },
    sky: { zenith: "#8c989e", horizon: "#adb5ae", ground: "#4a5143", clouds: 0.85, cloud: "#b4b9b5", glow: "#e1e3d9" },
    // Long enough to fold the far hills, woods and the fort's ridge into the haze.
    fog: { start: 45, end: 260 },
    grade: { brightness: 0, contrast: 1.06, saturation: 0.88, tint: "#eef5ec" },
    vignette: 0.35, exposure: 1.1, ambient: 1.35, farClip: 400,
    // Mist lies through the woods across the whole field and pools in the trenches.
    atmosphere: { fieldMist: 0.18, trenchMist: 0.14, fieldWidth: 132 },
  },
  // Warm late afternoon; long shadows down the streets.
  village: {
    sun: { color: "#ffdcb2", intensity: 1.65, elevation: 22, azimuth: -68, shadowStrength: 0.9 },
    sky: { zenith: "#6a8bb2", horizon: "#c8c8bf", ground: "#5d5850", clouds: 0.35, cloud: "#eee6d8", glow: "#ffd9a6" },
    fog: { start: 50, end: 175 },
    grade: { brightness: 0, contrast: 1.06, saturation: 0.96, tint: "#fff8ef" },
    vignette: 0.3, exposure: 1, ambient: 1.35,
  },
  // Bright coastal light and clear distance.
  headland: {
    sun: { color: "#fff4e2", intensity: 1.85, elevation: 50, azimuth: -45, shadowStrength: 0.85 },
    sky: { zenith: "#5b8cc2", horizon: "#c8d7de", ground: "#5c6961", clouds: 0.25, cloud: "#f4f6f4", glow: "#fff6e3" },
    fog: { start: 70, end: 195 },
    grade: { brightness: 0, contrast: 1.04, saturation: 1.06, tint: "#f6fbff" },
    vignette: 0.25, exposure: 1, ambient: 1.35,
  },
  // Plain daylight for practice.
  // Dusk above a sea of cloud: a low sun warms the hull, the sky deepens overhead.
  zeppelin: {
    sun: { color: "#ffc48a", intensity: 1.25, elevation: 9, azimuth: -68, shadowStrength: 0.8 },
    sky: { zenith: "#3c4a74", horizon: "#e8a77e", ground: "#b98f87", clouds: 0.35, cloud: "#f2c3a1", glow: "#ffd29a" },
    fog: { start: 110, end: 420 },
    grade: { brightness: 0, contrast: 1.06, saturation: 1.05, tint: "#fff1e2" },
    vignette: 0.26, exposure: 1.02, ambient: 1.1, farClip: 520,
    cloudSea: { top: "#f6d6bb", shade: "#9a7f88", scale: 2.4 },
  },
  "fort-vaux": {
    sun: { color: "#d5e5ed", intensity: 0.8, elevation: 55, azimuth: -42, shadowStrength: 0.9 },
    sky: { zenith: "#677b86", horizon: "#939e9d", ground: "#57554b", clouds: 0.8, cloud: "#b3c0c2", glow: "#d8ded7" },
    fog: { start: 34, end: 120 },
    grade: { brightness: 0, contrast: 1.05, saturation: 0.91, tint: "#f2f0e7" },
    vignette: 0.22, exposure: 0.98, ambient: 0.75,
  },
  training: {
    sun: { color: "#fff0d6", intensity: 1.5, elevation: 45, azimuth: -35, shadowStrength: 0.85 },
    sky: { zenith: "#7c98b4", horizon: "#c3c7c1", ground: "#5a594b", clouds: 0.45, cloud: "#e6e6df", glow: "#fbeed5" },
    fog: { start: 50, end: 170 },
    grade: { brightness: 0, contrast: 1.04, saturation: 1, tint: "#ffffff" },
    vignette: 0.25, exposure: 1.05, ambient: 1.35,
  },
};

// The same ground under rain (src/weather.ts): the sun lost behind a low,
// dark deck, flat light with faint shadows, the distance closed in by the
// downpour and the colour washed out of everything.
export const rainLooks: Partial<Record<MapDefinition["id"], MapLook>> = {
  trenches: {
    sun: { color: "#d3d2cc", intensity: 0.8, elevation: 30, azimuth: 70, shadowStrength: 0.22 },
    sky: { zenith: "#4c5560", horizon: "#8a9196", ground: "#3c3d37", clouds: 1, cloud: "#6f767c", glow: "#a5abae" },
    fog: { start: 14, end: 190 },
    grade: { brightness: 0, contrast: 1.05, saturation: 0.76, tint: "#eaeceb" },
    vignette: 0.38, exposure: 1.2, ambient: 2.35, farClip: 420,
    atmosphere: { fieldMist: 0.2, trenchMist: 0.16 },
  },
};

export const lookFor = (map: Pick<MapDefinition, "id">, rain = false) =>
  (rain ? rainLooks[map.id] : undefined) ?? mapLooks[map.id] ?? mapLooks.training;

// Unit vector pointing toward the sun.
export function sunDirection(look: MapLook): [number, number, number] {
  const e = look.sun.elevation * Math.PI / 180, a = look.sun.azimuth * Math.PI / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
}

export const hexColor = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
