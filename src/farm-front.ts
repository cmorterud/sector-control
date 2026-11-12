import {groundHeight,dist,type MapDefinition,type Box,type Depression,type Vec} from "./map";

export interface FarmFront {
  tracks: {points:Vec[];width:number}[];
  pools: Vec[];
}
export const farmDrainage:Depression[] = [
  {x:-2,z:-34,radiusX:2.4,radiusZ:6,depth:.28},
  {x:1,z:-24,radiusX:2.8,radiusZ:7,depth:.38},
  {x:-1,z:-12,radiusX:2.4,radiusZ:6,depth:.27},
];
export function buildFarmFront(map:MapDefinition):{parts:Box[];farm:FarmFront} {
  const parts:Box[]=[];
  const place=(id:string,x:number,z:number,w:number,d:number,h:number,kind:Box['kind'],farmProp?:Box['farmProp'],lift=0)=>{
    if(Math.abs(x)>map.width/2-4 || Math.abs(z)>map.depth/2-3)return;
    if(Object.values(map.spawn).some(p=>dist(p,{x,z})<13))return;
    if(map.sectors.some(p=>dist(p,{x,z})<3))return;
    if(map.terrain?.firingPositions?.some(p=>Math.abs(x-p.x)<w/2+1.3 && Math.abs(z-p.z)<d/2+1.3))return;
    // Keep whole footprints off rounded shoulders, trench lanes and entrances.
    const levels:number[]=[];
    for(let px=x-w/2-.7;px<=x+w/2+.701;px+=.4)for(let pz=z-d/2-.7;pz<=z+d/2+.701;pz+=.4)levels.push(groundHeight(px,pz,map));
    if(Math.min(...levels)<1.6 || Math.max(...levels)-Math.min(...levels)>.45)return;
    if([...map.boxes,...parts].some(b=>Math.abs(b.x-x)<(b.w+w)/2+.18 && Math.abs(b.z-z)<(b.d+d)/2+.18 && (b.baseY??0)+b.h>Math.min(...levels)+lift))return;
    const bottom=Math.min(...levels)-.025;
    parts.push({id:`farm-${id}`,landmark:'farm',kind,x,z,w,d,h:h+groundHeight(x,z,map)-bottom,baseY:bottom+lift,...(farmProp?{farmProp,footingY:bottom}:{})});
  };
  // The supply districts are asymmetric, behind each force's front line.
  for(const [group,cx,cz] of [['west',-55,-39],['east',55,33]] as const){
    for(let i=0;i<7;i++)place(`${group}-crate-${i}`,cx+(i%3)*2.1-2.2,cz+Math.floor(i/3)*2.4,1.1,.9,.65+(i%2)*.13,'wood','crate');
    place(`${group}-cart`,cx+2,cz-4,2.8,1.5,.85,'wood','cart');
    for(let i=0;i<6;i++)place(`${group}-orchard-${i}`,cx-8+(i%3)*4.2,cz-8+Math.floor(i/3)*4.6,.45,.45,2.9+(i%3)*.45,'tree');
  }
  // Broken farm boundaries offer crouched pauses without screening standing fire.
  for(const [group,cx,cz] of [['north',-8,-45],['south',8,42],['west-yard',-33,-33],['east-yard',34,39],['drain-edge',-10,-14],['ruined-garden',9,18],['west-orchard',-66,-46],['east-orchard',63,45],['west-reserve',-34,12],['east-reserve',34,-18]] as const){
    for(let i=0;i<5;i++){
      const z=cz+(i-2)*3.3;
      place(`${group}-post-${i}`,cx,z,.16,.16,.9,'wood','fence');
      if(i===1 || i===3)continue; // broad gaps rather than a continuous barrier
      place(`${group}-rail-${i}`,cx,z+1.15,.14,2.05,.13,'wood','fence',.48);
    }
    for(let i=0;i<3;i++)place(`${group}-stone-${i}`,cx+2.4+i*2.5,cz+4,1.6,.45,.65+(i%2)*.2,'masonry');
    place(`${group}-cart`,cx-2.5,cz-5.5,2.8,1.5,.82,'wood','cart');
  }
  // Low, discontinuous garden walls make the existing farmhouse read as a place.
  const house=map.landmarks?.find(l=>l.kind==='farmhouse');
  if(house)for(const [i,[dx,dz,w,d]] of [[-6,-5,2.4,.4],[5,-5,2.4,.4],[-6,5,2.4,.4],[5,5,2.4,.4],[-7,1,.4,2.1],[7,-1,.4,2.1]].entries())
    place(`house-garden-${i}`,house.x+dx,house.z+dz,w,d,.8,'masonry');
  for(const [i,bay] of (map.terrain?.shelterBays??[]).entries()){
    const x=bay.x+1.15,z=bay.z+1.1,w=.55,d=.5;
    const y=groundHeight(x,z,map);
    if(y<.1 && [[-.4,-.4],[.4,.4],[-.4,.4],[.4,-.4]].every(([dx,dz])=>Math.abs(groundHeight(x+dx,z+dz,map)-y)<.04))
      parts.push({id:`farm-bay-cache-${i}`,landmark:'farm',kind:'wood',farmProp:'crate',x,z,w,d,h:.55,baseY:y,footingY:y});
  }
  // Trunks have no dense crowns; their real colliders disappear as they fall.
  for(const b of parts)if(b.kind==='tree')b.treeStyle='bare';
  return {parts,farm:{
    tracks:[
      {width:2.8,points:[{x:-65,z:-27},{x:-54,z:-36},{x:-34,z:-39},{x:-12,z:-43}]},
      {width:2.7,points:[{x:66,z:24},{x:55,z:34},{x:35,z:39},{x:12,z:44}]},
    ],
    pools:(map.terrain?.shelterBays??[]).filter((_,i)=>i%2===0).slice(0,4).map(p=>({x:p.x,z:p.z})),
  }};
}
