import { groundHeight, type Box, type MapDefinition, type TerrainRect, type TrenchLine, type CommunicationRoute } from "./map";
import { buildTrenchBanks } from "./trench-banks";
import { buildTrenchElevation, buildTrenchRelief } from "./terrain-relief";
import { buildVillageBuilding, type VillageBuilding } from "./village-buildings";
import { addVillageOutdoors } from "./village-outdoors";
import { buildKitHouse, type KitPlacement, type KitPlan } from "./house-kit";
import { bakery, barn, cottage, manor } from "./house-kit-plans";

const width=180,depth=160,bankHeight=2.4;
const heights=new Float32Array(width*depth).fill(bankHeight);
const rectangles:TerrainRect[]=[],trenchLines:TrenchLine[]=[],communicationRoutes:CommunicationRoute[]=[];
const boxes:Box[]=[],vegetation:Box[]=[];
const ramps:NonNullable<MapDefinition["terrain"]>["ramps"]=[];
const dig=(x:number,z:number,w:number,d:number)=>{
  rectangles.push({x,z,w,d,h:0});
  for(let row=0;row<depth;row++)for(let col=0;col<width;col++)
    if(Math.abs(col+.5-width/2-x)<w/2 && Math.abs(row+.5-depth/2-z)<d/2)heights[row*width+col]=0;
};
for(const team of ["blue","red"] as const) {
  const side=team==="blue"?-1:1;
  for(const role of ["rear","front"] as const) {
    const x=side*(role==="rear"?75:69);
    const sections=[-48,0,48].map((z,i)=>({x:x+(i===1?side:0),z,length:24}));
    trenchLines.push({team,role,sections});
    for(const s of sections)dig(s.x,s.z,2,24);
  }
  for(let i=0;i<3;i++) {
    const z=[-48,0,48][i],a=side*(i===1?76:75),b=side*(i===1?70:69);
    const points=[{x:a,z},{x:(a+b)/2,z},{x:(a+b)/2,z:z+3},{x:b,z:z+3}];
    for(let n=1;n<points.length;n++)dig((points[n-1].x+points[n].x)/2,(points[n-1].z+points[n].z)/2,
      Math.abs(points[n].x-points[n-1].x)+2,Math.abs(points[n].z-points[n-1].z)+2);
    communicationRoutes.push({team,entrance:{x:a,z},points});
    ramps.push({x:a+side*4,z,w:8,d:3,low:0,high:bankHeight,direction:side});
    ramps.push({x:b-side*4,z:z+3,w:8,d:3,low:0,high:bankHeight,direction:-side as 1|-1});
  }
}
const building=(id:string,name:string,x:number,z:number,w:number,d:number,flag?:string,stories=1):VillageBuilding=>
  ({id,name,x,z,w,d,flag,stories,baseY:bankHeight,posts:[]});
const buildings=[
  building("school","Schoolhouse / aid post",-46,-48,20,18,"A"),
  building("stable","Carriage stable",0,-48,15,10),
  building("inn","Village inn",46,-48,22,18,"D"),
  building("bakery","Bakery and workshop",-46,0,10,10),
  // Built from the house kit (docs/HOUSE_KIT.md), rather than the old generator.
  building("manor","Saint-Martin Manor",0,0,15,12.5,"C",2),
  building("smithy","Smithy and storehouse",46,0,10,15),
  building("farm","Orchard farmhouse",-46,48,20,18,"B"),
  building("cottage","Groundskeeper's cottage",0,48,10,10),
  building("hall","Town hall / post office",46,48,22,20,"E"),
];
const streets=[
  ...[-23,23].map(x=>({width:6.5,points:[{x,z:-69},{x,z:69}]})),
  ...[-24,24].map(z=>({width:6,points:[{x:-64,z},{x:64,z}]})),
  ...[-64,64].map(x=>({width:3,points:[{x,z:-68},{x,z:68}]})),
  ...[-67,67].map(z=>({width:3,points:[{x:-64,z},{x:64,z}]})),
];
export const villageMap:MapDefinition={
  id:"village",name:"Village front",width,depth,navSpacing:4,navigationPoints:[],buildings,streets,
  scoring:"domination",spawn:{blue:{x:-81,z:0},red:{x:81,z:0}},
  sectors:buildings.filter(b=>b.flag).sort((a,b)=>a.flag!.localeCompare(b.flag!)).map(b=>({
    // The kit manor's flag stands in the middle of its entrance hall.
    id:b.flag!,name:b.name,x:b.x,z:b.z-(b.id==="manor"?3.75:2),...(b.x===0?{}:{home:b.x<0?"blue" as const:"red" as const})})),
  landmarks:buildings.map(b=>({id:b.flag??b.id,name:b.name,kind:"farmhouse" as const,x:b.x,z:b.z,radius:Math.max(b.w,b.d)/2})),
  boxes,vegetation,
  terrain:{columns:width,rows:depth,cellSize:1,heights,bankHeight,rectangles,ramps,trenchLines,communicationRoutes,
    lining:[],craters:[],shellScars:[
      {x:-29,z:-18,radiusX:2.1,radiusZ:2.8,depth:.35,rotation:.4,irregularity:.18,phase:2},
      {x:30,z:28,radiusX:2.6,radiusZ:2,depth:.4,rotation:1.2,irregularity:.15,phase:5},
      {x:-59,z:28,radiusX:2,radiusZ:2.7,depth:.3},
    ]},
};
// Whole foundations protect terrain authoring without scanning every panel.
villageMap.terrain!.banks=buildTrenchBanks(villageMap);
villageMap.terrain!.elevation=buildTrenchElevation({...villageMap,boxes:buildings.map(b=>({x:b.x,z:b.z,w:b.w+2,d:b.d+2,h:1,kind:"building"}))});
villageMap.terrain!.relief=buildTrenchRelief(villageMap,villageMap.terrain!.shellScars!);
// Kit buildings (docs/HOUSE_KIT.md), each turned so its front faces its street.
const kitBuildings:Record<string,{plan:KitPlan}&Pick<KitPlacement,"turns"|"style"|"entrance">>={
  manor:{plan:manor,entrance:{at:"C1",side:"north",sign:"ST MARTIN",porch:true}},
  stable:{plan:barn,turns:2,style:"stable",entrance:{at:"A2",side:"west",sign:"ECURIE"}},
  bakery:{plan:bakery,turns:1,entrance:{at:"B1",side:"north",sign:"BOULANGERIE"}},
  smithy:{plan:barn,turns:3,style:"smithy",entrance:{at:"A2",side:"west",sign:"FORGE"}},
  cottage:{plan:cottage,entrance:{at:"B1",side:"north",sign:"MAISON"}},
};
buildings.forEach((b,i)=>{
  const kit=kitBuildings[b.id];
  if(!kit)buildVillageBuilding(villageMap,b,i);
  else buildKitHouse(villageMap,kit.plan,{id:b.id,name:b.name,x:b.x,z:b.z,baseY:bankHeight,flag:b.flag,variant:i,
    turns:kit.turns,style:kit.style,entrance:kit.entrance});
});
const add=(id:string,x:number,z:number,w:number,d:number,h:number,kind:Box["kind"]="masonry")=>{
  const b:Box={id:"village-"+id,x,z,w,d,h,kind,baseY:groundHeight(x,z,villageMap)};boxes.push(b);return b;
};
for(const [index,b] of buildings.entries()) {
  if(b.id==="manor")continue;
  const width=b.w/2+4,depth=b.d/2+5;
  for(const side of [-1,1])for(let dz=-depth;dz<depth;dz+=3) {
    if(Math.abs(dz)<3 || (side===-1 && dz>6 && index%2))continue;
    add("garden-"+b.id+"-"+side+"-"+dz,b.x+side*width,b.z+dz,.45,2.85,.85+(index%3)*.12);
  }
  for(const side of [-1,1])for(let dx=-width;dx<width;dx+=3) {
    if(Math.abs(dx)<3)continue;
    add("boundary-"+b.id+"-"+side+"-"+dx,b.x+dx,b.z+side*depth,2.85,.45,1.05);
  }
}
for(const side of [-1,1])for(const z of [-34,-10,10,34]) {
  add("crossing-cover-"+side+"-"+z,side*28,z,2.4,.8,.9,"sandbag");
  villageMap.navigationPoints!.push({x:side*24,z});
}
for(const [i,x,z] of [[0,-32,-64],[1,31,61],[2,-30,34],[3,30,-32]]) {
  const cart=add("cart-"+i,x,z,2.4,1.3,.95,"wood");cart.farmProp="cart";
}
for(let row=0;row<2;row++)for(let col=0;col<7;col++) {
  const x=-60+col*20,z=(row?-1:1)*(70+(col%2)*2);
  vegetation.push({id:"tree-village-orchard-"+row+"-"+col,x,z,w:.65,d:.65,h:4+(col%3)*.4,kind:"tree",treeStyle:"sparse",baseY:groundHeight(x,z,villageMap)});
}
addVillageOutdoors(villageMap);
for(const line of trenchLines)for(const s of line.sections)for(const side of [-1,1])
  for(let z=s.z-s.length/2+1;z<s.z+s.length/2;z+=2) {
    const x=s.x+side*1.15;
    if(groundHeight(x+side*.25,z,villageMap)>.3 && groundHeight(x-side*.35,z,villageMap)<.1)
      villageMap.terrain!.lining.push({x,z,w:.12,d:1.8});
  }
