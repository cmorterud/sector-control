// Shared, normalized meshes: four variants per shape, rather than a mesh or
// animated foliage system per tree. All randomness is authoring-only.
export type ForestShape = "trunk" | "limbs" | "deadLimbs" | "pine" | "crown" | "fern" | "branch" | "root" | "litter";
export interface ForestGeometry { positions: number[]; normals: number[]; uvs: number[]; indices: number[] }
type Point = [number, number, number];
const sample = (seed: number, i: number) => {
  const n = Math.sin(seed * 91.7 + i * 127.1) * 43758.5453;
  return n - Math.floor(n);
};
export const forestVariant = (id: string) => [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;

export function forestGeometry(shape: ForestShape, variant = 0): ForestGeometry {
  const seed = (variant % 4) + 17, positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const tri = (a: Point, b: Point, c: Point, double = false) => {
    const x = (b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]);
    const y = (b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
    const z = (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const n = Math.hypot(x,y,z);
    if (n < 1e-10) return;
    const start = positions.length / 3;
    positions.push(...a,...b,...c); normals.push(x/n,y/n,z/n,x/n,y/n,z/n,x/n,y/n,z/n);
    uvs.push(0,0,1,0,.5,1); indices.push(start,start+1,start+2);
    if (double) tri(c,b,a);
  };
  const tube = (a: Point,b: Point,r0: number,r1: number, sides = 7) => {
    const axis = b.map((v,i)=>v-a[i]), length = Math.hypot(...axis);
    const u = Math.abs(axis[1]/length) < .9 ? [0,1,0] : [1,0,0];
    const cross = (a: number[],b: number[]) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const right = cross(axis,u), rl = Math.hypot(...right); right.forEach((v,i)=>right[i]=v/rl);
    const forward = cross(right,axis); const fl = Math.hypot(...forward); forward.forEach((v,i)=>forward[i]=v/fl);
    const ring = (p: Point,r: number,i: number): Point => p.map((v,k)=>v+r*(right[k]*Math.cos(i/sides*Math.PI*2)+forward[k]*Math.sin(i/sides*Math.PI*2))) as Point;
    for(let i=0;i<sides;i++) { const p=ring(a,r0,i),q=ring(a,r0,i+1),r=ring(b,r1,i),s=ring(b,r1,i+1);tri(p,r,q);tri(q,r,s); }
    for(let i=1;i<sides-1;i++){tri(ring(b,r1,0),ring(b,r1,i+1),ring(b,r1,i));}
  };
  if(shape === "trunk") {
    const sides=12, rows=9, start=positions.length/3;
    for(let j=0;j<rows;j++)for(let i=0;i<=sides;i++) {
      const t=j/(rows-1),a=i/sides*Math.PI*2;
      const radius=(.5*(1-t)**.7+.075*t)*(j===0?1.15:1)*(1+.045*Math.sin(a*5+seed));
      const x=Math.sin(t*2.2+seed)*t*.045,z=Math.cos(t*2.7+seed)*t*.04;
      positions.push(x+Math.cos(a)*radius,t+(j===rows-1?(sample(seed,i%12)-.5)*.035:0),z+Math.sin(a)*radius);
      const n=Math.hypot(1,.38);normals.push(Math.cos(a)/n,.38/n,Math.sin(a)/n);uvs.push(i/sides,j/(rows-1)*3);
      if(j<rows-1 && i<sides){const k=start+j*(sides+1)+i;indices.push(k,k+sides+1,k+1,k+1,k+sides+1,k+sides+2);}
    }
    const top=(i:number)=>positions.slice((start+(rows-1)*(sides+1)+i)*3,(start+(rows-1)*(sides+1)+i)*3+3) as Point;
    for(let i=1;i<sides-1;i++)tri(top(0),top(i+1),top(i));
  } else if(shape === "limbs" || shape === "deadLimbs") {
    const count=shape === "deadLimbs"?9:12;
    for(let i=0;i<count;i++) {
      const angle=i*2.399+seed,y=.35+i/count*.5,reach=.08+sample(seed,i)*.095;
      const a: Point=[0,y,0],b: Point=[Math.cos(angle)*reach*.55,y+.015,Math.sin(angle)*reach*.55];
      const c: Point=[Math.cos(angle)*reach,y+.035+(sample(seed,i+30)-.5)*.08,Math.sin(angle)*reach];
      tube(a,b,.012*(1-y*.5),.006);tube(b,c,.006,.0018,5);
      if(i%2===0)tube(b,[c[0]+Math.cos(angle+.8)*.04,c[1]+.035,c[2]+Math.sin(angle+.8)*.04],.004,.001,5);
    }
  } else if(shape === "pine") {
    // Individual ragged needle sprays break the silhouette and leave small
    // windows between branch whorls; no solid stacked cones.
    for(let row=0;row<7;row++) {
      const y=.44+row*.082+(sample(seed,row)-.5)*.025, radius=.225*(1-row/8);
      for(let i=0;i<11;i++) {
        if(sample(seed,row*23+i)<.13)continue;
        const angle=i/11*Math.PI*2+row*.71;
        const r=radius*(.72+sample(seed,row*31+i)*.38);
        const center: Point=[Math.cos(angle)*r*.5,y+.025,Math.sin(angle)*r*.5];
        const left: Point=[Math.cos(angle-.32)*r*.76,y-.025,Math.sin(angle-.32)*r*.76];
        const tip: Point=[Math.cos(angle)*r,y-.015,Math.sin(angle)*r];
        const right: Point=[Math.cos(angle+.32)*r*.76,y-.03,Math.sin(angle+.32)*r*.76];
        const base: Point=[0,y+.065,0];
        tri(base,left,center,true);tri(left,tip,center,true);tri(tip,right,center,true);tri(right,base,center,true);
      }
    }
    for(let i=0;i<5;i++){const a=i/5*Math.PI*2;tri([0,1.025,0],[Math.cos(a)*.055,.91,Math.sin(a)*.055],[Math.cos(a+1.25)*.055,.91,Math.sin(a+1.25)*.055],true);}
  } else if(shape === "crown") {
    for(let lobe=0;lobe<6;lobe++) {
      const angle=lobe*2.399+seed,cy=[.61,.72,.83,.66,.91,.78][lobe];
      const cx=Math.cos(angle)*.105,cz=Math.sin(angle)*.105;
      const point=(row: number,col: number): Point=>{
        const a=col/9*Math.PI*2,p=row/5*Math.PI,r=.085+sample(seed,lobe*7)*.035;
        const ragged=1+.18*Math.sin(a*3+lobe)+.12*Math.cos(p*5+seed+a*2);
        return [cx+Math.sin(p)*Math.cos(a)*r*ragged,cy+Math.cos(p)*r*1.1,cz+Math.sin(p)*Math.sin(a)*r*ragged];
      };
      for(let row=0;row<5;row++)for(let col=0;col<9;col++){
        tri(point(row,col),point(row,col+1),point(row+1,col));tri(point(row,col+1),point(row+1,col+1),point(row+1,col));
      }
    }
  } else if(shape === "fern") {
    for(let stem=0;stem<6;stem++) {
      const angle=stem*2.399+seed,reach=.35+sample(seed,stem)*.15;
      let previous: Point=[0,.015,0];
      for(let i=1;i<=7;i++) {
        const t=i/8,x=Math.cos(angle)*reach*t,z=Math.sin(angle)*reach*t,y=Math.sin(t*Math.PI*.8)*(.55+sample(seed,stem+10)*.3);
        tube(previous,[x,y,z],.007,.004,4);previous=[x,y,z];
        const width=.14*Math.sin(t*Math.PI);
        for(const side of [-1,1])tri([x,y,z],[x+Math.cos(angle+side*1.1)*width,y-.025,z+Math.sin(angle+side*1.1)*width],[x-Math.cos(angle)*.06,y-.045,z-Math.sin(angle)*.06],true);
      }
    }
  } else if(shape === "branch" || shape === "root") {
    const a: Point=[-.5,.035,0],b: Point=[-.06,shape==="root"?.13:.075,.03],c: Point=[.5,.025,-.04];
    tube(a,b,shape==="root"?.085:.035,.035);tube(b,c,.035,.009);
    tube(b,[.28,.04,.26],.027,.004,5);
  } else {
    for(let i=0;i<24;i++) {
      const x=(sample(seed,i)-.5)*.9,z=(sample(seed,i+40)-.5)*.9,a=sample(seed,i+70)*Math.PI*2;
      const p: Point=[x,.008,z],q: Point=[x+Math.cos(a)*.14,.018,z+Math.sin(a)*.14];
      const center: Point=[(p[0]+q[0])/2,.035,(p[2]+q[2])/2];
      const left: Point=[center[0]+Math.cos(a+1.57)*.04,.01,center[2]+Math.sin(a+1.57)*.04];
      const right: Point=[center[0]-Math.cos(a+1.57)*.04,.01,center[2]-Math.sin(a+1.57)*.04];
      tri(p,left,center,true);tri(left,q,center,true);tri(q,right,center,true);tri(right,p,center,true);
    }
  }
  return {positions,normals,uvs,indices};
}
