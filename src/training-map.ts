import {type Box, type MapDefinition} from "./map";
import {buildVillageBuilding} from "./village-buildings";

export const trainingStations = [
  {id:"movement", name:"Movement & cover", x:-48, z:72, target:{x:-48,z:55}},
  {id:"weapons", name:"Weapon range", x:0, z:72, target:{x:0,z:47}},
  {id:"grenades", name:"Grenades & smoke", x:48, z:72, target:{x:48,z:51}},
  {id:"bayonet", name:"Bayonet lane", x:48, z:22, target:{x:48,z:7}},
  {id:"artillery", name:"Fire support", x:0, z:22, target:{x:0,z:-8}},
  {id:"destruction", name:"Demolition yard", x:-48, z:22, target:{x:-48,z:-8}},
  {id:"squad", name:"Squad exercise", x:-40, z:-40, target:{x:-40,z:-65}},
  {id:"finale", name:"Capture exercise", x:40, z:-40, target:{x:40,z:-65}},
] as const;
export type TrainingStationId = typeof trainingStations[number]["id"];
const boxes:Box[]=[],width=180,depth=210;
const add=(id:string,x:number,z:number,w:number,d:number,h:number,kind:Box["kind"]="wood",baseY=0)=>{
  const box:Box={id:"training-"+id,x,z,w,d,h,kind,baseY}; boxes.push(box);return box;
};
export const trainingMap:MapDefinition={
  id:"training",name:"Training grounds",width,depth,navSpacing:4,navigationPoints:[],
  scoring:"domination",spawn:{blue:{x:-48,z:72},red:{x:40,z:-65}},
  sectors:[{id:"C",name:"Exercise objective",x:40,z:-65}],boxes,vegetation:[],buildings:[],
  streets:[{width:5,points:[{x:-75,z:82},{x:75,z:82}]},{width:5,points:[{x:-75,z:32},{x:75,z:32}]},
    {width:5,points:[{x:-75,z:-30},{x:75,z:-30}]},...[-75,24,75].map(x=>({width:4,points:[{x,z:85},{x,z:-88}]}))],
  terrain:{bankHeight:0,cellSize:1,columns:width,rows:depth,heights:new Float32Array(width*depth),rectangles:[],ramps:[],lining:[],craters:[]},
};
for(const [i,s] of trainingStations.entries()){
  const sign=add("board-"+s.id,s.x-7,s.z-1,5,.22,1.7,"wood",.8);
  sign.architecture={building:"range-board",part:"wall",level:0,tint:"#6d755c",sign:`${i+1}. ${s.name.toUpperCase()}`};
  add("post-"+s.id,s.x-7,s.z-1,.16,.3,2.5);
  const table=add("supply-"+s.id,s.x+6,s.z,2.2,1,.85);table.farmProp="worktable";
  if(i<4)for(const side of [-1,1])for(let n=0;n<5;n++)add(`lane-${i}-${side}-${n}`,s.x+side*15,s.z-5-n*6,.35,5.4,.9);
}
// A real, low masonry mantle obstacle, a higher cover wall and a hop lane.
add("mantle-wall",-48,56,8,.5,.9,"masonry");
add("cover-wall",-40,57,.5,8,1.8,"masonry");
for(const z of [62,58])add("hop-rail-"+z,-56,z,3,.25,.35);
const hopSign=add("hop-sign",-59,65,2,.15,1.2);
hopSign.architecture={building:"range-board",part:"wall",level:0,tint:"#6d755c",sign:"HOP LANE"};
for(const [i,z] of [57,47,32].entries()){
  const sign=add("range-distance-"+i,-7,z,2,.18,1.2);
  sign.architecture={building:"range-board",part:"wall",level:0,tint:"#6d755c",sign:`${[15,25,40][i]} M`};
}
for(const [i,x,z] of [[0,0,25],[1,48,37],[2,48,-2]])add("backstop-"+i,x,z,27,.8,4,"masonry");
for(const s of trainingStations.slice(2,6))for(const side of [-1,1])add("safe-cover-"+s.id+side,s.x+side*5,s.z-5,3,.9,1.1,"sandbag");
for(const [id,x,z,w,d,stories] of [["shell-house",0,-8,14,12,1],["demolition-house",-48,-8,28,22,2]] as const){
  const b={id,name:id==="shell-house"?"Fire support target":"Demolition house",x,z,w,d,stories,baseY:0,posts:[]};
  trainingMap.buildings!.push(b);buildVillageBuilding(trainingMap,b,id==="shell-house"?1:2);
}
trainingMap.vegetation!.push({id:"training-demo-tree",x:-29,z:-2,w:.9,d:.9,h:7,kind:"tree",treeStyle:"pine",baseY:0});
for(const s of trainingStations.slice(6))for(const [i,dx,dz] of [[0,-7,-5],[1,6,-10],[2,-5,-17],[3,6,-25],[4,0,-32]])
  add(`${s.id}-cover-${i}`,s.x+dx,s.z+dz,4,1,1.05,i%2?"masonry":"sandbag");
for(let z=-90;z<=90;z+=12)for(const x of [-84,84])trainingMap.vegetation!.push({id:`training-edge-${x}-${z}`,x,z,w:.6,d:.6,h:5,kind:"tree",treeStyle:"pine",baseY:0});
