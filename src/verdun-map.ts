import { groundHeight, type MapDefinition, type Vec, type Box } from "./map";
import { buildTrenchBanks } from "./trench-banks";
import { buildTrenchElevation, buildTrenchRelief } from "./terrain-relief";

// An authored, battle-inspired sector, rather than a reconstruction of a specific fort.
const width = 160, depth = 128, bankHeight = 2.4;
const heights = new Float32Array(width * depth).fill(bankHeight);
const terrain: NonNullable<MapDefinition["terrain"]> = {
 bankHeight, cellSize:1, columns:width, rows:depth, heights,
 rectangles:[], ramps:[], lining:[], craters:[], shellScars:[], trenchLines:[], communicationRoutes:[], branchRoutes:[], shelterBays:[],
};
const boxes: Box[] = [], vegetation: Box[] = [];
function dig(x:number,z:number,w:number,d:number,h=0) {
 terrain.rectangles.push({x,z,w,d,h});
 for(let row=0;row<depth;row++) for(let col=0;col<width;col++)
  if(Math.abs(col+.5-width/2-x)<w/2 && Math.abs(row+.5-depth/2-z)<d/2) heights[row*width+col]=h;
}
function route(points:Vec[], team:"blue"|"red") {
 for(let i=1;i<points.length;i++) {
  const a=points[i-1],b=points[i]; dig((a.x+b.x)/2,(a.z+b.z)/2,Math.abs(a.x-b.x)+2,Math.abs(a.z-b.z)+2);
 }
 terrain.communicationRoutes!.push({team,entrance:points[0],points});
}
for(const team of ["blue","red"] as const) {
 const side=team==="blue"?-1:1;
 for(const role of ["rear","front"] as const) {
  const x=side*(role==="rear"?55:43);
  const sections=[{x,z:-38,length:26},{x:x-side*4,z:-8,length:34},{x:x+side*2,z:29,length:40}];
  terrain.trenchLines!.push({team,role,sections});
  sections.forEach((s,i)=>{dig(s.x,s.z,2,s.length);if(i){const prev=sections[i-1],z=s.z-s.length/2;dig((prev.x+s.x)/2,z,Math.abs(prev.x-s.x)+2,2);}});
 }
 for(const [i,z] of [-36,0,34].entries()) {
  const rear=side*(i===1?51:i===2?57:55),front=side*(i===1?39:i===2?45:43);
  route([{x:rear,z},{x:side*48,z},{x:side*48,z:z+4},{x:front,z:z+4}],team);
  terrain.ramps.push({x:rear+side*4.5,z,w:9,d:3,low:0,high:bankHeight,direction:side as 1|-1});
  terrain.ramps.push({x:front-side*4.5,z:z+4,w:9,d:3,low:0,high:bankHeight,direction:-side as 1|-1});
  dig(rear+side*2,z+8,6,5); terrain.shelterBays!.push({x:rear+side*2,z:z+8,team});
 }
 // A protected southern route with turns and two exits into the objective area.
 route([{x:side*45,z:38},{x:side*31,z:38},{x:side*31,z:32},{x:side*17,z:32}],team);
 terrain.ramps.push({x:side*12.5,z:32,w:9,d:3,low:0,high:bankHeight,direction:-side as 1|-1});
}
export const verdunMap:MapDefinition={
 id:"verdun", name:"Verdun sector",width,depth,navSpacing:4,scoring:"domination",
 navigationPoints:[],
 spawn:{blue:{x:-69,z:0},red:{x:69,z:0}}, boxes,vegetation,terrain,
 sectors:[
  {id:"A",name:"Supply Ruin",x:-21,z:25,home:"blue"},
  {id:"B",name:"Shattered Wood",x:-18,z:-31,home:"blue"},
  {id:"C",name:"Gun Pit",x:20,z:-17,home:"red"},
  {id:"D",name:"Fortification",x:25,z:29,home:"red"},
 ],
 landmarks:[
  {id:"A",name:"Supply Ruin",kind:"farmhouse",x:-21,z:25,radius:8},
  {id:"B",name:"Shattered Wood",kind:"woodland",x:-18,z:-31,radius:10},
  {id:"C",name:"Gun Pit",kind:"gunpit",x:20,z:-17,radius:8},
  {id:"D",name:"Fortification",kind:"bunker",x:25,z:29,radius:9},
 ],
};
const add=(id:string,x:number,z:number,w:number,d:number,h:number,kind:Box["kind"]="masonry")=>{
 const b:Box={id,x,z,w,d,h,kind};boxes.push(b);return b;
};
// Open tops and broken ends permit entry from several directions.
for(const flag of verdunMap.sectors) {
 const heavy=flag.id==="D";
 add(`${flag.id}-west`,flag.x-5,flag.z-1,.65,5,heavy?2:1.2,heavy?"concrete":"masonry");
 add(`${flag.id}-north`,flag.x-1.5,flag.z-5,7,.65,heavy?1.5:1);
 add(`${flag.id}-east`,flag.x+5,flag.z+2,.65,5,1.1,"sandbag");
 for(const [i,dx,dz] of [[0,-4,4],[1,3,-3],[2,5,5]]) add(`${flag.id}-rubble-${i}`,flag.x+dx,flag.z+dz,1.7,1.1,.55,"rubble");
}
// Wooded northern flank with gaps, plus low broken cover on the central route.
for(let i=0;i<24;i++) {
 const x=-34+(i%8)*9, z=-49+Math.floor(i/8)*8+(i%3);
 vegetation.push({id:`verdun-tree-${i}`,x,z,w:.65,d:.65,h:3.5+(i%5)*.55,kind:"tree",treeStyle:i%4?"bare":"snapped"});
}
for(let i=0;i<12;i++) {
 const x=-33+(i%6)*12,z=-5+Math.floor(i/6)*14+(i%2)*3;
 if(Math.hypot(x-20,z+17)<7)continue;
 add(`verdun-central-${i}`,x,z,2.3,.8,.75,i%3?"sandbag":"log");
}
for(let i=0;i<17;i++) terrain.shellScars!.push({x:-31+(i%6)*12+(i%2)*2,z:-23+Math.floor(i/6)*19,radiusX:2.6+(i%3)*.5,radiusZ:2.3+(i%4)*.3,depth:.65+(i%3)*.18,rotation:i*.7,irregularity:.13,phase:i*1.4});
terrain.banks=buildTrenchBanks(verdunMap);
terrain.elevation=buildTrenchElevation(verdunMap);
terrain.relief=buildTrenchRelief(verdunMap,terrain.shellScars!);
for(const b of [...boxes,...vegetation]) b.baseY=groundHeight(b.x,b.z,verdunMap)-.03;
for(const line of terrain.trenchLines!) for(const s of line.sections) for(const side of [-1,1])
 for(let z=s.z-s.length/2+1;z<s.z+s.length/2;z+=2) {
  const x=s.x+side*1.15;
  if(groundHeight(x+side*.25,z,verdunMap)>.3 && groundHeight(x-side*.35,z,verdunMap)<.1) terrain.lining.push({x,z,w:.12,d:1.8});
 }

// Fine local waypoints connect narrow ruin entrances to the coarse field graph.
for(const flag of verdunMap.sectors) for(let x=-8;x<=8;x+=2) for(let z=-8;z<=8;z+=2) verdunMap.navigationPoints!.push({x:flag.x+x,z:flag.z+z});
