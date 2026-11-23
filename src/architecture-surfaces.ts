import { lookNoise } from "./battlefield-look";
export type ArchitecturalTexture = "stone" | "brick" | "slate" | "tiles" | "fabric" | "iron" | "limewash" | "fort-stone" | "fort-concrete";
export const architecturalTextures: ArchitecturalTexture[] = ["stone", "brick", "slate", "tiles", "fabric", "iron", "limewash", "fort-stone", "fort-concrete"];

// Shared 1.6 m material tiles, sampled in meters by architectural meshes.
export function architecturePixels(kind: ArchitecturalTexture, size = 256) {
  const diffuse = new Uint8Array(size*size*4), normal = new Uint8Array(diffuse.length), gloss = new Uint8Array(diffuse.length);
  const heights = new Float32Array(size*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const u=x/size,v=y/size,grain=lookNoise(u*128,v*128,128),weather=lookNoise(u*8,v*8,8);
    const roof=kind==="slate"||kind==="tiles",brick=kind==="brick";
    const rows=roof?10:brick?12:5,cols=roof?8:brick?5:4,row=Math.floor(v*rows);
    const bx=(u*cols+(row%2)*.5)%1,by=(v*rows)%1;
    const joint=bx<.025||by<.045;
    const block=lookNoise(Math.floor(u*cols+(row%2)*.5)*2,Math.floor(v*rows)*2,40);
    let h=joint?.05:.58+grain*.08+weather*.1;
    let tone=joint?.37:.67+block*.15+grain*.09-weather*.08;
    if(roof){h=joint?.06:.55+by*.2+grain*.04;tone=joint?.28:.66+block*.13+grain*.08;}
    if(kind==="tiles")h+=Math.sin(bx*Math.PI)*.16;
    if(kind==="fabric"){h=.3+(x%4<2?.07:0)+(y%4<2?.07:0)+grain*.12;tone=.76+grain*.12-weather*.04;}
    if(kind==="iron"){h=grain*.12;tone=.56+grain*.15-weather*.1;}
    if(kind==="limewash") {
      const trowel=lookNoise(u*22,v*22,22),stain=lookNoise(u*3,v*3,3);
      const crack=Math.max(0,1-Math.abs(Math.sin(u*Math.PI*14+weather*7+Math.sin(v*Math.PI*8)))/.035);
      h=.5+grain*.025+trowel*.035-crack*.045;
      tone=.83+grain*.04+trowel*.03-stain*.035-crack*.045;
    }
    if (kind === "fort-stone") {
      const courses = v * 5 + (lookNoise(u * 12, v * 12, 12) - .5) * .25;
      const course = Math.floor(courses);
      const phase = lookNoise(course, 4, 5);
      const stones = u * 5 + phase + (lookNoise(u * 18, v * 18, 18) - .5) * .22;
      const edge = (n: number) => Math.abs(n - Math.round(n));
      const mortar = Math.min(1, Math.min(edge(courses), edge(stones)) / .065);
      const shade = lookNoise(Math.floor(stones), course, 5);
      h = .24 + mortar * (.25 + grain * .11 + weather * .14);
      tone = .38 + mortar * (.17 + shade * .15 + grain * .15 - weather * .12);
    }
    if (kind === "fort-concrete") {
      const streak = lookNoise(u * 24, v * 6, 24), seepage = lookNoise(u * 4, v * 4, 4);
      const pores = Math.max(0, lookNoise(u * 92, v * 92, 92) - .74) * 3;
      h = .51 + grain * .08 + weather * .09 - pores * .2;
      tone = .81 + grain * .12 - streak * .12 - seepage * .23 - pores * .15;
    }
    const i=(y*size+x)*4;
    diffuse.set([tone*255,tone*(brick?208:kind==="tiles"?224:249),tone*(brick?175:kind==="tiles"?199:240),255],i);
    heights[y*size+x]=h;
    const shine=kind==="iron"?85:roof?26:kind==="fabric"?5:12;
    gloss.set([shine,shine,shine,255],i);
  }
  const at=(x:number,y:number)=>heights[((y+size)%size)*size+(x+size)%size];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const dx=(at(x-1,y)-at(x+1,y))*.8,dy=(at(x,y-1)-at(x,y+1))*.8,length=Math.hypot(dx,dy,1);
    normal.set([(dx/length*.5+.5)*255,(dy/length*.5+.5)*255,(1/length*.5+.5)*255,255],(y*size+x)*4);
  }
  return {diffuse,normal,gloss};
}

export function cisternWaterNormals(size = 128) {
  const height = (x: number, y: number) => lookNoise(x * 12 / size, y * 12 / size, 12) * .65
    + lookNoise((x + y) * 6 / size, (y - x) * 6 / size, 6) * .35;
  const normals = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = height(x - 1, y) - height(x + 1, y), ny = height(x, y - 1) - height(x, y + 1);
    const length = Math.hypot(nx, ny, 1);
    normals.set([128 + 127 * nx / length, 128 + 127 * ny / length, 128 + 127 / length, 255], (y * size + x) * 4);
  }
  return normals;
}
