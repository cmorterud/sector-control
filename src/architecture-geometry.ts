import type { Box } from "./map";
import type { SurfaceKind } from "./battlefield-look";
import type { ArchitecturalTexture } from "./architecture-surfaces";

export type ArchitectureSurface = Exclude<SurfaceKind,"mud"|"bark"> | ArchitecturalTexture;
type Point = [number,number,number];
export type ArchitecturePiece = { name:string; at:Point; size:Point; tint:string; surface:ArchitectureSurface; rotation?:number; chipped?:boolean; shape?:"bell" };
export type ArchitectureMesh = {surface:ArchitectureSurface;positions:number[];normals:number[];uvs:number[];colors:number[];indices:number[]};
export const architecturePalette = (id:string) => ({
  manor:{wall:"#e0d4b9",trim:"#bca783",wood:"#604936",roof:"#747c7b",roofSurface:"slate"},
  school:{wall:"#d1c6ac",trim:"#b2a28b",wood:"#526257",roof:"#7a6555",roofSurface:"tiles"},
  inn:{wall:"#d6c1a3",trim:"#8d7860",wood:"#4c392d",roof:"#8c6c55",roofSurface:"tiles"},
  farm:{wall:"#c6c1a7",trim:"#a89a81",wood:"#68705a",roof:"#8e7560",roofSurface:"tiles"},
  hall:{wall:"#d9d3bf",trim:"#b3ada0",wood:"#4c5b59",roof:"#727e80",roofSurface:"slate"},
  stable:{wall:"#b9ae92",trim:"#8d8066",wood:"#6f5840",roof:"#806c58",roofSurface:"tiles"},
  bakery:{wall:"#d4c5a7",trim:"#a9947a",wood:"#6c5340",roof:"#8d6c55",roofSurface:"tiles"},
  smithy:{wall:"#b5b09e",trim:"#898371",wood:"#4e4b3e",roof:"#6e7573",roofSurface:"slate"},
  cottage:{wall:"#d1c8b1",trim:"#a89a83",wood:"#687264",roof:"#8a6e59",roofSurface:"tiles"},
} as Record<string,{wall:string;trim:string;wood:string;roof:string;roofSurface:"slate"|"tiles"}>)[id] ??
  {wall:"#cdc4ae",trim:"#aa9b83",wood:"#625b45",roof:"#807363",roofSurface:"tiles" as const};
const variant=(id:string)=>[...id].reduce((s,c)=>(Math.imul(s,31)+c.charCodeAt(0))>>>0,17)%4;
const letters:Record<string,string[]>={
 "0":["111","101","101","101","111"],"1":["010","110","010","010","111"],"2":["110","001","010","100","111"],"3":["110","001","110","001","110"],
 "4":["101","101","111","001","001"],"5":["111","100","110","001","110"],"6":["011","100","111","101","111"],"7":["111","001","010","010","010"],
 "8":["111","101","111","101","111"],"9":["111","101","111","001","110"],".":["000","000","000","000","010"],"&":["010","101","010","101","011"],
 H:["101","101","111","101","101"],J:["001","001","001","101","010"],K:["101","101","110","101","101"],P:["110","101","110","100","100"],
 Q:["010","101","101","111","011"],V:["101","101","101","101","010"],W:["101","101","111","111","101"],X:["101","101","010","101","101"],Y:["101","101","010","010","010"],Z:["111","001","010","100","111"],
 A:["010","101","111","101","101"],B:["110","101","110","101","110"],C:["011","100","100","100","011"],D:["110","101","101","101","110"],
 E:["111","100","110","100","111"],F:["111","100","110","100","100"],G:["011","100","101","101","011"],I:["111","010","010","010","111"],
 L:["100","100","100","100","111"],M:["101","111","111","101","101"],N:["101","111","111","111","101"],O:["010","101","101","101","010"],
 R:["110","101","110","101","101"],S:["011","100","010","001","110"],T:["111","010","010","010","010"],U:["101","101","101","101","111"],
};

// These pieces merge by material into a handful of meshes per structural
// object. They add no colliders, per-frame work or independently alive debris.
export function architecturePieces(b:Box,stage:number):ArchitecturePiece[] {
  const pieces:ArchitecturePiece[]=[],{w,h,d}=b,a=b.architecture,p=architecturePalette(a?.building??""),seed=variant(b.id??"");
  const add=(name:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,tint:string,surface:ArchitectureSurface="wood",rotation=0,chipped=false)=>{
    if(Math.min(sx,sy,sz)<=0)return;
    pieces.push({name,at:[x,y-h/2,z],size:[sx,sy,sz],tint,surface,rotation,chipped});
  };
  if(!a) {
    // Low, stable rubble envelopes with irregular stones, broken brick and
    // one splintered beam, instead of a solid gray cube and rectangular cap.
    for(let i=0;i<8;i++) {
      const x=((i%3)-1)*w*.24,z=(Math.floor(i/3)-1)*d*.24;
      const sy=h*(i<3?.65:.35),sx=w*(i<3?.56:.28),sz=d*(i<3?.58:.28);
      add(i%3?"broken masonry":"plaster fragment",x,sy/2+(i<3?0:h*.52),z,sx,sy,sz,
        i%3?"#a38c72":"#c5b89e",i%3?"stone":"plaster",(i+seed)%2?.1:-.12,true);
    }
    add("splintered joist",0,h*.76,0,w*.78,.08,d*.12,"#69513a","wood",.12,true);
    return pieces;
  }
  const wall=a.part==="wall",alongX=w>d;
  const face=(name:string,u:number,y:number,side:number,su:number,sy:number,depth:number,tint:string,surface:ArchitectureSurface="wood",chipped=false)=>
    add(name,alongX?u:side*(w/2+depth/2),y,alongX?side*(d/2+depth/2):u,
      alongX?su:depth,sy,alongX?depth:su,tint,surface,0,chipped);
  if(wall) {
    const surface=a.level===0 && h<=1.01?"stone":"plaster";
    add("masonry panel",0,h/2,0,w,h,d,surface==="stone"?p.trim:p.wall,surface);
    for(const side of [-1,1]) {
      if(a.opening==="window") {
        const length=alongX?w:d;
        if(h<=1.01) {
          face("projecting stone sill",0,h-.055,side,length+.08,.11,.09,p.trim,"stone");
          for(const edge of [-1,1])face("painted window jamb",edge*(length/2-.055),h+.625,side,.09,1.25,.055,p.wood);
          if(["farm","cottage","school"].includes(a.building))for(const edge of [-1,1])
            face("open timber shutter",edge*(length/2+.18),h+.62,side,.3,1.18,.07,p.wood);
        } else face("window head moulding",0,.065,side,length+.06,.13,.055,p.trim,"stone");
      }
      if(a.opening==="door") {
        const length=alongX?w:d;
        face("entrance lintel",0,.09,side,length+.08,.18,.085,p.trim,"stone");
        for(const edge of [-1,1])face("entrance surround",edge*(length/2-.04),-1.03,side,.13,2.2,.06,p.trim,"stone");
      }
      if(a.corner)for(let y=.16;y<h;y+=.34)
        face("dressed corner stone",a.corner*((alongX?w:d)/2-.15),y,side,.3,.29,.04,p.trim,"stone");
      if(h>1.1)face("cornice and eave shadow",0,h-.055,side,alongX?w:d,.11,.07,p.trim,"stone");
      if(stage)for(let i=0;i<2;i++) {
        const length=alongX?w:d,sy=Math.min(h*.65,.55),u=((seed+i)%3-1)*length*.22;
        face("chipped plaster exposes brick",u,h*(.3+i*.4),side,Math.min(length*.46,.85),sy,.018,"#a98267","brick",true);
      }
    }
    if(a.feature==="clock")for(const side of [-1,1]) {
      face("clock stone surround",0,h*.53,side,.95,.95,.07,p.trim,"stone");
      face("clock face",0,h*.53,side,.76,.76,.085,"#eee5ca","plaster");
      face("clock vertical hand",0,h*.6,side,.035,.27,.095,"#394038","iron");
      face("clock horizontal hand",.12,h*.53,side,.28,.035,.095,"#394038","iron");
    }
    if(a.sign)for(const side of a.signBothSides?[-1,1]:[-1]) {
      const length=alongX?w:d,pixel=Math.min(.055,(length-.24)/(a.sign.length*4));
      face("painted entrance sign",0,h*.57,side,length-.1,.4,.055,p.wood);
      [...a.sign].forEach((letter,index)=>(letters[letter]??[]).forEach((row,iy)=>[...row].forEach((ink,ix)=>{
        if(ink==="1")face("painted sign lettering",(index*4+ix-a.sign!.length*2+1)*pixel*(a.signBothSides&&side===-1?-1:1),h*.57+(2-iy)*pixel,side,pixel*.86,pixel*.86,.065,"#e2d7bb","plaster");
      })));
    }
  } else if(a.part==="floor"||a.part==="ceiling"||a.part==="stair") {
    const paved=b.kind==="concrete";
    const ceiling=a.part==="ceiling";
    add(a.part,0,h/2,0,w,h,d,paved?"#c2b9a0":ceiling?"#e0d5bc":"#a68a61",paved?"stone":ceiling?"plaster":"floorboards");
    if(a.part!=="stair" && !paved) {
      for(const x of [-w*.28,w*.28])add("exposed floor joist",x,-.07,0,.12,.14,d,"#6e543c");
      if(stage)add("splintered floor edge",w*.38,-.02,d*.38,w*.24,.09,d*.18,"#c2a06f","wood",.08,true);
    }
    if(a.part==="stair") {
      add("worn tread nosing",0,h-.02,-d/2-.015,w,.055,.07,"#bb9968");
      for(const x of [-w*.46,w*.46])add("stair runner",x,h/2,0,.09,h,d,"#5c4631");
    }
  } else if(a.part==="roof") {
    add("roof battens and decking",0,h/2,0,w,h,d,"#72583e");
    add("weathered roof courses",0,h+.018,0,w,.035,d,p.roof,p.roofSurface);
    for(const z of [-d*.3,d*.3])add("exposed roof rafter",0,-.055,z,w,.11,.11,"#645039");
    if(stage)for(let i=0;i<3;i++)add("broken roof tile",(i-1)*w*.22,h+.055,(seed%2?1:-1)*d*.22,w*.17,.04,d*.2,"#807062",p.roofSurface,.08*(i-1),true);
    if(a.feature==="bell") {
      for(const x of [-.4,.4])add("school bell post",x,h+.42,0,.12,.85,.15,p.wood);
      add("bell shelter",0,h+.9,0,1.1,.16,.95,p.roof,p.roofSurface);
      add("school bell",0,h+.49,0,.28,.35,.28,"#777255","iron");
      pieces[pieces.length-1].shape="bell";
      add("bell clapper",0,h+.27,0,.055,.1,.055,"#514f39","iron");
    }
  } else {
    if(!a.feature) {
      const chimney=b.id?.includes("chimney"),surface=chimney?"brick":b.kind==="wood"?"wood":"stone";
      add(chimney?"brick chimney":"porch pier",0,h/2,0,w,h,d,p.trim,surface);
      add(chimney?"chimney crown":"pier capital",0,h-.05,0,w+.1,.1,d+.1,p.trim,"stone");
      if(chimney)add("dark chimney flue",0,h+.008,0,w*.62,.018,d*.62,"#34332b","iron");
      else add("pier plinth",0,.075,0,w+.1,.15,d+.1,p.trim,"stone");
      return pieces;
    }
    const f=a.feature??"cupboard";
    if(f==="oven"||f==="hearth") {
      add("brick hearth",0,h/2,0,w,h,d,"#b09678","brick");
      add("dark firebox",0,h*.39,-d/2-.012,w*.56,h*.5,.025,"#34332b","iron");
      add("stone mantel",0,h*.92,0,w+.09,h*.13,d+.06,p.trim,"stone");
      if(f==="oven")add("oven iron door",0,h*.37,-d/2-.03,w*.36,h*.28,.025,"#515249","iron");
    } else if(f==="bed") {
      add("bed frame",0,h*.22,0,w,h*.35,d,p.wood);
      add("folded blanket",0,h*.58,d*.08,w*.93,h*.36,d*.72,"#8a8c76","fabric");
      add("pillow",0,h*.62,-d*.36,w*.75,h*.26,d*.2,"#ddd4bb","fabric");
      for(const z of [-d*.46,d*.46])add("bed end",0,h*.42,z,w,h*.84,.09,p.wood);
    } else if(f==="table"||f==="desk"||f==="workbench") {
      add("plank tabletop",0,h-.055,0,w,.11,d,"#a78a60","floorboards");
      for(const x of [-w*.41,w*.41])for(const z of [-d*.37,d*.37])add("table leg",x,h*.46,z,.11,h*.92,.11,p.wood);
      add("table apron",0,h*.62,d*.38,w*.9,h*.45,.1,p.wood);
      add(f==="desk"?"school exercise book":f==="workbench"?"iron tools":"earthenware jug",-w*.2,h+.045,0,w*.22,.09,d*.33,f==="workbench"?"#62655c":"#bcb69b",f==="workbench"?"iron":"fabric");
    } else if(f==="stall") {
      add("stable manger",0,h*.26,0,w,h*.52,d,p.wood);
      add("straw in trough",0,h*.54,0,w*.82,.08,d*.72,"#b7a178","fabric");
      for(const x of [-w*.45,w*.45])add("stall upright",x,h*.5,d*.35,.12,h,.12,p.wood);
    } else {
      add("cabinet carcass",0,h/2,0,w,h,d,p.wood);
      const shelves=f==="bookcase"?3:1;
      for(let row=0;row<shelves;row++) {
        const y=h*(row+.45)/shelves;
        add("recessed cabinet shelf",0,y,-d/2-.008,w*.9,h*.7/shelves,.025,"#3c352d");
        if(f==="bookcase")for(let book=0;book<6;book++)add("individual book spine",w*(book-2.5)*.135,y,-d/2-.026,w*.1,h*.54/shelves,.035,["#866754","#677464","#a08c67"][book%3],"fabric");
        else for(const side of [-1,1])add("cabinet door",side*w*.235,h*.48,-d/2-.025,w*.44,h*.8,.04,"#8b7150");
      }
      add("countertop and crown",0,h-.025,0,w+.06,.08,d+.04,"#b29974","floorboards");
      if(f==="counter")add("inn counter rail",0,h*.23,-d/2-.08,w*.94,.055,.055,"#6b6750","iron");
    }
    if(stage)add("splintered furnishing",0,h*.78,-d*.45,w*.67,.06,.08,"#c4a174","wood",.13,true);
  }
  return pieces;
}

export function architectureGeometry(b:Box,stage:number):ArchitectureMesh[] {
  const groups=new Map<ArchitectureSurface,ArchitectureMesh>();
  const boxFaces=[[1,0,3,2],[4,5,6,7],[5,1,2,6],[0,4,7,3],[3,7,6,2],[0,1,5,4]];
  for(const piece of architecturePieces(b,stage)) {
    let mesh=groups.get(piece.surface);
    if(!mesh){mesh={surface:piece.surface,positions:[],normals:[],uvs:[],colors:[],indices:[]};groups.set(piece.surface,mesh);}
    const [w,h,d]=piece.size.map(n=>n/2),[x,y,z]=piece.at,angle=piece.rotation??0;
    let corners:Point[]=[[-w,-h,-d],[w,-h,-d],[w,h,-d],[-w,h,-d],[-w,-h,d],[w,-h,d],[w,h,d],[-w,h,d]],faces=boxFaces;
    if(piece.shape==="bell") {
      const sides=12;
      corners=Array.from({length:sides*2},(_,i)=>{const angle=i%sides/sides*Math.PI*2,radius=i<sides?1:.45;return [Math.cos(angle)*w*radius,i<sides?-h:h,Math.sin(angle)*d*radius];});
      corners.push([0,h,0],[0,-h,0]);faces=[];
      for(let i=0;i<sides;i++) {const next=(i+1)%sides;faces.push([i+sides,next+sides,next,i],[24,next+sides,i+sides],[25,i,next]);}
    }
    const pts=corners.map(([a,c,e],i)=>{
      if(piece.chipped){a*=.82+(i%3)*.075;c*=.8+((i+2)%3)*.085;e*=.86+(i%2)*.1;}
      return [x+a*Math.cos(angle)-c*Math.sin(angle),y+a*Math.sin(angle)+c*Math.cos(angle),z+e] as Point;
    });
    const tint=[1,3,5].map(i=>parseInt(piece.tint.slice(i,i+2),16)/255);
    for(const face of faces) {
      const q=face.map(i=>pts[i]),u=q[1].map((n,i)=>n-q[0][i]),v=q[q.length-1].map((n,i)=>n-q[0][i]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal);
      const start=mesh.positions.length/3,us=Math.hypot(...u)*.625,vs=Math.hypot(...v)*.625;
      for(const point of q){mesh.positions.push(...point);mesh.normals.push(...normal.map(n=>n/length));mesh.colors.push(...tint,1);}
      if(q.length===4){mesh.uvs.push(0,0,us,0,us,vs,0,vs);mesh.indices.push(start,start+1,start+2,start,start+2,start+3);}
      else{mesh.uvs.push(0,0,us,0,0,vs);mesh.indices.push(start,start+1,start+2);}
    }
  }
  return [...groups.values()];
}
export const architectureKey=(b:Box,stage:number)=>JSON.stringify([b.w,b.h,b.d,b.kind,b.architecture,stage,variant(b.id??"")]);
