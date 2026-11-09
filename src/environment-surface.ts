import { lookNoise } from "./battlefield-look";

const fract = (n: number) => n - Math.floor(n);
const hash = (x: number, y: number, p: number) =>
  fract(Math.sin((((x % p) + p) % p) * 127.1 + (((y % p) + p) % p) * 311.7) * 43758.5453);

// One shared 1.6 m tile. Cellular clods, embedded grit and dark fissures supply
// real albedo/height/roughness detail rather than a uniform brown noise wash.
export function earthPixels(size = 512) {
  const diffuse = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(diffuse.length), gloss = new Uint8Array(diffuse.length);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const gx = u * 18 + (lookNoise(u * 8, v * 8, 8) - 0.5) * 1.2;
    const gy = v * 18 + (lookNoise(u * 8 + 3, v * 8 + 7, 8) - 0.5) * 1.2;
    let first = 9, second = 9;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = Math.floor(gx) + dx, cy = Math.floor(gy) + dy;
      const d = Math.hypot(gx - cx - hash(cx, cy, 18), gy - cy - hash(cx + 39, cy + 17, 18));
      if (d < first) { second = first; first = d; }
      else second = Math.min(second, d);
    }
    const fissure = Math.max(0, 1 - (second - first) / 0.1) * Math.max(0, (lookNoise(u * 8 + 3, v * 8, 8) - 0.35) / 0.65);
    const grain = lookNoise(u * 128, v * 128, 128);
    const coarse = lookNoise(u * 8, v * 8, 8);
    const pebble = Math.max(0, (lookNoise(u * 64 + 11, v * 64, 64) - 0.72) / 0.28);
    const clod = Math.max(0, 1 - first / 0.68);
    const tone = Math.min(0.98, 0.49 + coarse * 0.25 + clod * clod * 0.14 + grain * 0.14 - fissure * 0.1 + pebble * 0.15);
    const i = (y * size + x) * 4;
    diffuse.set([tone * 255, tone * 235, tone * 202, 255], i);
    height[y * size + x] = clod * clod * 0.55 - fissure * 0.08 + grain * 0.14 + pebble * 0.4;
    const shine = 15 + (1 - coarse) * 24 + fissure * 28;
    gloss.set([shine, shine, shine, 255], i);
  }
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x - 1, y) - at(x + 1, y)) * 3, dy = (at(x, y - 1) - at(x, y + 1)) * 3;
    const length = Math.hypot(dx, dy, 1);
    normal.set([(dx / length * 0.5 + 0.5) * 255, (dy / length * 0.5 + 0.5) * 255, (1 / length * 0.5 + 0.5) * 255, gloss[(y * size + x) * 4]], (y * size + x) * 4);
  }
  return { diffuse, normal, gloss };
}

// Vertex alpha is an excavation mask, not opacity. Any meaningful runtime cut
// fully replaces the old grass/paving; existing vertical earth is soil too.
export const exposedEarth = (cut: number, wall = false) => wall ? 1 : Math.max(0, Math.min(1, cut * 20));

const earthSampling = `
uniform sampler2D earthDiffuse;
vec3 earthWeights() {
  vec3 w = pow(abs(dVertexNormalW), vec3(4.0));
  return w / max(dot(w, vec3(1.0)), 0.0001);
}
vec3 earthAlbedo() {
  vec3 w = earthWeights();
  vec3 p = vPositionW * 0.625;
  return pow(texture2DBias(earthDiffuse, p.zy, -0.5).rgb * w.x +
    texture2DBias(earthDiffuse, p.xz, -0.5).rgb * w.y +
    texture2DBias(earthDiffuse, p.xy, -0.5).rgb * w.z, vec3(2.2));
}
`;
export const earthDiffusePS = `${earthSampling}
uniform vec3 material_diffuse;
void getAlbedo() {
  vec3 painted = {STD_DIFFUSE_TEXTURE_DECODE}(texture2DBias({STD_DIFFUSE_TEXTURE_NAME}, {STD_DIFFUSE_TEXTURE_UV}, {STD_TEXTURE_BIAS})).rgb;
  vec3 soil = earthAlbedo();
  vec3 detail = mix(vec3(1.0), soil / vec3(0.50, 0.42, 0.30), 0.38);
  float exposed = max(vVertexColor.a, smoothstep(0.35, 0.8, 1.0 - abs(dVertexNormalW.y)));
  dAlbedo = material_diffuse * vVertexColor.rgb * mix(painted * detail, soil, exposed);
}
`;
export const earthGlossPS = `
uniform float material_gloss;
void getGlossiness() {
  float oldGloss = texture2DBias({STD_GLOSS_TEXTURE_NAME}, {STD_GLOSS_TEXTURE_UV}, {STD_TEXTURE_BIAS}).r;
  float exposed = max(vVertexColor.a, smoothstep(0.35, 0.8, 1.0 - abs(dVertexNormalW.y)));
  dGlossiness = material_gloss * mix(oldGloss, earthGlossiness, exposed) + 0.0000001;
}
`;
// World-space normal detail on all three axes avoids stretched dirt on steep
// crater/trench faces. Geometric normals and the authored broad normal remain.
export const earthNormalPS = `
uniform sampler2D earthNormal;
float earthGlossiness;
uniform float material_bumpiness;
void getNormal() {
  vec3 broad = {STD_NORMAL_TEXTURE_DECODE}(texture2DBias({STD_NORMAL_TEXTURE_NAME}, {STD_NORMAL_TEXTURE_UV}, {STD_TEXTURE_BIAS}));
  vec3 n = normalize(dTBN * mix(vec3(0.0, 0.0, 1.0), broad, material_bumpiness * (1.0-vVertexColor.a)));
  vec3 p = vPositionW * 0.625;
  vec3 w = pow(abs(dVertexNormalW), vec3(4.0));
  w /= max(dot(w, vec3(1.0)), 0.0001);
  vec4 ax = texture2DBias(earthNormal, p.zy, -0.5);
  vec4 ay = texture2DBias(earthNormal, p.xz, -0.5);
  vec4 az = texture2DBias(earthNormal, p.xy, -0.5);
  earthGlossiness = ax.a*w.x + ay.a*w.y + az.a*w.z;
  vec2 a = ax.rg * 2.0 - 1.0;
  vec2 b = ay.rg * 2.0 - 1.0;
  vec2 c = az.rg * 2.0 - 1.0;
  vec3 perturb = vec3(0.0,a.y,a.x)*w.x + vec3(b.x,0.0,b.y)*w.y + vec3(c.x,c.y,0.0)*w.z;
  dNormalW = normalize(n + (perturb - n*dot(n,perturb)) * 0.48);
}
`;
