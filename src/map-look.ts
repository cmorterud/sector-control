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
  // Cold grey dawn over no man's land.
  trenches: {
    sun: { color: "#ecd5bd", intensity: 0.95, elevation: 16, azimuth: 70, shadowStrength: 0.7 },
    sky: { zenith: "#78879a", horizon: "#b5b9ba", ground: "#4b4e4b", clouds: 0.75, cloud: "#a9adb1", glow: "#e7cdb0" },
    fog: { start: 40, end: 165 },
    grade: { brightness: 0, contrast: 1.08, saturation: 0.82, tint: "#eaf0f6" },
    vignette: 0.35, exposure: 1.1, ambient: 1.35,
  },
  // Overcast late morning; green-grey haze between the trees.
  verdun: {
    sun: { color: "#e8ebe3", intensity: 0.9, elevation: 42, azimuth: -20, shadowStrength: 0.65 },
    sky: { zenith: "#8c989e", horizon: "#adb5ae", ground: "#4a5143", clouds: 0.85, cloud: "#b4b9b5", glow: "#e1e3d9" },
    fog: { start: 45, end: 170 },
    grade: { brightness: 0, contrast: 1.06, saturation: 0.88, tint: "#eef5ec" },
    vignette: 0.35, exposure: 1.1, ambient: 1.35,
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
  training: {
    sun: { color: "#fff0d6", intensity: 1.5, elevation: 45, azimuth: -35, shadowStrength: 0.85 },
    sky: { zenith: "#7c98b4", horizon: "#c3c7c1", ground: "#5a594b", clouds: 0.45, cloud: "#e6e6df", glow: "#fbeed5" },
    fog: { start: 50, end: 170 },
    grade: { brightness: 0, contrast: 1.04, saturation: 1, tint: "#ffffff" },
    vignette: 0.25, exposure: 1.05, ambient: 1.35,
  },
};

export const lookFor = (map: Pick<MapDefinition, "id">) => mapLooks[map.id] ?? mapLooks.training;

// Unit vector pointing toward the sun.
export function sunDirection(look: MapLook): [number, number, number] {
  const e = look.sun.elevation * Math.PI / 180, a = look.sun.azimuth * Math.PI / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
}

export const hexColor = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
