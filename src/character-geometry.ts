export type CharacterShape =
  "soft" | "limb" | "tunic" | "head" | "helmet" | "disc" | "stock" | "coat" | "coatHem" | "sleeve" | "trouser" | "boot" | "palm" | "face" | "adrian" | "stahlhelm" | "brodie" | "pouch";
type Ring = [number, number, number];
const profiles: Record<CharacterShape, Ring[]> = {
  coat: [[-.5,.43,.43],[-.42,.46,.44],[-.18,.37,.37],[.08,.45,.44],[.3,.5,.44],[.43,.39,.34],[.5,.24,.25]],
  coatHem: [[-.5,.5,.49],[-.38,.49,.48],[.05,.45,.43],[.36,.42,.4],[.5,.41,.39]],
  sleeve: [[-.5,.32,.34],[-.39,.36,.37],[-.16,.4,.41],[.1,.45,.46],[.34,.5,.5],[.5,.42,.42]],
  trouser: [[-.5,.32,.34],[-.34,.37,.38],[-.03,.43,.45],[.28,.5,.5],[.5,.43,.43]],
  boot: [[-.5,.41,.44],[-.38,.5,.5],[-.12,.48,.48],[.02,.39,.38],[.18,.3,.26],[.5,.29,.24]],
  palm: [[-.5,.33,.23],[-.28,.45,.32],[.1,.5,.34],[.35,.45,.3],[.5,.3,.24]],
  face: [[-.5,.23,.22],[-.35,.34,.34],[-.16,.43,.39],[.02,.5,.44],[.26,.46,.42],[.46,.33,.3],[.5,.1,.12]],
  adrian: [[-.5,.48,.5],[-.32,.5,.5],[-.21,.43,.44],[.02,.39,.4],[.3,.3,.33],[.48,.13,.15],[.5,0,0]],
  stahlhelm: [[-.5,.48,.47],[-.27,.5,.5],[-.08,.44,.46],[.13,.4,.42],[.36,.29,.32],[.5,0,0]],
  // The Brodie bowl: shallow and wide, sitting on its separate flat brim.
  brodie: [[-.5,.5,.5],[-.3,.49,.49],[-.02,.44,.45],[.28,.33,.34],[.46,.14,.15],[.5,0,0]],
  pouch: [[-.5,.39,.4],[-.4,.48,.46],[-.1,.5,.5],[.3,.48,.48],[.45,.43,.45],[.5,.38,.4]],
  soft: [
    [-0.5, 0, 0],
    [-0.43, 0.3, 0.3],
    [-0.25, 0.44, 0.44],
    [0, 0.5, 0.5],
    [0.25, 0.44, 0.44],
    [0.43, 0.3, 0.3],
    [0.5, 0, 0],
  ],
  limb: [
    [-0.5, 0.34, 0.36],
    [-0.35, 0.38, 0.4],
    [0.18, 0.5, 0.5],
    [0.42, 0.48, 0.48],
    [0.5, 0.43, 0.43],
  ],
  tunic: [
    [-0.5, 0.42, 0.44],
    [-0.41, 0.5, 0.49],
    [-0.16, 0.4, 0.42],
    [0.18, 0.48, 0.49],
    [0.35, 0.5, 0.45],
    [0.48, 0.32, 0.33],
    [0.5, 0.25, 0.28],
  ],
  head: [
    [-0.5, 0.23, 0.28],
    [-0.34, 0.37, 0.41],
    [0, 0.5, 0.5],
    [0.29, 0.47, 0.47],
    [0.46, 0.3, 0.32],
    [0.5, 0, 0],
  ],
  helmet: [
    [-0.5, 0.47, 0.47],
    [-0.3, 0.5, 0.5],
    [0, 0.44, 0.44],
    [0.3, 0.32, 0.32],
    [0.5, 0, 0],
  ],
  disc: [
    [-0.5, 0, 0],
    [-0.5, 0.45, 0.45],
    [-0.3, 0.5, 0.5],
    [0.3, 0.5, 0.5],
    [0.5, 0.45, 0.45],
    [0.5, 0, 0],
  ],
  stock: [
    [-0.5, 0.2, 0.22],
    [-0.43, 0.25, 0.27],
    [0.06, 0.31, 0.3],
    [0.2, 0.26, 0.32],
    [0.35, 0.46, 0.49],
    [0.5, 0.46, 0.49],
  ],
};
// Shared low-resolution elliptical rings give cloth and limbs curved silhouettes
// and smooth normals without expensive default sphere meshes on every soldier.
export function characterGeometry(shape: CharacterShape, sides = 10) {
  const profile = profiles[shape],
    positions: number[] = [],
    normals: number[] = [],
    indices: number[] = [], uvs: number[] = [];
  for (let ring = 0; ring < profile.length; ring++) {
    const [y, rx, rz] = profile[ring],
      before = profile[Math.max(0, ring - 1)],
      after = profile[Math.min(profile.length - 1, ring + 1)];
    const dy = after[0] - before[0] || 1,
      dx = (after[1] - before[1]) / dy,
      dz = (after[2] - before[2]) / dy;
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2,
        c = Math.cos(a),
        sn = Math.sin(a);
      let x=rx*c,z=rz*sn;
      if(shape==="face")z-=Math.max(0,-sn)**16*Math.exp(-(((y+.015)/.16)**2))*.12;
      if(shape==="boot")z-=Math.max(0,-sn)*Math.max(0,.15-y)*.12;
      if(["coat","sleeve","trouser"].includes(shape)) {
        const fold=Math.sin(y*24+Math.sin(a*3))*Math.sin(a*5)*.012;
        x+=c*fold;z+=sn*fold;
      }
      if(shape==="stahlhelm"&&y<-.08)z+=Math.max(0,sn)*.06;
      positions.push(x, y, z);uvs.push(s/sides,y+.5);
      const nx = rz * c,
        ny = -(dx * rz * c * c + dz * rx * sn * sn),
        nz = rx * sn,
        n = Math.hypot(nx, ny, nz);
      normals.push(n ? nx / n : 0, n ? ny / n : ring ? 1 : -1, n ? nz / n : 0);
      if (ring && s < sides) {
        const a = (ring - 1) * (sides + 1) + s,
          b = a + 1,
          d = ring * (sides + 1) + s,
          c = d + 1;
        indices.push(a, d, c, a, c, b);
      }
    }
  }
  for (const end of [0, profile.length - 1]) {
    const [y, rx, rz] = profile[end];
    if (!rx || !rz) continue;
    const center = positions.length / 3,
      sign = end ? 1 : -1;
    positions.push(0, y, 0);uvs.push(.5,.5);
    normals.push(0, sign, 0);
    for (let side = 0; side <= sides; side++) {
      const a = (side / sides) * Math.PI * 2;
      positions.push(rx * Math.cos(a), y, rz * Math.sin(a));uvs.push(.5+Math.cos(a)*.5,.5+Math.sin(a)*.5);
      normals.push(0, sign, 0);
      if (side < sides)
        indices.push(
          center,
          center + 1 + side + (end ? 1 : 0),
          center + 1 + side + (end ? 0 : 1),
        );
    }
  }
  if(["face","boot","coat","sleeve","trouser","stahlhelm"].includes(shape)){
    const sums=new Array<number>(normals.length).fill(0);
    for(let i=0;i<indices.length;i+=3){
      const [a,b,c]=indices.slice(i,i+3).map(v=>v*3);
      const ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2];
      const vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2];
      for(const at of [a,b,c]){sums[at]+=uy*vz-uz*vy;sums[at+1]+=uz*vx-ux*vz;sums[at+2]+=ux*vy-uy*vx;}
    }
    for(let ring=0;ring<profile.length;ring++)for(let axis=0;axis<3;axis++){
      const a=ring*(sides+1)*3+axis,b=a+sides*3;sums[a]=sums[b]=sums[a]+sums[b];
    }
    for(let i=0;i<sums.length;i+=3){const length=Math.hypot(sums[i],sums[i+1],sums[i+2]);if(length>1e-8)for(let axis=0;axis<3;axis++)normals[i+axis]=sums[i+axis]/length;}
  }
  return { positions, normals, indices, uvs };
}
