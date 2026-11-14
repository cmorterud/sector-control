import { characterGeometry } from "./character-geometry";
import { BoxGeometry } from "playcanvas";

type MeshData = ReturnType<typeof characterGeometry> & { uvs: number[] };
type Ring = [number, number, number, number?];
export type RifleShape = "stock" | "handguard" | "steel" | "barrel" |
  "band" | "guard" | "hood" | "sling" | "buttplate" | "screw" | "knob" | "shroud" | "notch" | "pin" | "slot" | "crescent" | "berthierStock" | "gewehrStock";

export const rifleTextureSize = 256;
const limitedSlope = (a: number, b: number) => a * b <= 0 ? 0 : Math.sign(a) * Math.min(Math.abs(a), Math.abs(b));
function refineProfile(profile: Ring[]): Ring[] {
  const result: Ring[] = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[Math.max(0, i - 1)], b = profile[i], c = profile[i + 1], d = profile[Math.min(profile.length - 1, i + 2)];
    result.push(b);
    const middle = [(b[0] + c[0]) / 2];
    for (let axis = 1; axis < 4; axis++) {
      const av = a[axis] ?? 0, bv = b[axis] ?? 0, cv = c[axis] ?? 0, dv = d[axis] ?? 0;
      middle.push((bv + cv) / 2 + (limitedSlope(bv - av, cv - bv) - limitedSlope(cv - bv, dv - cv)) / 8);
    }
    result.push(middle as Ring);
  }
  result.push(profile[profile.length - 1]);
  return result;
}

// These profiles describe the furniture and machined parts, independently of
// the inexpensive cloth/limb meshes. All meshes are shared by every rifle.
function latheMesh(profile: Ring[], sides: number, caps = true, refined = true): MeshData {
  if(refined)profile = refineProfile(profile);
  sides = Math.max(6,Math.round(sides * (refined ? 2 : 1)));
  const positions: number[] = [], normals: number[] = [], indices: number[] = [], uvs: number[] = [];
  for (let ring = 0; ring < profile.length; ring++) {
    const [y, rx, rz, offset = 0] = profile[ring];
    const before = profile[Math.max(0, ring - 1)], after = profile[Math.min(profile.length - 1, ring + 1)];
    const dy = after[0] - before[0], dx = after[1] - before[1], dz = after[2] - before[2];
    const center = (after[3] ?? 0) - (before[3] ?? 0);
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle);
      positions.push(rx * c, y, offset + rz * s);
      const nx = dy * rz * c, ny = -(dx * rz * c * c + rx * (center + dz * s) * s), nz = dy * rx * s;
      const length = Math.hypot(nx, ny, nz);
      normals.push(length ? nx / length : 0, length ? ny / length : ring ? 1 : -1, length ? nz / length : 0);
      uvs.push(side / sides, y + 0.5);
      if (ring && side < sides) {
        const a = (ring - 1) * (sides + 1) + side, d = ring * (sides + 1) + side;
        indices.push(a, d, d + 1, a, d + 1, a + 1);
      }
    }
  }
  if (caps) for (const end of [0, profile.length - 1]) {
    const [y, rx, rz, offset = 0] = profile[end], sign = end ? 1 : -1;
    const base = positions.length / 3;
    positions.push(0, y, offset); normals.push(0, sign, 0); uvs.push(0.5, 0.5);
    for (let side = 0; side <= sides; side++) {
      const a = side / sides * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      positions.push(rx * c, y, offset + rz * s); normals.push(0, sign, 0); uvs.push(0.5 + c * 0.5, 0.5 + s * 0.5);
      if (side < sides) indices.push(base, base + 1 + side + (end ? 1 : 0), base + 1 + side + (end ? 0 : 1));
    }
  }
  return { positions, normals, indices, uvs };
}

function merge(meshes: MeshData[]): MeshData {
  const result: MeshData = { positions: [], normals: [], indices: [], uvs: [] };
  for (const mesh of meshes) {
    const offset = result.positions.length / 3;
    result.indices.push(...mesh.indices.map(i => i + offset));
    result.positions.push(...mesh.positions); result.normals.push(...mesh.normals); result.uvs.push(...mesh.uvs);
  }
  return result;
}

// Open elliptical loops: a real trigger guard, sling swivel and sight hood.
function loopMesh(segments: number, tubeSides: number, thickness: number, refined=true): MeshData {
  segments *= refined?2:1; tubeSides *= refined?2:1;
  const positions: number[] = [], normals: number[] = [], indices: number[] = [], uvs: number[] = [];
  for (let i = 0; i <= segments; i++) for (let j = 0; j <= tubeSides; j++) {
    const a = i / segments * Math.PI * 2, b = j / tubeSides * Math.PI * 2;
    const radius = 0.5 - thickness + thickness * Math.cos(b);
    positions.push(0.5 * Math.sin(b), radius * Math.cos(a), radius * Math.sin(a));
    const nx = 2 * Math.sin(b), ny = Math.cos(b) * Math.cos(a) / thickness, nz = Math.cos(b) * Math.sin(a) / thickness;
    const length = Math.hypot(nx, ny, nz);
    normals.push(nx / length, ny / length, nz / length); uvs.push(i / segments, j / tubeSides);
    if (i < segments && j < tubeSides) {
      const a = i * (tubeSides + 1) + j, d = a + tubeSides + 1;
      indices.push(a, d, d + 1, a, d + 1, a + 1);
    }
  }
  return { positions, normals, indices, uvs };
}

export function rifleGeometry(shape: RifleShape, detail:"view"|"world"|"far"="view"): MeshData {
  const lathe=(p:Ring[],s:number,c=true)=>latheMesh(p,detail==="far"?Math.max(6,s/2):s,c,detail==="view");
  const loop=(s:number,t:number,r:number)=>loopMesh(detail==="far"?Math.max(8,s/2):s,t,r,detail==="view");
  if(shape==="berthierStock" || shape==="gewehrStock")return lathe(shape==="berthierStock"?[
    [-.5,.23,.17,-.1],[-.46,.3,.2,-.08],[-.26,.33,.22,-.06],[-.05,.36,.24,-.025],
    [.12,.34,.24,0],[.21,.23,.22,.055],[.28,.25,.28,.1],[.34,.37,.4,.15],[.46,.49,.48,.2],[.5,.46,.46,.2],
  ]:[[-.5,.25,.18,-.08],[-.46,.34,.21,-.065],[-.24,.39,.23,-.035],[.06,.41,.26,0],
    [.17,.27,.23,.04],[.26,.24,.24,.08],[.34,.36,.38,.15],[.46,.49,.48,.24],[.5,.47,.46,.24]],24);

  if (shape === "crescent") {
    const result: MeshData = {positions:[], normals:[], indices:[], uvs:[]};
    const steps=48;
    const face=(points:number[][],normal:number[])=>{
      const base=result.positions.length/3;
      for(const [x,y,z] of points){result.positions.push(x,y,z);result.normals.push(...normal);result.uvs.push(z+.5,y+.5);}
      const u=points[1].map((v,i)=>v-points[0][i]),v=points[2].map((v,i)=>v-points[0][i]);
      const dot=(u[1]*v[2]-u[2]*v[1])*normal[0]+(u[2]*v[0]-u[0]*v[2])*normal[1]+(u[0]*v[1]-u[1]*v[0])*normal[2];
      result.indices.push(...(dot<0?[base,base+2,base+1,base,base+3,base+2]:[base,base+1,base+2,base,base+2,base+3]));
    };
    for(let i=0;i<steps;i++){
      const a=i/steps*Math.PI,b=(i+1)/steps*Math.PI;
      const yz=(t:number,r:number)=>[-Math.sin(t)*r+.25,Math.cos(t)*r];
      const [ay,az]=yz(a,.5),[by,bz]=yz(b,.5),[cy,cz]=yz(b,.3),[dy,dz]=yz(a,.3);
      for(const side of [-1,1])face([[side*.5,ay,az],[side*.5,by,bz],[side*.5,cy,cz],[side*.5,dy,dz]], [side,0,0]);
      for(const [radius,sign] of [[.5,1],[.3,-1]]){
        const [y,z]=yz(a,radius),[v,w]=yz(b,radius),t=(a+b)/2;
        face([[-.5,y,z],[.5,y,z],[.5,v,w],[-.5,v,w]], [0,-Math.sin(t)*sign,Math.cos(t)*sign]);
      }
    }
    for(const a of [0,Math.PI]){
      const y=.25,z=Math.cos(a);
      face([[-.5,y,z*.3],[.5,y,z*.3],[.5,y,z*.5],[-.5,y,z*.5]], [0,1,0]);
    }
    return result;
  }
  if (shape === "slot") {
    const box = new BoxGeometry();
    return { positions: box.positions, normals: box.normals, indices: box.indices, uvs: box.uvs };
  }
  if (shape === "notch") {
    const result: MeshData = { positions: [], normals: [], indices: [], uvs: [] };
    for (const sign of [-1, 1]) {
      const polygon = [[-0.5, -0.5], [0, -0.5], [0, 0.12], [-0.18, 0.5], [-0.5, 0.5]].map(([x, y]) => [x * sign, y]);
      if (sign < 0) polygon.reverse();
      for (const side of [-1, 1]) {
        const base = result.positions.length / 3;
        for (const [x, y] of polygon) { result.positions.push(x, y, side * 0.5); result.normals.push(0, 0, side); result.uvs.push(x + 0.5, y + 0.5); }
        for (let i = 1; i < polygon.length - 1; i++) result.indices.push(base, base + i + (side < 0 ? 1 : 0), base + i + (side < 0 ? 0 : 1));
      }
      for (let i = 0; i < polygon.length; i++) {
        const [x, y] = polygon[i], [a, b] = polygon[(i + 1) % polygon.length];
        const base = result.positions.length / 3, length = Math.hypot(a - x, b - y);
        for (const [u, v, z] of [[x, y, -0.5], [a, b, -0.5], [a, b, 0.5], [x, y, 0.5]]) {
          result.positions.push(u, v, z); result.normals.push((b - y) / length, (x - a) / length, 0); result.uvs.push(u + 0.5, v + 0.5);
        }
        result.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    return result;
  }
  if (shape === "stock") {
    const mesh = lathe([
    [-0.5, 0.25, 0.20, -0.08], [-0.47, 0.34, 0.23, -0.07],
    [-0.3, 0.40, 0.24, -0.04], [-0.12, 0.43, 0.27, -0.02],
    [0.06, 0.43, 0.29], [0.15, 0.29, 0.24, 0.04],
    [0.23, 0.26, 0.24, 0.08], [0.30, 0.34, 0.36, 0.10],
    [0.40, 0.48, 0.48, 0.20], [0.48, 0.50, 0.50, 0.25], [0.50, 0.47, 0.47, 0.25],
    ], 24);
    // Carve shallow finger channels into the wood itself, rather than drawing
    // a stripe onto an unchanged cylindrical fore-end.
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const y = mesh.positions[i + 1], t = (y + 0.28) / 0.38;
      if (t <= 0 || t >= 1) continue;
      const angle = mesh.uvs[i / 3 * 2] * Math.PI * 2;
      const c = Math.cos(angle);
      mesh.positions[i] -= Math.sign(c) * 0.04 * Math.sin(t * Math.PI) ** 2 * Math.abs(c) ** 12;
    }
    const normals = new Array<number>(mesh.normals.length).fill(0);
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const [a, b, c] = mesh.indices.slice(i, i + 3).map(index => index * 3);
      const ux = mesh.positions[b] - mesh.positions[a], uy = mesh.positions[b + 1] - mesh.positions[a + 1], uz = mesh.positions[b + 2] - mesh.positions[a + 2];
      const vx = mesh.positions[c] - mesh.positions[a], vy = mesh.positions[c + 1] - mesh.positions[a + 1], vz = mesh.positions[c + 2] - mesh.positions[a + 2];
      for (const index of [a, b, c]) {
        normals[index] += uy * vz - uz * vy; normals[index + 1] += uz * vx - ux * vz; normals[index + 2] += ux * vy - uy * vx;
      }
    }
    const ringCount=detail==="view"?21:11,stride=detail==="view"?49:detail==="far"?13:25;
    for (let ring = 0; ring < ringCount; ring++) {
      const a = ring * stride * 3, b = a + (stride-1) * 3;
      for (let axis = 0; axis < 3; axis++) normals[a + axis] = normals[b + axis] = normals[a + axis] + normals[b + axis];
    }
    for (let i = 0; i < normals.length; i += 3) {
      const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
      if (length) for (let axis = 0; axis < 3; axis++) mesh.normals[i + axis] = normals[i + axis] / length;
    }
    return mesh;
  }
  if (shape === "handguard") return lathe([
    [-0.5, 0.30, 0.30], [-0.44, 0.45, 0.43], [0, 0.50, 0.50],
    [0.44, 0.45, 0.43], [0.5, 0.30, 0.30],
  ], 16);
  if (shape === "buttplate") return lathe([
    [-0.5, 0.43, 0.43], [-0.25, 0.5, 0.5], [0.25, 0.5, 0.5], [0.5, 0.43, 0.43],
  ], 16);
  if (shape === "guard") return loop(24, 4, 0.08);
  if (shape === "hood") return loop(24, 4, 0.065);
  if (shape === "sling") return loop(16, 4, 0.1);
  if (shape === "barrel") {
    const outside = lathe([[-0.5, 0.42, 0.42], [-0.44, 0.45, 0.45], [-0.25, 0.5, 0.5], [0.5, 0.5, 0.5]], 32, false);
    const mouth = lathe([[-0.5, 0.17, 0.17], [-0.5, 0.42, 0.42]], 32, false);
    const inside = lathe([[-0.5, 0.17, 0.17], [-0.35, 0.17, 0.17]], 32, false);
    inside.normals = inside.normals.map(n => -n);
    for (let i = 0; i < inside.indices.length; i += 3)
      [inside.indices[i + 1], inside.indices[i + 2]] = [inside.indices[i + 2], inside.indices[i + 1]];
    return merge([outside, mouth, inside]);
  }
  const sides = shape === "screw" || shape === "pin" ? 12 : shape === "shroud" ? 20 : 32;
  return lathe(shape === "knob" ? [
    [-0.5, 0, 0], [-0.43, 0.3, 0.3], [-0.25, 0.44, 0.44], [0, 0.5, 0.5],
    [0.25, 0.44, 0.44], [0.43, 0.3, 0.3], [0.5, 0, 0],
  ] : [
    [-0.5, 0, 0], [-0.5, 0.45, 0.45], [-0.3, 0.5, 0.5], [0.3, 0.5, 0.5], [0.5, 0.45, 0.45], [0.5, 0, 0],
  ], sides, false);
}

export type RiflePart = { name: string; shape: RifleShape; at: [number, number, number]; size: [number, number, number]; tint: string; rotation?: [number, number, number] };
export const detailedRifleParts: RiflePart[] = [
  { name: "wooden stock", shape: "stock", at: [0, -0.045, 0.04], size: [0.105, 0.94, 0.18], tint: "walnut", rotation: [90, 0, 0] },
  { name: "upper handguard", shape: "handguard", at: [0, 0.022, -0.27], size: [0.072, 0.28, 0.042], tint: "walnut", rotation: [90, 0, 0] },
  { name: "receiver", shape: "steel", at: [0, 0.025, 0.07], size: [0.075, 0.28, 0.075], tint: "steel", rotation: [90, 0, 0] },
  { name: "barrel", shape: "barrel", at: [0, 0.025, -0.385], size: [0.04, 0.63, 0.04], tint: "steel", rotation: [90, 0, 0] },
  ...[-0.35, -0.43].map(z => ({ name: "barrel band", shape: "band" as const, at: [0, z < -0.4 ? -0.023 : -0.018, z] as [number, number, number], size: [z < -0.4 ? 0.08 : 0.105, 0.024, z < -0.4 ? 0.14 : 0.13] as [number, number, number], tint: "steel", rotation: [90, 0, 0] as [number, number, number] })),
  { name: "open trigger guard", shape: "guard", at: [0, -0.105, 0.18], size: [0.012, 0.09, 0.14], tint: "steel" },
  { name: "buttplate", shape: "buttplate", at: [0, -0.09, 0.514], size: [0.101, 0.012, 0.173], tint: "steel", rotation: [90, 0, 0] },
  { name: "front sight hood", shape: "hood", at: [0, 0.115, -0.65], size: [0.018, 0.065, 0.065], tint: "steel", rotation: [0, 90, 0] },
  { name: "front sight base", shape: "buttplate", at: [0, 0.058, -0.65], size: [0.032, 0.035, 0.045], tint: "steel" },
  { name: "V-notch rear sight", shape: "notch", at: [0, 0.1005, -0.13], size: [0.075, 0.035, 0.04], tint: "steel" },
  { name: "rear sight base", shape: "buttplate", at: [0, 0.064, -0.13], size: [0.055, 0.045, 0.085], tint: "steel" },
  { name: "sling swivel", shape: "sling", at: [0, -0.1, -0.35], size: [0.01, 0.036, 0.05], tint: "steel" },
  ...[-0.09, 0.25].map(z => ({ name: "stock screw", shape: "screw" as const, at: [z > 0.2 ? 0.029 : 0.045, -0.06, z] as [number, number, number], size: [0.021, 0.005, 0.021] as [number, number, number], tint: "edge", rotation: [0, 0, 90] as [number, number, number] })),
  { name: "cleaning rod", shape: "pin", at: [0, -0.006, -0.57], size: [0.008, 0.26, 0.008], tint: "steel", rotation: [90, 0, 0] },
  { name: "rear sling washer", shape: "sling", at: [0.05, -0.08, 0.39], size: [0.006, 0.029, 0.029], tint: "edge" },
  { name: "rear sling recess", shape: "pin", at: [0.0495, -0.08, 0.39], size: [0.017, 0.002, 0.017], tint: "dark", rotation: [0, 0, 90] },
  ...[-0.09, 0.25].map(z => ({ name: "screw slot", shape: "slot" as const, at: [z > 0.2 ? 0.032 : 0.048, -0.06, z] as [number, number, number], size: [0.001, 0.003, 0.012] as [number, number, number], tint: "dark" })),
  ...[-1, 1].map(side => ({ name: "receiver rail", shape: "slot" as const, at: [side * 0.026, 0.063, 0.04] as [number, number, number], size: [0.008, 0.008, 0.12] as [number, number, number], tint: "edge" })),
];
export const boltGrip = { x: 0.105, y: -0.055, z: 0 };
export const detailedBoltParts: RiflePart[] = [
  { name: "bolt handle", shape: "steel", at: [0.025, 0, 0], size: [0.016, 0.055, 0.016], tint: "steel", rotation: [0, 0, -90] },
  { name: "bolt handle bend", shape: "shroud", at: [0.078, -0.028, 0], size: [0.014, 0.08, 0.014], tint: "steel", rotation: [0, 0, -132] },
  { name: "bolt knob", shape: "knob", at: [boltGrip.x, boltGrip.y, boltGrip.z], size: [0.045, 0.045, 0.045], tint: "steel" },
  { name: "bolt shroud", shape: "shroud", at: [-0.05, 0.005, 0.095], size: [0.06, 0.07, 0.06], tint: "steel", rotation: [90, 0, 0] },
];

// Deterministic close-up materials; no photos or simulation RNG are consumed.
export function rifleSurfacePixels(kind: "walnut" | "steel", size = rifleTextureSize) {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hash = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    const noise = hash - Math.floor(hash);
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    const grain = Math.sin(u * 25 + Math.sin(v * 2) * 1.8 + Math.sin(u * 5 + v) * 0.7);
    const fine = Math.sin(u * 91 + Math.sin(v * 3));
    const shade = kind === "walnut" ? 0.84 + grain * 0.09 + fine * 0.025 + noise * 0.05 : 0.92 + noise * 0.06 + Math.sin(y * 1.9) * 0.02;
    const base = kind === "walnut" ? [126, 77, 41] : [82, 89, 87];
    pixels.set([...base.map(c => Math.round(c * shade)), 255], (y * size + x) * 4);
  }
  return pixels;
}

// Close-view reflectance follows the grain/machining rather than a uniform gloss.
export function rifleSurfaceMaps(kind:"walnut"|"steel",size=rifleTextureSize) {
  const diffuse=rifleSurfacePixels(kind,size),normal=new Uint8Array(diffuse.length),gloss=new Uint8Array(diffuse.length);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const at=(y*size+x)*4,u=x/size,v=y/size,wood=kind==="walnut";
    const grain=Math.sin(u*157+Math.sin(v*6.28)*3),edge=Math.exp(-(Math.min(u,1-u)**2)*900);
    const wear=wood?1: .78+edge*.18;
    for(let c=0;c<3;c++)diffuse[at+c]=Math.round(diffuse[at+c]*wear);
    normal.set([Math.round(128+grain*(wood?10:2)),Math.round(128+Math.sin(y*1.9)*(wood?2:4)),255,255],at);
    const value=wood?68+grain*11:90+edge*70+Math.sin(y*1.9)*7;
    gloss.set([value,value,value,255],at);
  }
  return {diffuse,normal,gloss};
}
