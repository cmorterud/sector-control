import { groundHeight, type MapDefinition, type Vec, type Box } from "./map";
import { buildTrenchBanks } from "./trench-banks";
import { buildTrenchElevation, buildTrenchRelief } from "./terrain-relief";
import { buildVerdunForest, verdunWoodland, verdunFlankX } from "./verdun-forest";

// An authored, battle-inspired sector, rather than a reconstruction of a specific fort.
const width = 208, depth = 128, bankHeight = 2.4;
const heights = new Float32Array(width * depth).fill(bankHeight);
const terrain: NonNullable<MapDefinition["terrain"]> = {
 bankHeight, cellSize:1, columns:width, rows:depth, heights,
 rectangles:[], ramps:[], lining:[], craters:[], shellScars:[], trenchLines:[], communicationRoutes:[], branchRoutes:[], shelterBays:[],
};
const boxes: Box[] = [], vegetation: Box[] = [];
function dig(x:number,z:number,w:number,d:number,h=0) {
 terrain.rectangles.push({x,z,w,d,h});

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
  // Red's northern exit continues as a low sap trench into the woods below.
  if(!(team==="red" && i===0))terrain.ramps.push({x:front-side*4.5,z:z+4,w:9,d:3,low:0,high:bankHeight,direction:-side as 1|-1});
  dig(rear+side*2,z+8,6,5); terrain.shelterBays!.push({x:rear+side*2,z:z+8,team});
 }
 // A protected southern route with turns and two exits into the objective area.
 route(team === "blue"
  ? [{x:-45,z:38},{x:-35,z:38},{x:-35,z:43},{x:-27,z:43},{x:-27,z:32},{x:-17,z:32}]
  : [{x:45,z:38},{x:36,z:38},{x:36,z:34},{x:28,z:34},{x:28,z:32},{x:17,z:32}],team);
 terrain.ramps.push({x:side*12.5,z:32,w:9,d:3,low:0,high:bankHeight,direction:-side as 1|-1});
}
// Forward sap trenches turn around woodland islands; separated exits avoid
// turning the woods into a single long shooting corridor.
route([{x:-43,z:-42},{x:-35,z:-42},{x:-35,z:-49},{x:-26,z:-49},{x:-26,z:-43}],"blue");
terrain.ramps.push({x:-21.5,z:-43,w:9,d:3,low:0,high:bankHeight,direction:1});
route([{x:43,z:-32},{x:33,z:-32},{x:33,z:-25},{x:29,z:-25},{x:29,z:-19}],"red");
terrain.ramps.push({x:24.5,z:-19,w:9,d:3,low:0,high:bankHeight,direction:-1});
route([{x:45,z:40},{x:35,z:40},{x:35,z:47},{x:27,z:47},{x:27,z:41}],"red");
terrain.ramps.push({x:22.5,z:41,w:9,d:3,low:0,high:bankHeight,direction:-1});
// Shift the old home halves as intact trench systems, then excavate the new
// central relay position. Bake the shared height field after all authoring.
for (const r of [...terrain.rectangles, ...terrain.ramps, ...terrain.shelterBays!]) r.x = verdunFlankX(r.x);
for (const line of terrain.trenchLines!) for (const section of line.sections) section.x = verdunFlankX(section.x);
for (const r of terrain.communicationRoutes!) {
  const points = r.points.map(p => ({...p,x:verdunFlankX(p.x)}));
  r.points = points; r.entrance = points[0];
}
dig(0,0,14,12,1.5);
for (const side of [-1,1] as const) for (const end of [-1,1]) {
  const z = end < 0 && side > 0 ? -10 : end * 9;
  const points = [{x:side*6,z:end*3},{x:side*10,z:end*3},{x:side*10,z},{x:side*15,z}];
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i];
    dig((a.x+b.x)/2,(a.z+b.z)/2,Math.abs(a.x-b.x)+2,Math.abs(a.z-b.z)+2,1.5);
  }
  terrain.branchRoutes!.push({team:side<0?"blue":"red",entrance:points[0],points});
  terrain.ramps.push({x:side*18,z,w:6,d:3,low:1.5,high:bankHeight,direction:side});
}
for(const r of terrain.rectangles) for(let row=0;row<depth;row++) for(let col=0;col<width;col++)
  if(Math.abs(col+.5-width/2-r.x)<r.w/2 && Math.abs(row+.5-depth/2-r.z)<r.d/2)
    heights[row*width+col]=r.h;

export const verdunMap:MapDefinition={
 id:"verdun", name:"Verdun sector",width,depth,navSpacing:4,scoring:"domination",
 navigationPoints:[],
 spawn:{blue:{x:-93,z:0},red:{x:93,z:0}}, boxes,vegetation,terrain,woodland:verdunWoodland,
 sectors:[
  {id:"A",name:"Supply Ruin",x:-45,z:25,home:"blue"},
  {id:"B",name:"Shattered Wood",x:-42,z:-31,home:"blue"},
  {id:"C",name:"Broken Relay",x:0,z:0},
  {id:"D",name:"Gun Pit",x:44,z:-17,home:"red"},
  {id:"E",name:"Fortification",x:49,z:29,home:"red"},
 ],
 landmarks:[
  {id:"A",name:"Supply Ruin",kind:"farmhouse",x:-45,z:25,radius:8},
  {id:"B",name:"Shattered Wood",kind:"woodland",x:-42,z:-31,radius:10},
  {id:"C",name:"Broken Relay",kind:"relay",x:0,z:0,radius:12},
  {id:"D",name:"Gun Pit",kind:"gunpit",x:44,z:-17,radius:8},
  {id:"E",name:"Fortification",kind:"bunker",x:49,z:29,radius:9},
 ],
};
const add=(id:string,x:number,z:number,w:number,d:number,h:number,kind:Box["kind"]="masonry")=>{
 const b:Box={id,x,z,w,d,h,kind};boxes.push(b);return b;
};
// Open tops and broken ends permit entry from several directions.
for(const flag of verdunMap.sectors.filter(s=>s.id!=="C")) {
 const heavy=flag.id==="E";
 add(`${flag.id}-west`,flag.x-5,flag.z-1,.65,5,heavy?2:1.2,heavy?"concrete":"masonry");
 add(`${flag.id}-north`,flag.x-1.5,flag.z-5,7,.65,heavy?1.5:1);
 add(`${flag.id}-east`,flag.x+5,flag.z+2,.65,5,1.1,"sandbag");
 for(const [i,dx,dz] of [[0,-4,4],[1,3,-3],[2,5,5]]) {
  // Keep the gun-pit sap's new walk-out clear of the old rubble pile.
  const shifted=flag.id==="D" && i===1;
  add(`${flag.id}-rubble-${i}`,flag.x+(shifted?10:dx),flag.z+(shifted?5:dz),1.7,1.1,.55,"rubble");
 }
}
// A ruined signal post, not an intact elevated strongpoint. The central three
// meters stay clear; low equipment/roof pieces sit around the capture space.
const relay = (id:string,x:number,z:number,w:number,d:number,h:number,kind:Box["kind"]="wood") => {
  const b=add(`relay-${id}`,x,z,w,d,h,kind); b.landmark="C"; return b;
};
relay("mast",-4.7,-4.4,.42,.42,4.3).farmProp="relayMast";
relay("fallen-crossbar",5.6,6.8,4.5,.35,.28);
relay("roof-west",-1.9,-4.3,.35,1.5,.45);
relay("roof-east",1.9,-4.3,.35,1.5,.45);
const roof=relay("collapsed-roof",0,-4.3,4.4,1.6,.3); roof.baseY=.45;
roof.supports=["relay-roof-west","relay-roof-east"];
relay("radio",3.8,-4.1,1.1,.65,.65).farmProp="radio";
relay("ammo",-4.5,1.4,.9,.7,.55).farmProp="crate";
relay("crate",4.5,1.1,.8,.6,.45).farmProp="crate";
relay("bags-west",-5,0,.6,2,.75,"sandbag");
relay("bags-east",5,0,.6,2,.75,"sandbag");
relay("bags-south-west",-2.5,4.7,3,.65,.7,"sandbag");
relay("bags-south-east",3.3,4.8,2.1,.65,.65,"sandbag");
for (const side of [-1,1]) for (const z of [-14,14])
  add(`relay-approach-${side}-${z}`,side*29,z,2.7,.6,.7,"log");
// Low broken cover anchors the exposed central route between the tree belts.
for(let i=0;i<12;i++) {
 const x=verdunFlankX(-33+(i%6)*12),z=-5+Math.floor(i/6)*14+(i%2)*3;
 if(Math.hypot(x-44,z+17)<7)continue;
 add(`verdun-central-${i}`,x,z,2.3,.8,.75,i%3?"sandbag":"log");
}
for(let i=0;i<17;i++) terrain.shellScars!.push({x:verdunFlankX(-31+(i%6)*12+(i%2)*2),z:-23+Math.floor(i/6)*19,radiusX:2.6+(i%3)*.5,radiusZ:2.3+(i%4)*.3,depth:.65+(i%3)*.18,rotation:i*.7,irregularity:.13,phase:i*1.4});
for (const [x,z] of [[-24,-3],[24,3],[-23,21],[24,-23],[0,-21],[3,22]])
 terrain.shellScars!.push({x,z,radiusX:3.2,radiusZ:2.8,depth:.7,rotation:x*.1,irregularity:.15,phase:z});
terrain.banks=buildTrenchBanks(verdunMap);
terrain.elevation=buildTrenchElevation(verdunMap);
terrain.relief=buildTrenchRelief(verdunMap,terrain.shellScars!);
for(const b of [...boxes,...vegetation]) b.baseY=groundHeight(b.x,b.z,verdunMap)-.03+(b.baseY??0);
const forest = buildVerdunForest(verdunMap);
vegetation.push(...forest.filter(b=>b.kind==="tree" || b.kind==="brush"));
boxes.push(...forest.filter(b=>b.kind!=="tree" && b.kind!=="brush"));
for(const line of terrain.trenchLines!) for(const s of line.sections) for(const side of [-1,1])
 for(let z=s.z-s.length/2+1;z<s.z+s.length/2;z+=2) {
  const x=s.x+side*1.15;
  if(groundHeight(x+side*.25,z,verdunMap)>.3 && groundHeight(x-side*.35,z,verdunMap)<.1) terrain.lining.push({x,z,w:.12,d:1.8});
 }

// Fine local waypoints connect narrow ruin entrances to the coarse field graph.
for(const flag of verdunMap.sectors) for(let x=-8;x<=8;x+=2) for(let z=-8;z<=8;z+=2) verdunMap.navigationPoints!.push({x:flag.x+x,z:flag.z+z});

for(const r of terrain.branchRoutes!) for(const point of r.points) verdunMap.navigationPoints!.push({...point});
for(const r of terrain.ramps.filter(r=>r.low===1.5))
 for(const x of [r.x-r.w/2,r.x,r.x+r.w/2]) verdunMap.navigationPoints!.push({x,z:r.z});
