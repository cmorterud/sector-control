import { hexColor, type MapLook } from "./map-look";

type Vec3 = [number, number, number];
// Cubemap faces in PlayCanvas order (+x, -x, +y, -y, +z, -z). u and v run
// from -1 to 1 across the face, v from the top row down.
export function cubeDirection(face: number, u: number, v: number): Vec3 {
  const d: Vec3 = face === 0 ? [1, -v, -u] : face === 1 ? [-1, -v, u] : face === 2 ? [u, 1, v]
    : face === 3 ? [u, -1, -v] : face === 4 ? [u, -v, 1] : [-u, -v, -1];
  const l = Math.hypot(...d);
  return [d[0] / l, d[1] / l, d[2] / l];
}

const hash = (x: number, y: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
function valueNoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const fbm = (x: number, y: number) =>
  valueNoise(x, y) * 0.5 + valueNoise(x * 2.03 + 17, y * 2.03 + 5) * 0.25 + valueNoise(x * 4.1 + 3, y * 4.1 + 29) * 0.15 + valueNoise(x * 8.3 + 11, y * 8.3 + 7) * 0.1;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// The sky seen in one direction, as sRGB 0-1. At the horizon it is exactly
// the look's horizon (fog) colour, apart from the sun's glow.
export function skyColor(look: MapLook, dir: Vec3, sun: Vec3): Vec3 {
  const zenith = hexColor(look.sky.zenith), horizon = hexColor(look.sky.horizon), ground = hexColor(look.sky.ground);
  const y = dir[1];
  // Below the horizon is ground bounce. It is never seen past the terrain,
  // but it fills shaded faces, so it stays partway toward the horizon colour.
  if (y < 0) return mix(horizon, ground, 0.6 * smooth(0, 0.3, -y));
  let c = mix(horizon, zenith, 1 - Math.pow(1 - y, 2.6));
  const facing = Math.max(0, dir[0] * sun[0] + dir[1] * sun[1] + dir[2] * sun[2]);
  // Clouds on a flat layer overhead, thinning into haze toward the horizon.
  const lift = y + 0.12, px = dir[0] / lift * 1.6, pz = dir[2] / lift * 1.6;
  const n = fbm(px, pz), cover = look.sky.clouds;
  const cloud = smooth(1 - cover - 0.05, 1 - cover + 0.35, n) * smooth(0.02, 0.25, y);
  const cloudShade = mix(mix(hexColor(look.sky.cloud), horizon, 0.35), hexColor(look.sky.cloud), 0.6 + 0.4 * facing);
  c = mix(c, cloudShade, cloud * 0.9);
  // A broad warm glow round the sun and a soft disc, both dimmed by cloud.
  const glow = hexColor(look.sky.glow), clear = 1 - cloud * 0.85;
  const halo = Math.pow(facing, 6) * 0.35 * (0.4 + 0.6 * clear) + Math.pow(facing, 400) * 0.9 * clear;
  return [0, 1, 2].map((i) => Math.min(1, c[i] + (glow[i] - c[i] * 0.4) * halo)) as Vec3;
}

const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toSrgb = (c: number) => c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;

// Six RGBA8 sRGB faces for a sky cubemap. scale multiplies linear radiance,
// so one sky can be stored dimmer and brought back by the scene's intensity.
export function skyCubemapFaces(look: MapLook, sun: Vec3, size = 256, scale = 1): Uint8Array[] {
  return Array.from({ length: 6 }, (_, face) => {
    const data = new Uint8Array(size * size * 4);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      // PlayCanvas samples cubemaps with x mirrored; mirror here to match.
      const d = cubeDirection(face, (i + 0.5) / size * 2 - 1, (j + 0.5) / size * 2 - 1);
      const c = skyColor(look, [-d[0], d[1], d[2]], sun);
      const o = (j * size + i) * 4;
      for (let k = 0; k < 3; k++) data[o + k] = Math.round(Math.min(1, toSrgb(toLinear(c[k]) * scale)) * 255);
      data[o + 3] = 255;
    }
    return data;
  });
}
