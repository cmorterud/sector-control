import { type Box, type MapDefinition } from "./map";

export const villageStoryHeight = 3.4;
export type VillageBuilding = NonNullable<MapDefinition["buildings"]>[number];

// All visible structural panels are also the authoritative blast/ray solids.
// Window and doorway openings are omitted panels, never painted-on textures.
export function buildVillageBuilding(map: MapDefinition, building: VillageBuilding, variant = 0) {
  const parts: Box[] = [];
  const base = building.baseY, rise = villageStoryHeight;
  const add = (name: string, x: number, z: number, w: number, d: number, h: number, y: number,
    part: NonNullable<Box["architecture"]>["part"], level: number, kind: Box["kind"] = "masonry") => {
    const b: Box = { id: "village-" + building.id + "-" + name, x: building.x+x, z: building.z+z,
      w, d, h, baseY: base+y, kind, landmark: building.flag,
      architecture: { building: building.id, part, level, tint: ["#a5947d", "#b8a68c", "#9b8272", "#a29b87"][variant%4] } };
    parts.push(b);
    return b;
  };
  const walls = (level: number) => {
    const runs = [
      { side: "north", x: 0, z: -building.d/2, length: building.w, alongX: true },
      { side: "south", x: 0, z: building.d/2, length: building.w, alongX: true },
      { side: "west", x: -building.w/2, z: 0, length: building.d, alongX: false },
      { side: "east", x: building.w/2, z: 0, length: building.d, alongX: false },
      // Internal stone partitions prevent firing through the entire ground floor.
      ...(building.stories > 1 ? [
        ...[-4.8,4.8].map((x,i) => ({side:"hall"+i,x,z:0,length:building.d-1,alongX:false})),
        ...[-10,10].flatMap((x,i)=>[-10,8].map((z,j)=>({side:"room"+i+j,x,z,length:9,alongX:true}))),
      ] :
        [{side:"partition",x:0,z:2.5,length:building.w-1,alongX:true}]),
    ];
    for (const run of runs) {
      const count = Math.ceil(run.length/2.5), width=run.length/count;
      const rows: Box[][] = [[],[],[]];
      for (let col=0;col<count;col++) {
        const offset=-run.length/2+(col+.5)*width;
        const internal=run.side.startsWith("hall")||run.side.startsWith("room")||run.side==="partition";
        const door=(level===0 || internal) && (col===Math.floor(count/2) || (run.side.startsWith("hall") && col===2));
        if(door)for(const n of [-1.3,0,1.3])map.navigationPoints!.push({
          x:building.x+run.x+(run.alongX?offset:n),
          z:building.z+run.z+(run.alongX?n:offset),y:base+level*rise});
        const window=!internal && col%2===(variant%2) && col>0 && col<count-1;
        for (let row=0;row<3;row++) {
          if ((door && row<2) || (window && row===1)) continue;
          const b=add(run.side+"-"+level+"-"+col+"-"+row,
            run.x+(run.alongX?offset:0),run.z+(run.alongX?0:offset),
            run.alongX?width:.44,run.alongX?.44:width,
            row===0?1:row===1?1.25:1.15,level*rise+(row===0?0:row===1?1:2.25),"wall",level);
          b.architecture!.bearing=level===0 && row===0;
          rows[row][col]=b;
        }
      }
      for (let row=1;row<3;row++) for (let col=0;col<count;col++) {
        const b=rows[row][col]; if(!b)continue;
        b.supports=[col,col-1,col+1,col-2,col+2].map(c=>rows[row-1][c]?.id).filter((id):id is string=>!!id);
      }
      if(level>0)for(const b of rows[0].filter(Boolean)) {
        b.supports=parts.filter(p=>p.architecture?.part==="floor" && Math.hypot(p.x-b.x,p.z-b.z)<4.2).map(p=>p.id!);
      }
    }
  };
  walls(0);
  const supportFor=(x:number,z:number,level:number,reach=9)=>parts.filter(p=>p.architecture?.part==="wall" && p.architecture.level===level &&
    (p.baseY??0)+p.h>=base+(level+1)*rise-.02 && Math.hypot(p.x-x,p.z-z)<reach)
    .sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z)).slice(0,6).map(p=>p.id!);
  if(building.stories>1) {
    const nx=Math.ceil(building.w/2.4), nz=Math.ceil(building.d/2.4), w=building.w/nx,d=building.d/nz;
    for(let ix=0;ix<nx;ix++)for(let iz=0;iz<nz;iz++) {
      const x=-building.w/2+(ix+.5)*w,z=-building.d/2+(iz+.5)*d;
      // Two long stairwells remain open through the first-floor slab.
      if(Math.abs(Math.abs(x)-10.5)<2 && z>-8 && z<3.4)continue;
      const floor=add("floor-"+ix+"-"+iz,x,z,w,d,.22,rise-.22,"floor",1,"wood");
      floor.walkable=true;floor.supports=supportFor(floor.x,floor.z,0);
      if(Math.abs(x)<7 && Math.abs(z)<8)building.posts.push({x:floor.x,z:floor.z,y:base+rise});
    }
    for(const side of [-1,1]) {
      const steps=20,step=rise/steps,start=-8.2,run=.62;
      for(let i=0;i<steps;i++) {
        const stair=add("stair-"+side+"-"+i,side*10.5,start+(i+.5)*run,3.1,run,step*(i+1),0,"stair",0,"wood");
        stair.walkable=true;
        // Treads stand on the ground; excavation can undermine them individually.
        map.navigationPoints!.push({x:stair.x,z:stair.z,y:base+step*(i+1)});
      }
      for(const dz of [-.8,steps*run+.8])map.navigationPoints!.push({x:building.x+side*10.5,z:building.z+start+dz,y:base+(dz<0?0:rise)});
    }
    walls(1);
  }
  if(building.stories>1)for(const side of [-1,1])for(const col of [2,4,6,8]) {
    const count=Math.ceil(building.d/2.5),z=-building.d/2+(col+.5)*building.d/count;
    building.posts.push({x:building.x+side*(building.w/2-1.2),z:building.z+z,y:base+rise});
  }
  const roofLevel=building.stories-1;
  // Closed gable ends sit beneath the pitched roof, rather than exposing a
  // large triangular opening above every otherwise intact house.
  for(const side of [-1,1]) {
    const count=Math.ceil(building.w/1.25),w=building.w/count;
    for(let i=0;i<count;i++) {
      const x=-building.w/2+(i+.5)*w,h=Math.tan(.3)*(building.w/2-Math.abs(x))+.2;
      const gable=add("gable-"+side+"-"+i,x,side*building.d/2,w,.4,h,building.stories*rise,"wall",building.stories);
      gable.supports=supportFor(gable.x,gable.z,roofLevel,5);
    }
  }
  const nx=Math.ceil(building.w/3.2),nz=Math.ceil(building.d/3.2),w=building.w/nx,d=building.d/nz;
  for(let ix=0;ix<nx;ix++)for(let iz=0;iz<nz;iz++) {
    const x=-building.w/2+(ix+.5)*w,z=-building.d/2+(iz+.5)*d;
    const pitch=Math.abs(x)<.01?0:-Math.sign(x)*.3;
    const roof=add("roof-"+ix+"-"+iz,x,z,w/Math.cos(pitch)+.025,d+.02,.25,building.stories*rise+Math.tan(.3)*(building.w/2-Math.abs(x)),"roof",building.stories,"wood");
    roof.architecture!.roofPitch=pitch;
    roof.supports=supportFor(roof.x,roof.z,roofLevel);
    roof.architecture!.tint=variant%2?"#605c58":"#68534a";
  }
  if(building.flag) {
    const columns=[-3.4,3.4].map((x,i)=>add("porch-column-"+i,x,-building.d/2-1.3,.65,.65,2.7,0,"detail",0));
    const canopy=add("porch",0,-building.d/2-1.1,7.5,2.6,.2,2.7,"roof",0,"wood");
    canopy.supports=columns.map(p=>p.id!);canopy.architecture!.tint="#6b6558";
  }
  for(const side of (building.id==="manor"||building.id==="hall"?[-1,1]:[1])) {
    const x=side*building.w/4,z=building.d/2-2;
    const y=building.stories*rise+Math.tan(.3)*building.w/4;
    const chimney=add("chimney-"+side,x,z,.9,.9,1.65,y-.4,"detail",building.stories);
    chimney.supports=parts.filter(p=>p.architecture!.part==="roof"&&Math.hypot(p.x-chimney.x,p.z-chimney.z)<3).map(p=>p.id!);
    chimney.architecture!.tint="#7a6658";
  }
  if(building.stories>1)for(const level of [0,1])for(const side of [-1,1]) {
    const cabinet=add("library-"+level+"-"+side,side*12,10.8,2.2,1,1.15,level*rise,"detail",level,"wood");
    if(level)cabinet.supports=parts.filter(p=>p.architecture!.part==="floor"&&Math.hypot(p.x-cabinet.x,p.z-cabinet.z)<2).map(p=>p.id!);
    cabinet.architecture!.tint="#564536";
  }
  // Low furniture is substantial cover, with deliberate room and doorway clearance.
  const furnishing=building.id==="stable"?"stall":building.id==="smithy"?"hearth":building.id==="bakery"?"oven":"cabinet";
  for(const side of [-1,1]) {
    const b=add(furnishing+side,side*(building.w/2-3),building.d/2-3,2.2,1.2,1.05,0,"detail",0,
      furnishing==="oven"||furnishing==="hearth"?"masonry":"wood");
    b.architecture!.tint="#685841";
  }
  for(const run of [[0,-building.d/2-1.8],[0,building.d/2+1.8],[-building.w/2-1.8,0],[building.w/2+1.8,0]])
    map.navigationPoints!.push({x:building.x+run[0],z:building.z+run[1]});
  // Dense authored interior anchors connect doorways without a global fine lattice.
  for(let x=-building.w/2+2;x<building.w/2;x+=2.5)for(let z=-building.d/2+2;z<building.d/2;z+=2.5)
    map.navigationPoints!.push({x:building.x+x,z:building.z+z});
  map.boxes.push(...parts);
  return parts;
}

