import type {Box} from "./map";
export type FarmPart={name:string;shape:'box'|'cylinder';at:[number,number,number];size:[number,number,number];tint:string;rotation?:[number,number,number];wood?:boolean};
// Shared simple primitives in the destructible-cover batch; no per-prop updates.
export function farmPropParts(b:Box,h:number):FarmPart[]{
 const {w,d}=b,parts:FarmPart[]=[];
 const box=(name:string,at:FarmPart['at'],size:FarmPart['size'],tint='#74604a',wood=true)=>parts.push({name,shape:'box',at,size,tint,wood});
 if(b.farmProp==='crate'){
  box('supply crate',[0,h/2,0],[w,h,d]);
  for(const x of [-w*.36,w*.36])box('crate binding',[x,h/2,0],[.055,h+.015,d+.018],'#414b43',false);
  for(const side of [-1,1])for(let i=1;i<=3;i++)box('crate plank seam',[0,h*i/4,side*(d/2+.004)],[w,.012,.01],'#3d342b',false);
  box('crate lid',[0,h+.008,0],[w+.02,.035,d+.02]);
 }else if(b.farmProp==='cart'){
  box('abandoned farm cart',[0,h*.51,0],[w*.9,h*.78,d*.78]);
  for(const side of [-1,1]){
   box('cart side plank',[0,h*.89,side*d*.38],[w*.96,h*.18,.09]);
   box('cart axle',[side*w*.31,h*.31,0],[.11,.12,d*.96],'#444a43',false);
   for(const end of [-1,1]){
    parts.push({name:'cart wheel',shape:'cylinder',at:[side*w*.31,h*.32,end*d*.43],size:[h*.62,.11,h*.62],tint:'#423d33',rotation:[90,0,0]});
    box('cart wheel hub',[side*w*.31,h*.32,end*d*.47],[.12,.12,.08],'#777465',false);
   }
  }
  box('broken cart shaft',[w*.36,h*.2,0],[w*.45,.09,.1]);
 }
 return parts;
}
