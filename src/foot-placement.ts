import {groundHeight,type MapDefinition} from './map';

export const footRules={thigh:.42,calf:.4,sole:.1125,near:26,far:32,maxGroundDelta:.34};
export type FootContact={x:number;y:number;z:number;stance:boolean;yaw:number;revision:number};
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const smooth=(v:number)=>{v=clamp(v,0,1);return v*v*(3-2*v);};

export const gaitFrequency=(motion:number,sprint:number,crouch:number)=>(2.7+2.4*crouch-.45*sprint)/(.4+.6*motion);
export function footCycle(phase:number,motion:number,sprint:number,crouch:number){
 const duty=.58-.30*motion*(1-.65*crouch)-.04*sprint;
 const cycle=((phase/(Math.PI*2))%1+1)%1,stance=motion<.06||cycle<duty;
 const swing=clamp((cycle-duty)/(1-duty),0,1),stride=Math.PI*2/gaitFrequency(motion,sprint,crouch)*duty*Math.min(1,motion/.2);
 return {stance,duty,along:stance?stride*.5:stride*(-.5+smooth(swing)),lift:stance?0:Math.sin(swing*Math.PI)*(.085+.065*sprint-.025*crouch)*motion};
}
// A five-point sole footprint follows the same terrain used by movement. A
// nearby vertical trench wall is not a surface that can pull the boot upward.
export function footSupport(map:MapDefinition,x:number,z:number,yaw:number,rootY:number){
 const c=Math.cos(yaw),s=Math.sin(yaw);
 const sample=(dx:number,dz:number)=>groundHeight(x+c*dx-s*dz,z+s*dx+c*dz,map);
 const center=sample(0,0),toe=sample(0,-.18),heel=sample(0,.07),left=sample(-.08,0),right=sample(.08,0);
 if([center,toe,heel,left,right].some(y=>!Number.isFinite(y)||Math.abs(y-rootY)>footRules.maxGroundDelta))return null;
 const pitch=clamp(-Math.atan2(heel-toe,.25),-.38,.38),roll=clamp(Math.atan2(right-left,.16),-.3,.3);
 // Raise the sole enough for the highest footprint sample after its tilt.
 let height=center+footRules.sole;
 for(const [dx,dz,y] of [[0,-.18,toe],[0,.07,heel],[-.08,0,left],[.08,0,right]]){
  const soleY=dx*Math.sin(roll)-dz*Math.sin(pitch)-footRules.sole*Math.cos(pitch)*Math.cos(roll);
  height=Math.max(height,y-soleY);
 }
 return {height,pitch,roll};
}

export function updateFootContact(previous:FootContact|undefined,input:{x:number;z:number;yaw:number;rootY:number;phase:number;motion:number;sprint:number;crouch:number;forward:number;sideways:number;side:number;revision:number},map:MapDefinition){
 const gait=footCycle(input.phase,input.motion,input.sprint,input.crouch);
 const c=Math.cos(input.yaw),s=Math.sin(input.yaw),length=Math.max(.001,Math.hypot(input.forward,input.sideways));
 const dx=(s*input.forward+c*input.sideways)/length,dz=(-c*input.forward+s*input.sideways)/length;
 const baseX=input.x+c*input.side*.145,baseZ=input.z+s*input.side*.145;
 let x=baseX+dx*gait.along,z=baseZ+dz*gait.along;
 const old=previous,plant=old&&old.stance&&gait.stance&&old.revision===input.revision&&Math.hypot(old.x-baseX,old.z-baseZ)<(input.motion<.06?.2:.42);
 if(plant){x=old.x;z=old.z;}
 let support=footSupport(map,x,z,input.yaw,input.rootY);
 if(!support){x=baseX;z=baseZ;support=footSupport(map,x,z,input.yaw,input.rootY);}
 if(!support)return null;
 const contact:FootContact=previous??{x,y:support.height,z,stance:gait.stance,yaw:input.yaw,revision:input.revision};
 Object.assign(contact,{x,y:support.height+gait.lift,z,stance:gait.stance,yaw:input.yaw,revision:input.revision});
 return {contact,pitch:support.pitch,roll:support.roll};
}
