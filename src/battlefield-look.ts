// Deterministic presentation noise. Never consumes the simulation's random stream.
const fract = (n: number) => n - Math.floor(n);
export const lookNoise = (x: number, z: number, period = 0): number => {
  const wrap = (v: number) => (period ? ((v % period) + period) % period : v);
  const hash = (a: number, b: number) =>
    fract(Math.sin(wrap(a) * 127.1 + wrap(b) * 311.7) * 43758.5453);
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = fract(x),
    fz = fract(z);
  const u = fx * fx * (3 - 2 * fx),
    v = fz * fz * (3 - 2 * fz);
  return (
    (hash(ix, iz) * (1 - u) + hash(ix + 1, iz) * u) * (1 - v) +
    (hash(ix, iz + 1) * (1 - u) + hash(ix + 1, iz + 1) * u) * v
  );
};
export type SurfaceKind = "mud" | "wood" | "bark" | "plaster" | "floorboards";
export function surfacePixels(kind: SurfaceKind, size = 256) {
  const diffuse = new Uint8Array(size * size * 4),
    normal = new Uint8Array(diffuse.length),
    gloss = new Uint8Array(diffuse.length);
  const heights = new Float32Array(size * size);
  const isWood=kind==="wood"||kind==="floorboards";
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size;
      const large = lookNoise(u * 8, v * 8, 8),
        grain = lookNoise(u * 64, v * 64, 64);
      const ridge = Math.sin(
        u * Math.PI * 2 * 23 +
          lookNoise(u * 8, v * 8, 8) * 4 +
          Math.sin(v * Math.PI * 4) * 0.6,
      );
      const knot = Math.sin(v * Math.PI * 2) * Math.sin(u * Math.PI * 2 * 3);
      const split = Math.max(0, 1 - Math.abs(Math.sin(u * Math.PI * 2 * 13 + large * 2 + knot * 0.5)) / 0.045);
      const pore = Math.max(0, grain - 0.65) * 0.4;
      const plankSeam=kind==="floorboards" && ((u*8)%1)<.025?1:0;
      const wood = -.32*plankSeam + 0.57 + large * 0.24 + ridge * 0.09 + grain * 0.08 - split * 0.29 - pore;
      const mud =
        0.63 +
        large * 0.3 +
        grain * 0.16 -
        Math.max(0, lookNoise(u * 32, v * 32, 32) - 0.64) * 0.5;
      const fissure = kind === "bark" ? Math.max(0, 1 - Math.abs(Math.sin(u * Math.PI * 2 * 17 + large * 2 + Math.sin(v * Math.PI * 6) * .3)) / .13) : 0;
      const bark = .49 + large * .22 + grain * .13 - fissure * .32;
      const plaster=.83+grain*.11-large*.13-Math.max(0,Math.sin(u*31+large*4)*Math.sin(v*23+large*7)-.94)*3;
      const tone = Math.max(0, Math.min(0.98, kind === "plaster" ? plaster : kind === "bark" ? bark : isWood ? wood : mud)),
        i = (y * size + x) * 4;
      diffuse.set(
        [
          tone * 255,
          tone * (kind === "bark" ? 244 : isWood ? 246 : 252),
          tone * (kind === "bark" ? 220 : isWood ? 226 : 245),
          255,
        ],
        i,
      );
      heights[y * size + x] =
        kind === "plaster" ? grain*.04+large*.03 : kind === "bark" ? grain * .1 + large * .12 - fissure * .5 : isWood
          ? ridge * 0.12 + grain * 0.08 - split * 0.35 - plankSeam*.4
          : large * 0.5 + grain * 0.25;
      const shine = kind === "plaster" ? 12 : kind === "bark" ? 9 : isWood ? 20 : 22 + Math.max(0, 0.5 - large) * 210;
      gloss.set([shine, shine, shine, 255], i);
    }
  const h = (x: number, y: number) =>
    heights[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (h(x - 1, y) - h(x + 1, y)) * 2,
        dy = (h(x, y - 1) - h(x, y + 1)) * 2;
      const length = Math.hypot(dx, dy, 1);
      normal.set(
        [
          ((dx / length) * 0.5 + 0.5) * 255,
          ((dy / length) * 0.5 + 0.5) * 255,
          ((1 / length) * 0.5 + 0.5) * 255,
          255,
        ],
        (y * size + x) * 4,
      );
    }
  return { diffuse, normal, gloss };
}
export function dustPixels(size = 128) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1),
        v = y / (size - 1),
        r = Math.hypot((u - 0.5) * 2, (v - 0.5) * 2);
      const billow =
        lookNoise(u * 7 + 11, v * 7 + 19) * 0.65 +
        lookNoise(u * 19, v * 19) * 0.35;
      const edge = Math.max(0, Math.min(1, (1 - r) / 0.42));
      const alpha =
        edge * edge * (3 - 2 * edge) * Math.max(0, (billow - 0.18) / 0.82);
      const shade = 198 + billow * 57;
      data.set([shade, shade, shade, alpha * 255], (y * size + x) * 4);
    }
  return data;
}
export function overcastPixels(width = 512, height = 256) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = x / width,
        v = y / (height - 1),
        // PlayCanvas sphere UVs put the upper hemisphere in v < 0.5.
        high = Math.max(0, (0.5 - v) * 2);
      const cloud =
        lookNoise(u * 12, v * 12, 12) * 0.7 +
        lookNoise(u * 32, v * 32, 32) * 0.3;
      const brightness = high * (cloud - 0.45) * 38;
      data.set(
        [
          164 - high * 26 + brightness,
          176 - high * 24 + brightness,
          183 - high * 20 + brightness,
          255,
        ],
        (y * width + x) * 4,
      );
    }
  return data;
}
// Broad wet patches and subtle strata remain fixed in world space as terrain is rebuilt.
export function soilColor(
  x: number,
  y: number,
  z: number,
  dark: boolean,
  cut: number,
): number[] {
  const damp = (y < 1 ? 0.9 : 1) * (0.9 + lookNoise(x * 0.19 + 71, z * 0.19 - 37) * 0.16);
  // Map-sized materials provide old weathered variation. Runtime excavation adds
  // warm exposed clay and a darker deep center, rather than recoloring old scars.
  const fresh = Math.min(1, cut * 1.3);
  const shade = (dark ? 0.86 : 1) * damp;
  const strata = dark
    ? 1 + Math.sin(y * 11 + lookNoise(x * 0.4, z * 0.4) * 2) * 0.045
    : 1;
  const soil = [0.65 - fresh * 0.07, 0.59 - fresh * 0.15, 0.48 - fresh * 0.19];
  return soil.map((v) => (v * shade * strata) ** 2.2);
}
export const maxBlastClouds = 10;
