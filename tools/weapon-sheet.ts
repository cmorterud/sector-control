// Offline mesh review: actual shared mesh vertices, software rasterized without a browser.
import {writeFileSync} from "node:fs";
import {deflateSync} from "node:zlib";
import {weaponDesign} from "../src/weapon-design";
import {rifleGeometry, type RiflePart} from "../src/rifle-geometry";
const width=1400,height=1100,pixels=Buffer.alloc(width*height*4),depth=new Float32Array(width*height).fill(-Infinity);
for(let i=0;i<pixels.length;i+=4)pixels.set([194,204,204,255],i);
const ids=["SMLE Mk III","Gewehr 98","Berthier Mle 1916","Scoped Lebel","Lewis Mk I","MG 08/15","Chauchat","Webley Mk VI","P08","Ruby"];
const letters="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const font=["01110100011000111111100011000110001","11110100011000111110100011000111110","01111100001000010000100001000001111","11110100011000110001100011000111110","11111100001000011110100001000011111","11111100001000011110100001000010000","01111100001000010111100011000101111","10001100011000111111100011000110001","11111001000010000100001000010011111","00111000100001000010000101001001100","10001100101010011000101001001010001","10000100001000010000100001000011111","10001110111010110101100011000110001","10001110011010110011100011000110001","01110100011000110001100011000101110","11110100011000111110100001000010000","01110100011000110001101011001001101","11110100011000111110101001001010001","01111100001000001110000010000111110","11111001000010000100001000010000100","10001100011000110001100011000101110","10001100011000110001100010101000100","10001100011000110101101011101110001","10001100010101000100010101000110001","10001100010101000100001000010000100","11111000010001000100010001000011111","01110100011001110101110011000101110","00100011000010000100001000010001110","01110100010000100010001000100011111","11110000010000101110000010000111110","00010001100101010010111110001000010","11111100001000011110000010000111110","01110100001000011110100011000101110","11111000010001000100010000100001000","01110100011000101110100011000101110","01110100011000101111000010000101110"];
function label(text:string,x:number,y:number){for(const ch of text.toUpperCase()){const f=font[letters.indexOf(ch)];if(f)for(let r=0;r<7;r++)for(let c=0;c<5;c++)if(f[r*5+c]==="1")for(let a=0;a<2;a++)for(let b=0;b<2;b++)pixels.set([35,51,54,255],((y+r*2+a)*width+x+c*2+b)*4);x+=13;}}
function rotate(v:number[],angles:number[]){let [x,y,z]=v;for(let axis=0;axis<3;axis++){const a=angles[axis]*Math.PI/180,c=Math.cos(a),s=Math.sin(a);if(axis===0)[y,z]=[y*c-z*s,y*s+z*c];else if(axis===1)[x,z]=[x*c+z*s,-x*s+z*c];else [x,y]=[x*c-y*s,x*s+y*c];}return [x,y,z];}
for(const [index,id] of ids.entries()){
 const weapon=index<4?"serviceRifle":index<7?"machineGun":"pistol",d=weaponDesign({weapon,weaponId:id})!;
 const ox=(index%2)*700+350,oy=Math.floor(index/2)*220+135;
 label(id,(index%2)*700+22,Math.floor(index/2)*220+16);
 const parts=[...d.parts,d.magazine,...d.actionParts.map(p=>({...p,at:p.at.map((v,i)=>v+d.actionOrigin[i]) as [number,number,number]}))];
 parts.push({name:"front base",shape:"buttplate",at:[0,.055,d.front],size:[.03,.06,.045],tint:"steel"});
 if(id.startsWith("Scoped"))parts.push({name:"scope",shape:"shroud",at:[-.035,.18,-.03],size:[.065,.4,.065],tint:"steel",rotation:[90,0,0]});
 parts.push({name:"front sight",shape:"slot",at:[0,.0925,d.front],size:[.008,.04,.018],tint:"dark"});
 for(const p of parts){
  const mesh=rifleGeometry(p.shape),base=p.tint==="walnut"?[110,65,33]:p.tint==="dark"?[21,27,29]:p.tint==="edge"?[133,145,139]:[65,75,73];
  const points=[] as number[][];
  for(let i=0;i<mesh.positions.length;i+=3){const v=rotate(mesh.positions.slice(i,i+3).map((v,a)=>v*p.size[a]),p.rotation??[0,0,0]).map((v,a)=>v+p.at[a]);points.push([ox+(-v[2]*.95+v[0]*.31)*440,oy+(-v[1]+v[0]*.12+v[2]*.035)*440,v[0]*.95+v[2]*.31+v[1]*.05]);}
  for(let i=0;i<mesh.indices.length;i+=3){
   const ids=mesh.indices.slice(i,i+3),[a,b,c]=ids.map(n=>points[n]);
   const area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(area)<.001)continue;
   const loX=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),hiX=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0]))),loY=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),hiY=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])));
   const n=rotate(mesh.normals.slice(ids[0]*3,ids[0]*3+3).map((v,a)=>v/p.size[a]),p.rotation??[0,0,0]),len=Math.hypot(...n),shade=.42+.58*Math.max(0,(n[0]*.4+n[1]*.8+n[2]*.3)/len);
   for(let y=loY;y<=hiY;y++)for(let x=loX;x<=hiX;x++){
    const u=((b[0]-x)*(c[1]-y)-(b[1]-y)*(c[0]-x))/area,v=((c[0]-x)*(a[1]-y)-(c[1]-y)*(a[0]-x))/area,w=1-u-v;
    if(u<0||v<0||w<0)continue;const z=u*a[2]+v*b[2]+w*c[2],at=y*width+x;if(z<=depth[at])continue;depth[at]=z;
    const grain=p.tint==="walnut"?1+Math.sin(x*.8+y*.07)*.07:1;
    pixels.set([...base.map(v=>Math.round(v*shade*grain)),255],at*4);
   }
  }
 }
}
let crcTable:number[]=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c;}
const chunk=(name:string,data:Buffer)=>{const type=Buffer.from(name),all=Buffer.concat([type,data]);let crc=0xffffffff;for(const b of all)crc=crcTable[(crc^b)&255]^(crc>>>8);const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([head,all,tail]);};
const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
const rows=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)pixels.copy(rows,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
writeFileSync(process.argv[2]??'playtest-artifacts/weapon-sheet.png',Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]));
