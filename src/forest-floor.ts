import { baseGroundHeight, groundHeight, type MapDefinition, type Vec } from "./map";
import { forestVariant, type ForestShape } from "./forest-geometry";

export type ForestFloorProp = Vec & { y: number; yaw: number; shape: ForestShape; scale: [number,number,number]; radius: number; tint: string };
export function forestFloorProps(map: MapDefinition): ForestFloorProp[] {
  if(!map.woodland)return [];
  const props: ForestFloorProp[]=[];
  const trees=(map.vegetation??[]).filter(b=>b.kind==="tree");
  for(const [i,tree] of trees.entries())for(let n=0;n<2;n++) {
    if(map.destruction?.objects[tree.id!]?.stage===2)continue;
    const seed=forestVariant(tree.id!),a=((seed%360)+n*137)*Math.PI/180;
    const offset=n===0?.9:1.8+(seed%7)*.16,x=tree.x+Math.cos(a)*offset,z=tree.z+Math.sin(a)*offset;
    const y=groundHeight(x,z,map);
    if(y<1.5 || y<baseGroundHeight(x,z,map)-.05 || map.sectors.some(s=>Math.hypot(x-s.x,z-s.z)<4))continue;
    if(map.terrain!.ramps.some(r=>Math.abs(x-r.x)<r.w/2+1 && Math.abs(z-r.z)<r.d/2+1))continue;
    if([[-.55,0],[.55,0],[0,-.55],[0,.55]].some(([dx,dz])=>Math.abs(groundHeight(x+dx,z+dz,map)-y)>.08))continue;
    const shape: ForestShape=n===0?i%2?"root":"branch":i%2?"fern":"litter";
    const scale: [number,number,number]=shape==="fern"?[.85,.42,.85]:shape==="litter"?[.85,1,.85]:[.95+(seed%5)*.12,1,1];
    props.push({x,z,y:y+.008,yaw:a*180/Math.PI,shape,scale,radius:shape==="fern"?.6:.85,tint:shape==="fern"?"#596348":shape==="litter"?"#776147":"#544536"});
  }
  return props.sort((a,b)=>forestVariant(`${a.x}:${a.z}`)-forestVariant(`${b.x}:${b.z}`)).slice(0,180);
}
