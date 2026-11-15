import type {Box} from "./map";
export type FarmPart={name:string;shape:'box'|'cylinder';at:[number,number,number];size:[number,number,number];tint:string;rotation?:[number,number,number];wood?:boolean;stone?:boolean};
// Shared simple primitives in the destructible-cover batch; no per-prop updates.
export function farmPropParts(b:Box,h:number):FarmPart[]{
 const {w,d}=b,parts:FarmPart[]=[];
 const box=(name:string,at:FarmPart['at'],size:FarmPart['size'],tint='#74604a',wood=true)=>parts.push({name,shape:'box',at,size,tint,wood});
 if(b.farmProp==='crate'){
  box('supply crate',[0,h/2,0],[w,h,d]);
  for(const x of [-w*.36,w*.36])box('crate binding',[x,h/2,0],[.055,h+.015,d+.018],'#414b43',false);
  for(const side of [-1,1])for(let i=1;i<=3;i++)box('crate plank seam',[0,h*i/4,side*(d/2+.004)],[w,.012,.01],'#3d342b',false);
  box('crate lid',[0,h+.008,0],[w+.02,.035,d+.02]);
 }else if(b.farmProp==='timber'){
  for(let row=0;row<3;row++)for(let col=0;col<3-row;col++) {
   const z=(col-(2-row)/2)*d*.31,y=h*(.17+row*.29),diameter=h*.31;
   parts.push({name:'cut timber log',shape:'cylinder',at:[0,y,z],size:[diameter,w,diameter],tint:row%2?'#68533c':'#766248',wood:true,rotation:[0,0,90]});
   for(const side of [-1,1])parts.push({name:'pale log end',shape:'cylinder',at:[side*(w/2+.005),y,z],size:[diameter*.94,.015,diameter*.94],tint:'#b39a6b',rotation:[0,0,90]});
  }
 }else if(b.farmProp==='worktable'){
  for(const x of [-w*.36,w*.36])for(const z of [-d*.34,d*.34])box('trestle leg',[x,h*.45,z],[.11,h*.9,.11]);
  for(let i=0;i<4;i++)box('workyard table plank',[0,h*.91,(i-1.5)*d*.24],[w,h*.12,d*.22]);
  box('trestle stretcher',[0,h*.25,0],[w*.78,.1,.1]);
  box('wooden tool tray',[-w*.22,h*.99,0],[w*.3,h*.02,d*.5]);
 }else if(b.farmProp==='trough'){
  const stone=(name:string,at:FarmPart['at'],size:FarmPart['size'])=>parts.push({name,shape:'box',at,size,tint:'#999b88',stone:true});
  stone('stone water trough base',[0,h*.18,0],[w,h*.36,d]);
  for(const z of [-d*.43,d*.43])stone('trough side',[0,h*.65,z],[w,h*.7,d*.14]);
  for(const x of [-w*.46,w*.46])stone('trough end',[x,h*.65,0],[w*.08,h*.7,d*.75]);
  box('trough water',[0,h*.68,0],[w*.82,.015,d*.68],'#52685a',false);
 }else if(b.farmProp==='bench'){
  for(const x of [-w*.35,w*.35])for(const z of [-d*.32,d*.32])box('bench iron foot',[x,h*.25,z],[.075,h*.5,.075],'#38463e',false);
  for(let i=0;i<4;i++)box('weathered bench seat',[0,h*.51,-d*.32+i*d*.21],[w,.065,d*.17]);
  for(const x of [-w*.39,w*.39])box('bench back upright',[x,h*.73,d*.34],[.06,h*.54,.065],'#38463e',false);
  for(const y of [.75,.95])box('bench back slat',[0,h*y,d*.34],[w,.09,.065]);
 }else if(b.farmProp==='planter'){
  box('planter base',[0,.045,0],[w,.09,d]);
  for(const z of [-d*.44,d*.44])for(let i=0;i<3;i++)box('planter side board',[0,h*(.12+i*.16),z],[w,h*.14,d*.12]);
  for(const x of [-w*.45,w*.45])box('planter end',[x,h*.29,0],[w*.1,h*.55,d]);
  box('planter soil',[0,h*.5,0],[w*.84,.04,d*.74],'#514633',false);
  for(let i=0;i<5;i++)box('hardy garden foliage',[(i-2)*w*.16,h*.75,(i%2-.5)*d*.3],[w*.19,h*.5,d*.35],i%2?'#727b4d':'#879064',false);
 }else if(b.farmProp==='fountain'){
  const stone=(name:string,at:FarmPart['at'],size:FarmPart['size'])=>parts.push({name,shape:'box',at,size,tint:'#b0aa95',stone:true});
  stone('fountain plinth',[0,.08,0],[w,.16,d]);
  stone('fountain basin',[0,.19,0],[w*.94,.16,d*.94]);
  for(const z of [-d*.44,d*.44])stone('basin stone rim',[0,h*.4,z],[w*.94,h*.35,d*.09]);
  for(const x of [-w*.44,w*.44])stone('basin stone rim',[x,h*.4,0],[w*.09,h*.35,d*.8]);
  box('still fountain water',[0,h*.33,0],[w*.8,.015,d*.8],'#4e6863',false);
  parts.push({name:'fountain pedestal',shape:'cylinder',at:[0,h*.57,0],size:[w*.17,h*.83,d*.17],tint:'#a4a28e',stone:true});
  parts.push({name:'fountain crown',shape:'cylinder',at:[0,h*.96,0],size:[w*.28,h*.08,d*.28],tint:'#b0aa95',stone:true});
 }else if(b.farmProp==='fence'){
  // Follow either axis without adding per-slat colliders.
  const alongX=w>=d,length=Math.max(w,d),thickness=Math.min(w,d),count=Math.max(2,Math.ceil(length/.34));
  const at=(u:number,y:number):FarmPart['at']=>alongX?[u,y,0]:[0,y,u];
  const size=(a:number,b:number,c:number):FarmPart['size']=>alongX?[a,b,c]:[c,b,a];
  for(const y of [.25,.7])box('garden fence rail',at(0,h*y),size(length,.075,Math.min(.09,thickness)));
  for(let i=0;i<count;i++)box('garden fence paling',at((i/(count-1)-.5)*(length-.08),h*.5),size(.1,h,thickness*.75));
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
