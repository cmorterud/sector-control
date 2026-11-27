import { baseGroundHeight, coastDistance, groundHeight, type MapDefinition } from "./map";
import { lookNoise } from "./battlefield-look";

export const coastalRules={seaLevel:.35,maxGrass:240,grassHeight:.34};
type Point=[number,number,number];
export type CoastMesh={positions:number[];normals:number[];uvs:number[];colors:number[];indices:number[]};
export type CoastalGrass={x:number;y:number;z:number;yaw:number;scale:[number,number,number];tint:string};
const empty=():CoastMesh=>({positions:[],normals:[],uvs:[],colors:[],indices:[]});
const sample=(i:number)=>{const n=Math.sin(i*127.1+43.7)*43758.5453;return n-Math.floor(n);};
function stations(map:MapDefinition) {
  const coast=map.coast??[],points:{x:number;z:number;nx:number;nz:number;end?:boolean}[]=[];
  const area=coast.reduce((n,p,i)=>n+p.x*coast[(i+1)%coast.length].z-coast[(i+1)%coast.length].x*p.z,0);
  const normals=coast.map((p,i)=>{
    const next=coast[(i+1)%coast.length],dx=next.x-p.x,dz=next.z-p.z,n=Math.hypot(dx,dz)||1,sign=area>0?1:-1;
    return {x:-dz/n*sign,z:dx/n*sign};
  });
  const corners=coast.map((_,i)=>{const a=normals[i],b=normals[(i+coast.length-1)%coast.length],n=Math.hypot(a.x+b.x,a.z+b.z)||1;return{x:(a.x+b.x)/n,z:(a.z+b.z)/n};});
  const outside=(p:{x:number;z:number})=>Math.abs(p.x)>map.width/2||Math.abs(p.z)>map.depth/2;
  for(let i=0;i<coast.length;i++) {
    const a=coast[i],b=coast[(i+1)%coast.length];
    // A coastline may close beyond the terrain; nothing is drawn out there.
    if(outside(a)&&outside(b))continue;
    const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/3.5));
    for(let j=0;j<n;j++) {
      const t=j/n,nx=corners[i].x*(1-t)+corners[(i+1)%coast.length].x*t,nz=corners[i].z*(1-t)+corners[(i+1)%coast.length].z*t,length=Math.hypot(nx,nz)||1;
      points.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,nx:nx/length,nz:nz/length});
    }
    // Where the next stretch is skipped, finish this one at its end point and break the chain.
    const c=coast[(i+2)%coast.length];
    if(outside(b)&&outside(c)){const k=(i+1)%coast.length;points.push({x:b.x,z:b.z,nx:corners[k].x,nz:corners[k].z,end:true});}
  }
  return points;
}
function triangle(mesh:CoastMesh,a:Point,b:Point,c:Point,tint:number[],alpha=[1,1,1]) {
  const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);
  if(length<1e-8)return;
  const index=mesh.positions.length/3,vertical=Math.abs(n[1])/length<.5;
  for(const [i,p] of [a,b,c].entries()){
    mesh.positions.push(...p);mesh.normals.push(...n.map(v=>v/length));
    mesh.uvs.push((vertical?(Math.abs(n[0])>Math.abs(n[2])?p[2]:p[0]):p[0])*.625,(vertical?p[1]:p[2])*.625);
    mesh.colors.push(...tint,alpha[i]);
  }
  mesh.indices.push(index,index+1,index+2);
}
// Low layered sea cliffs and foreshore rocks live beyond the playable margin.
// One merged rock mesh and one foam mesh, with no extra collision or updates
// per rock. Gameplay continues to use the authored terrain and coastal border.
export function coastalGeometry(map:MapDefinition) {
  const rock=empty(),foam=empty(),points=stations(map),sea=coastalRules.seaLevel;
  const quad=(a:Point,b:Point,c:Point,d:Point,tint:number[])=>{triangle(rock,a,b,c,tint);triangle(rock,a,c,d,tint);};
  const bands=[0,.2,.46,.72,1];
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length];
    if(a.end)continue;
    // On a hillside map the land itself runs down into the water: a beach
    // there has no cliff to draw.
    const landTop=(p:typeof a)=>baseGroundHeight(p.x+p.nx*1.5,p.z+p.nz*1.5,map);
    const beach=!!map.terrain?.hill&&landTop(a)<sea+.6&&landTop(b)<sea+.6;
    const profile=(p:typeof a,index:number,t:number):Point=>{
      const top=map.terrain?.hill?landTop(p):Math.max(map.terrain?.bankHeight??2.4,landTop(p));
      const offset=.15+(1-t)*2.9+(sample(index+71)-.5)*.36*Math.sin(t*Math.PI);
      return [p.x-p.nx*offset,sea-.12+(top-sea+.12)*t+(sample(index+113)-.5)*.12*Math.sin(t*Math.PI),p.z-p.nz*offset];
    };
    if(!beach)for(let band=1;band<bands.length;band++) {
      const t=bands[band],low=bands[band-1],shade=.83+sample(i+band*9)*.12;
      const tint=(band===1?[.43,.48,.44]:band%2?[.68,.67,.58]:[.57,.60,.53]).map(n=>n*shade);
      quad(profile(a,i,t),profile(b,(i+1)%points.length,t),profile(b,(i+1)%points.length,low),profile(a,i,low),tint);
    }
    const topA=profile(a,i,1),topB=profile(b,(i+1)%points.length,1);
    if(!beach)quad(topA,[a.x+a.nx*.85,topA[1]-.035,a.z+a.nz*.85],[b.x+b.nx*.85,topB[1]-.035,b.z+b.nz*.85],topB,[.63,.65,.55]);
    // Broken, feathered wash patches rather than a solid white outline.
    const x=(a.x+b.x)/2-a.nx*(3.4+sample(i)*.8),z=(a.z+b.z)/2-a.nz*(3.4+sample(i)*.8);
    if(i%3!==1&&coastDistance(x,z,map)<-.35) {
      const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1,along=.7+sample(i+2)*.75,across=.25+sample(i+3)*.32;
      const center:Point=[x,sea+.018,z];
      const corners:Point[]=[[-1,-1],[-1,1],[1,1],[1,-1]].map(([u,v])=>[x+dx/len*u*along+a.nx*v*across,sea+.018,z+dz/len*u*along+a.nz*v*across]);
      for(let j=0;j<4;j++)triangle(foam,center,corners[j],corners[(j+1)%4],[.83,.87,.78],[.75,0,0]);
    }
    if(i%4===0&&!beach) {
      const x=a.x-a.nx*(3+sample(i+8)*2.5),z=a.z-a.nz*(3+sample(i+8)*2.5);
      if(coastDistance(x,z,map)>-.25)continue;
      const radius=.55+sample(i+7)*.7,top:Point=[x+.1,sea+.25+sample(i+9)*.5,z-.05];
      const ring:Point[]=Array.from({length:7},(_,j)=>{const angle=j/7*Math.PI*2;return[x+Math.cos(angle)*radius,sea-.07,z+Math.sin(angle)*radius*.7];});
      for(let j=0;j<7;j++)triangle(rock,top,ring[(j+1)%7],ring[j],[.56,.60,.55]);
    }
  }
  return {rock,foam};
}
export function coastalGrass(map:MapDefinition):CoastalGrass[] {
  const props:CoastalGrass[]=[];
  for(const [i,p] of stations(map).entries())for(let j=0;j<2;j++) {
    const inland=2.4+sample(i*3+j)*4.5,x=p.x+p.nx*inland,z=p.z+p.nz*inland;
    if(coastDistance(x,z,map)<1.8 || map.buildings?.some(b=>Math.abs(x-b.x)<b.w/2+1&&Math.abs(z-b.z)<b.d/2+1))continue;
    if(map.sectors.some(s=>Math.hypot(x-s.x,z-s.z)<6))continue;
    let road=false;
    for(const street of map.streets??[])for(let k=1;k<street.points.length;k++) {
      const a=street.points[k-1],b=street.points[k],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
      road ||= Math.hypot(x-a.x-dx*t,z-a.z-dz*t)<street.width/2+.8;
    }
    const y=groundHeight(x,z,map);
    if(road||y<1.7||[[-.3,0],[.3,0],[0,-.3],[0,.3]].some(([dx,dz])=>Math.abs(groundHeight(x+dx,z+dz,map)-y)>.15))continue;
    const size=.5+sample(i+31)*.45;
    props.push({x,z,y:y+.008,yaw:sample(i+17)*360,scale:[size,.18+sample(i+21)*.16,size],tint:["#82885f","#737e57","#93916a"][i%3]});
  }
  return props.slice(0,coastalRules.maxGrass);
}
export function coastalWaterNormals(size=256) {
  const pixels=new Uint8Array(size*size*4),heights=new Float32Array(size*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const u=x/size,v=y/size;
    heights[y*size+x]=Math.sin((u*7+v*3)*Math.PI*2)*.45+Math.sin((u*3-v*5)*Math.PI*2)*.18+lookNoise(u*16,v*16,16)*.08;
  }
  const at=(x:number,y:number)=>heights[((y+size)%size)*size+(x+size)%size];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const dx=(at(x-1,y)-at(x+1,y))*.6,dy=(at(x,y-1)-at(x,y+1))*.6,len=Math.hypot(dx,dy,1);
    pixels.set([(dx/len*.5+.5)*255,(dy/len*.5+.5)*255,(1/len*.5+.5)*255,255],(y*size+x)*4);
  }
  return pixels;
}
