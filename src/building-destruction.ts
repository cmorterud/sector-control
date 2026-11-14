import { groundHeight, type MapDefinition, type Box } from "./map";
import type { DestructionChange } from "./destruction";

// A bounded support graph handles two stories without simulating every brick.
export function settleBuildings(map:MapDefinition, changes:DestructionChange["objects"],
  apply:(change:DestructionChange["objects"][number])=>void) {
  const state=map.destruction!;
  const parts=Object.values(state.objects).filter(o=>o.original.architecture);
  const destroy=(id:string)=>{const change={id,hp:0,stage:2};changes.push(change);apply(change);};
  for(let pass=0;pass<10;pass++) {
    let count=0;
    for(const o of parts) {
      if(o.stage===2||!o.original.supports)continue;
      if(!o.original.supports.some(id=>state.objects[id]?.stage!==2 && !!state.objects[id])) {
        destroy(o.id);count++;
      }
    }
    if(!count)break;
  }
  for(const building of map.buildings??[]) {
    const bearing=parts.filter(o=>o.original.architecture!.building===building.id && o.original.architecture!.bearing);
    if(!bearing.length)continue;
    if(bearing.filter(o=>o.stage!==2).length/bearing.length<.34)for(const o of parts)
      if(o.stage!==2 && o.original.architecture!.building===building.id)destroy(o.id);
  }
  // One rubble collider per occupied 4 m cell caps repeated-barrage debris.
  for(const change of changes.slice()) {
    if(change.stage!==2)continue;
    const o=state.objects[change.id],a=o?.original.architecture;
    if(!a || a.part==="detail" || a.part==="stair")continue;
    const b=o.original,cx=Math.round(b.x/4),cz=Math.round(b.z/4);
    const id="village-rubble-"+a.building+"-"+cx+"-"+cz;
    if(state.objects[id])continue;
    const x=cx*4+.6,z=cz*4-.6;
    if(map.sectors.some(s=>Math.hypot(s.x-x,s.z-z)<3.2))continue;
    const rubble:Box={id,x,z,w:1.25,d:1.05,h:.38+((cx*7+cz*11)&3)*.09,
      baseY:groundHeight(x,z,map),kind:"rubble",walkable:true};
    state.objects[id]={id,original:rubble,hp:180,maxHp:180,stage:0,lining:false};
    map.boxes.push({...rubble});changes.push({id,hp:180,stage:0});
  }
}
