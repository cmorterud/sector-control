// Offline review of the actual shared forest meshes; not a browser/GPU screenshot.
import {writeFileSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {forestGeometry,type ForestShape} from '../src/forest-geometry';
import {surfacePixels} from '../src/battlefield-look';
const width=1400,height=1100,pixels=Buffer.alloc(width*height*4),depth=new Float32Array(width*height).fill(-Infinity);
for(let i=0;i<pixels.length;i+=4)pixels.set([183,194,183,255],i);
const letters="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const font=["01110100011000111111100011000110001","11110100011000111110100011000111110","01111100001000010000100001000001111","11110100011000110001100011000111110","11111100001000011110100001000011111","11111100001000011110100001000010000","01111100001000010111100011000101111","10001100011000111111100011000110001","11111001000010000100001000010011111","00111000100001000010000101001001100","10001100101010011000101001001010001","10000100001000010000100001000011111","10001110111010110101100011000110001","10001110011010110011100011000110001","01110100011000110001100011000101110","11110100011000111110100001000010000","01110100011000110001101011001001101","11110100011000111110101001001010001","01111100001000001110000010000111110","11111001000010000100001000010000100","10001100011000110001100011000101110","10001100011000110001100010101000100","10001100011000110101101011101110001","10001100010101000100010101000110001","10001100010101000100001000010000100","11111000010001000100010001000011111","01110100011001110101110011000101110","00100011000010000100001000010001110","01110100010000100010001000100011111","11110000010000101110000010000111110","00010001100101010010111110001000010","11111100001000011110000010000111110","01110100001000011110100011000101110","11111000010001000100010000100001000","01110100011000101110100011000101110","01110100011000101111000010000101110"];
function label(text:string,x:number,y:number){for(const ch of text.toUpperCase()){const f=font[letters.indexOf(ch)];if(f)for(let r=0;r<7;r++)for(let c=0;c<5;c++)if(f[r*5+c]==="1")for(let a=0;a<2;a++)for(let b=0;b<2;b++)pixels.set([35,51,54,255],((y+r*2+a)*width+x+c*2+b)*4);x+=13;}}

const bark=surfacePixels('bark',256).diffuse;
function draw(shape:ForestShape,variant:number,scale:number[],at:number[],ox:number,oy:number,zoom:number,tint:number[],textured=false){
 const m=forestGeometry(shape,variant),points:number[][]=[];
 for(let i=0;i<m.positions.length;i+=3){const [x,y,z]=m.positions.slice(i,i+3).map((v,k)=>v*scale[k]+at[k]);points.push([ox+(x*.86-z*.51)*zoom,oy+(-y+(x*.51+z*.86)*.18)*zoom,x*.51+z*.86+y*.18]);}
 for(let i=0;i<m.indices.length;i+=3){
  const ids=m.indices.slice(i,i+3),[a,b,c]=ids.map(n=>points[n]);
  const n=m.normals.slice(ids[0]*3,ids[0]*3+3).map((v,k)=>v/scale[k]),length=Math.hypot(...n);
  const area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(area>=-.0001)continue;
  const shade=.4+.6*Math.max(0,(n[0]*.4+n[1]*.8+n[2]*.3)/length);
  for(let y=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1])));y<=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])));y++)
   for(let x=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0])));x<=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0])));x++){
    const u=((b[0]-x)*(c[1]-y)-(b[1]-y)*(c[0]-x))/area,v=((c[0]-x)*(a[1]-y)-(c[1]-y)*(a[0]-x))/area,w=1-u-v;if(u<0||v<0||w<0)continue;
    const z=u*a[2]+v*b[2]+w*c[2],pos=y*width+x;if(z<=depth[pos])continue;depth[pos]=z;
    let grain=1;
    if(textured){const uv=[0,1].map(k=>u*m.uvs[ids[0]*2+k]+v*m.uvs[ids[1]*2+k]+w*m.uvs[ids[2]*2+k]);const tx=Math.floor(((uv[0]%1+1)%1)*256),ty=Math.floor(((uv[1]%1+1)%1)*256);grain=bark[(ty*256+tx)*4]/255;}
    pixels.set([...tint.map(c=>Math.round(c*shade*grain)),255],pos*4);
   }
 }
}
for(let i=0;i<4;i++){
 const ox=175+i*350,oy=760,h=i===3?4.8:8;
 label(['PINE','BROADLEAF','BARE','DAMAGED'][i],i*350+32,35);
 draw('trunk',i,[.8,h,.8],[0,0,0],ox,oy,73,[102,87,70],true);
 draw(i===2?'deadLimbs':'limbs',i,[h,h,h],[0,0,0],ox,oy,73,[98,81,63],true);
 if(i<2)draw(i===0?'pine':'crown',i,[h,h,h],[0,0,0],ox,oy,73,i===0?[83,96,71]:[98,109,79]);
}
for(const [i,shape] of (['fern','branch','root','litter'] as ForestShape[]).entries()){
 label(shape,i*350+32,840);
 draw(shape,i,shape==='fern'?[1,1,1]:[1.4,1.4,1.4],[0,0,0],175+i*350,1030,155,shape==='fern'?[89,99,72]:shape==='litter'?[119,97,71]:[98,81,63],shape==='branch'||shape==='root');
}
let crcTable:number[]=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c;}
const chunk=(name:string,data:Buffer)=>{const type=Buffer.from(name),all=Buffer.concat([type,data]);let crc=0xffffffff;for(const b of all)crc=crcTable[(crc^b)&255]^(crc>>>8);const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([head,all,tail]);};
const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
const rows=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)pixels.copy(rows,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
writeFileSync(process.argv[2]??'playtest-artifacts/forest-sheet.png',Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]));
