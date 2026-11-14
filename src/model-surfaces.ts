// Shared neutral surface atlas: vertex/material tint supplies faction colors.
// Eight padded tiles keep uniforms, skin and equipment on one corpse material.
export const modelSurfaces = ['cloth','webbing','leather','skin','metal','walnut','steel','solid'] as const;
export type ModelSurface = typeof modelSurfaces[number];
export const modelAtlasSize = {width:512,height:256};
export function modelUV(u:number,v:number,surface:ModelSurface):[number,number] {
  const tile=modelSurfaces.indexOf(surface),pad=3/128;
  return [(tile%4+pad+u*(1-2*pad))/4,(Math.floor(tile/4)+pad+v*(1-2*pad))/2];
}
export function modelSurfaceFor(name:string):ModelSurface {
  if(/eye|cartridge|recognition|armband/.test(name))return 'solid';
  if(/helmet|button|buckle/.test(name))return 'metal';
  if(/hand|head|nose|ear|chin|neck/.test(name))return 'skin';
  if(/boot|pouch|strap|flap/.test(name))return 'leather';
  if(/belt|pack|blanket|webbing/.test(name))return 'webbing';
  return 'cloth';
}
export function modelSurfaceAtlas() {
  const {width,height}=modelAtlasSize,diffuse=new Uint8Array(width*height*4),normal=new Uint8Array(diffuse.length),gloss=new Uint8Array(diffuse.length);
  const hash=(x:number,y:number)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
  for(const [tile,kind] of modelSurfaces.entries())for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const u=x/128,v=y/128,noise=hash(x,y),weave=(Math.sin(x*Math.PI/2)*Math.cos(y*Math.PI/2));
    const grain=Math.sin(u*73+Math.sin(v*6.28)*2+Math.sin(u*17+v*5));
    const cloth=kind==='cloth'||kind==='webbing',skin=kind==='skin',wood=kind==='walnut';
    const seam=Math.exp(-(Math.min(u,1-u)**2)*650),wear=Math.exp(-(Math.min(v,1-v)**2)*190);
    const shade=kind==='solid'?1:cloth?.88+weave*.028+noise*.05-seam*.1:skin?.95+noise*.022:wood?.79+grain*.11+noise*.04:.86+noise*.04+wear*.075;
    const at=((Math.floor(tile/4)*128+y)*width+tile%4*128+x)*4;
    for(let c=0;c<3;c++)diffuse[at+c]=Math.round(Math.min(1,shade)*255);
    const bump=cloth?.065:skin?.008:wood?.035:.018;
    normal.set([Math.round(128+weave*bump*127),Math.round(128+(noise-.5)*bump*127),255,255],at);
    const shine=cloth?22:skin?34:wood?65:kind==='leather'?52:kind==='solid'?30:110+wear*40;
    gloss.set([shine,shine,shine,255],at);diffuse[at+3]=255;
  }
  return {diffuse,normal,gloss};
}
