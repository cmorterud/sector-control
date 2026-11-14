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
 }else if(b.farmProp==='relayMast'){
  parts.push({name:'splintered signal mast',shape:'cylinder',at:[0,h/2,0],size:[w,h,d],tint:'#62513b',wood:true});
  for(const side of [-1,1])box('broken insulator',[side*w*.33,h*.83,0],[w*.25,.13,d*.85],'#8d9690',false);
  // Thin severed cables are cosmetic and disappear with their wooden mast.
  for(let i=0;i<6;i++)box('severed telephone wire',[.18+i*.4,h*(.8-i*.11),.02],[.55,.015,.015],'#343b36',false);
 }else if(b.farmProp==='radio'){
  box('field telephone case',[0,h*.45,0],[w,h*.9,d],'#4b5140');
  box('telephone control panel',[0,h*.53,-d*.51],[w*.8,h*.5,.025],'#292f2a',false);
  for(const x of [-w*.23,w*.23])parts.push({name:'telephone dial',shape:'cylinder',at:[x,h*.58,-d*.55],size:[.13,.04,.13],tint:'#9e9a7c',rotation:[90,0,0]});
  box('telephone handset',[0,h*.96,0],[w*.75,.1,d*.4],'#292f2a',false);
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
