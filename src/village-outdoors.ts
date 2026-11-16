import {baseGroundHeight,groundHeight,type Box,type MapDefinition,type Vec} from "./map";
import type {ForestFloorProp} from "./forest-floor";
import {lookNoise} from "./battlefield-look";

export type VillageYard={id:string;name:string;x:number;z:number;w:number;d:number;surface:"paving"|"gravel"|"garden"};
// The nine buildings keep their layout. Their outdoor rooms have different
// surfaces and uses, with an open path between each doorway and the street.
export const villageYards:VillageYard[]=[
  {id:"school",name:"Aid-post yard",x:-46,z:-33,w:20,d:10,surface:"gravel"},
  {id:"stable",name:"Carriage yard",x:0,z:-34,w:20,d:12,surface:"gravel"},
  {id:"inn",name:"Inn courtyard",x:46,z:-33,w:22,d:10,surface:"paving"},
  {id:"bakery",name:"Baker's working yard",x:-32,z:0,w:9,d:16,surface:"gravel"},
  {id:"manor-front",name:"Manor forecourt",x:0,z:-18,w:29,d:8,surface:"paving"},
  {id:"manor-rear",name:"Manor kitchen garden",x:0,z:18,w:28,d:8,surface:"garden"},
  {id:"smithy",name:"Forge yard",x:32,z:0,w:9,d:16,surface:"gravel"},
  {id:"farm",name:"Farm orchard",x:-46,z:33,w:22,d:10,surface:"garden"},
  {id:"cottage",name:"Vegetable garden",x:0,z:34,w:20,d:11,surface:"garden"},
  {id:"hall",name:"Post-office delivery court",x:46,z:32,w:23,d:9,surface:"paving"},
];
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const yardWeight=(yard:VillageYard,x:number,z:number)=>1-smooth(-.5,.7,Math.max(Math.abs(x-yard.x)-yard.w/2,Math.abs(z-yard.z)-yard.d/2));
const pavedYards=villageYards.filter(y=>y.surface==="paving");
export function villagePaving(map:MapDefinition,x:number,z:number) {
  if(map.id!=="village")return 0;
  let value=0;for(const yard of pavedYards)value=Math.max(value,yardWeight(yard,x,z));return value;
}
export function villageYardSurface(map:MapDefinition,x:number,z:number) {
  let paving=0,gravel=0,garden=0,path=0;
  if(map.id!=="village")return {paving,gravel,garden,path};
  for(const yard of villageYards) {
    const weight=yardWeight(yard,x,z);
    if(yard.surface==="paving")paving=Math.max(paving,weight);
    else if(yard.surface==="gravel")gravel=Math.max(gravel,weight);
    else garden=Math.max(garden,weight);
  }
  for(const lane of yardPaths(map))path=Math.max(path,1-smooth(.65,1.3,segmentDistance({x,z},lane.a,lane.b)));
  return {paving,gravel,garden:garden*(1-path),path};
}
function segmentDistance(p:Vec,a:Vec,b:Vec) {
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
}
const paths=new WeakMap<NonNullable<MapDefinition["buildings"]>,{a:Vec;b:Vec}[]>();
export function yardPaths(map:MapDefinition) {
  if(map.id!=="village"||!map.buildings)return [];
  let found=paths.get(map.buildings);if(found)return found;
  found=[];
  for(const building of map.buildings)for(const side of ["north","south","west","east"] as const) {
    const alongX=side==="north"||side==="south",length=alongX?building.w:building.d,count=Math.ceil(length/2.5);
    // Match the real omitted doorway panel, including even-panel offsets.
    const offset=-length/2+(Math.floor(count/2)+.5)*length/count;
    const a={x:building.x+(alongX?offset:(side==="west"?-1:1)*(building.w/2+.7)),
      z:building.z+(alongX?(side==="north"?-1:1)*(building.d/2+.7):offset)};
    let closest:Vec|undefined,best=Infinity;
    for(const street of map.streets??[])for(let i=1;i<street.points.length;i++) {
      const p=street.points[i-1],q=street.points[i],dx=q.x-p.x,dz=q.z-p.z;
      const t=Math.max(0,Math.min(1,((a.x-p.x)*dx+(a.z-p.z)*dz)/(dx*dx+dz*dz||1)));
      const b={x:p.x+dx*t,z:p.z+dz*t},distance=Math.hypot(a.x-b.x,a.z-b.z);
      if(distance<best){closest=b;best=distance;}
    }
    if(closest)found.push({a,b:closest});
  }
  paths.set(map.buildings,found);return found;
}
export function villageStreetClearance(map:MapDefinition,x:number,z:number) {
  let nearest=Infinity;
  for(const street of map.streets??[])for(let i=1;i<street.points.length;i++)
    nearest=Math.min(nearest,segmentDistance({x,z},street.points[i-1],street.points[i])-street.width/2);
  return nearest;
}
export function addVillageOutdoors(map:MapDefinition) {
  const add=(id:string,prop:NonNullable<Box["farmProp"]>,x:number,z:number,w:number,d:number,h:number,kind:Box["kind"]="wood")=>{
    const radius=Math.hypot(w,d)/2;
    if(villageStreetClearance(map,x,z)<radius+.35||yardPaths(map).some(l=>segmentDistance({x,z},l.a,l.b)<radius+1.35)||
      map.buildings!.some(b=>Math.abs(x-b.x)<(w+b.w)/2+1.6&&Math.abs(z-b.z)<(d+b.d)/2+1.6)||
      map.boxes.some(b=>Math.abs(x-b.x)<(w+b.w)/2+.35&&Math.abs(z-b.z)<(d+b.d)/2+.35)||
      Object.values(map.spawn).some(s=>Math.hypot(x-s.x,z-s.z)<14))return;
    map.boxes.push({id:"village-outdoor-"+id,x,z,w,d,h,kind,farmProp:prop,baseY:groundHeight(x,z,map)});
    for(const side of [-1,1])map.navigationPoints!.push({x:x+side*(w/2+1.2),z});
  };
  // Side furniture leaves the actual door axis open, rather than requiring a
  // player to vault every object in order to reach the next building.
  for(const side of [-1,1]) {
    for(const z of [-32,-20,20,32])add("approach-depot-"+side+"-"+z,z%32===0?"timber":"crate",side*84,z,2.1,1,.9);
    for(const z of [-20,20])add("flank-supply-"+side+"-"+z,"crate",side*68,z,1.8,1.2,.95);
    add("school-bench-"+side,"bench",-46+side*5.8,-32,2.2,.7,.92);
    add("school-supply-"+side,"crate",-46+side*7.5,-36,1.4,1,.85);
    add("inn-table-"+side,"worktable",46+side*5.8,-32,1.8,1,.82);
    add("inn-bench-"+side,"bench",46+side*5.8,-30,2.2,.7,.9);
    add("forecourt-planter-"+side,"planter",side*10.5,-18,2.1,.85,.76);
    add("manor-garden-bench-"+side,"bench",side*6,19.4,2.2,.7,.92);
    add("manor-garden-fence-"+side,"fence",side*13,18,.16,3.2,.75);
    add("cottage-bed-"+side,"planter",side*4.5,34,2.3,.9,.65);
    add("hall-bench-"+side,"bench",46+side*6.3,32,2.2,.7,.92);
    add("hall-planter-"+side,"planter",46+side*8.2,29.8,1.5,.85,.7);
    add("farm-basket-"+side,"crate",-46+side*3.7,36.5,1.2,.9,.78);
    // Staggered roadside cover provides stops between the manor and the
    // flanking workshops, without narrowing the 6.5 m carriage roads.
    for(const z of [-8,8])add("manor-crossing-"+side+"-"+z,"timber",side*18,z,1.8,.85,.85);
    for(const z of [-17,17])add("outer-crossing-"+side+"-"+z,"cart",side*33,z,2.4,1.3,.95);
  }
  add("stable-cart","cart",-5.5,-33,2.4,1.3,.95);
  add("stable-trough","trough",6,-33,2.1,1,.88,"masonry");
  add("stable-timber","timber",7,-38.4,2.2,.9,.85);
  add("bakery-timber","timber",-31.7,-5.5,2.2,.9,.88);
  add("bakery-bench","worktable",-31.7,5.5,1.8,1,.84);
  add("forge-timber","timber",30,-5.5,2.2,.9,.88);
  add("forge-bench","worktable",30,5.5,1.8,1,.84);
  add("delivery-cart","cart",54,35,2.4,1.3,.95);
  // Small roadside groups give the long routes intermediate stopping places.
  // Each cluster remains one destructible envelope, below standing sightlines.
  for(const side of [-1,1]) {
    for(const z of [-14.5,14.5])add("rear-cart-"+side+"-"+z,"cart",side*84,z,2.4,1.3,.92);
    for(const z of [-15,15])add("lane-barrels-"+side+"-"+z,"barrels",side*59,z,1.7,1.3,.94);
    for(const z of [-17,17])add("manor-corner-"+side+"-"+z,"barrels",side*17.8,z,1.6,1.1,.88);
    for(const z of [-17,17])add("court-supplies-"+side+"-"+z,"crate",side*37,z,1.5,1,.83);
  }
  add("stable-barrels","barrels",9.4,-33.4,1.7,1.3,.94);
  add("cottage-water-barrels","barrels",9.3,34,1.7,1.3,.94);
  // A small orchard and yard trees define edges while retaining windows into
  // the fighting. Existing tree damage/felling handles their full lifecycle.
  for(const [i,[x,z]] of ([[-55,-30],[-36,-30],[36,-30],[57,-30],[-53,30],[-39,30],[-53,36],[-39,36],[-11,18],[11,18],[36,31],[57,31]] as const).entries()) {
    if(villageStreetClearance(map,x,z)<1.5||yardPaths(map).some(l=>segmentDistance({x,z},l.a,l.b)<1.7)||
      map.boxes.some(b=>Math.abs(x-b.x)<b.w/2+1&&Math.abs(z-b.z)<b.d/2+1))continue;
    map.vegetation!.push({id:"tree-village-yard-"+i,x,z,w:.5,d:.5,h:3.6+(i%3)*.3,kind:"tree",treeStyle:"sparse",baseY:groundHeight(x,z,map)});
  }
}
export function villageGardenProps(map:MapDefinition):ForestFloorProp[] {
  if(map.id!=="village")return [];
  const props:ForestFloorProp[]=[];
  for(const yard of villageYards.filter(y=>y.surface==="garden"))for(let i=0;i<70;i++) {
    const x=yard.x+(lookNoise(i*7.1,19+yard.x)-.5)*(yard.w-1.5),z=yard.z+(lookNoise(i*5.7,37+yard.z)-.5)*(yard.d-1.5),y=groundHeight(x,z,map);
    if(villageYardSurface(map,x,z).garden<.7||villageStreetClearance(map,x,z)<.6||
      map.boxes.some(b=>Math.abs(x-b.x)<b.w/2+.6&&Math.abs(z-b.z)<b.d/2+.6)||
      y<2||y<baseGroundHeight(x,z,map)-.05||[[-.4,0],[.4,0],[0,-.4],[0,.4]].some(([dx,dz])=>Math.abs(groundHeight(x+dx,z+dz,map)-y)>.1))continue;
    const fern=i%3===0;
    props.push({x,z,y:y+.008,yaw:i*137.5,shape:fern?"fern":"grass",scale:fern?[.55,.24,.55]:[.6,.17+(i%4)*.025,.6],radius:.45,tint:fern?"#67784b":"#83845a"});
  }
  return props.slice(0,150);
}
