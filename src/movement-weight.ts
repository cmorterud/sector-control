// Presentation springs only; input velocity/heading and stance stay authoritative.
export type Spring={value:number;velocity:number};
export type MovementWeight={speedForward:number;speedSide:number;yaw:number;forward:Spring;side:Spring;turn:Spring;crouch:Spring};
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export function spring(s:Spring,target:number,frequency:number,dt:number){
 if(dt<=0)return;
 const change=s.value-target,decay=Math.exp(-frequency*dt),step=(s.velocity+frequency*change)*dt;
 s.value=target+(change+step)*decay;s.velocity=(s.velocity-frequency*step)*decay;
}
export function movementWeight(yaw:number,crouch=0):MovementWeight {
 return {speedForward:0,speedSide:0,yaw,forward:{value:0,velocity:0},side:{value:0,velocity:0},turn:{value:0,velocity:0},crouch:{value:crouch,velocity:0}};
}
export function advanceMovementWeight(state:MovementWeight,forward:number,side:number,yaw:number,crouch:number,dt:number,reset=false){
 dt=clamp(dt,0,.1);if(!dt)return;
 if(reset){state.speedForward=state.speedSide=0;state.yaw=yaw;for(const s of [state.forward,state.side,state.turn])s.value=s.velocity=0;}
 const accelerationF=clamp((forward-state.speedForward)*8,-12,12),accelerationS=clamp((side-state.speedSide)*8,-12,12);
 const delta=Math.atan2(Math.sin(yaw-state.yaw),Math.cos(yaw-state.yaw));state.yaw=yaw;
 const blend=1-Math.exp(-8*dt);state.speedForward+=(forward-state.speedForward)*blend;state.speedSide+=(side-state.speedSide)*blend;
 spring(state.forward,reset?0:accelerationF*.35,14,dt);spring(state.side,reset?0:accelerationS*.3,14,dt);
 spring(state.turn,reset?0:clamp(-delta/dt*2.2,-9,9),16,dt);spring(state.crouch,crouch,16,dt);
 if(Math.abs(state.crouch.value-crouch)<.0005&&Math.abs(state.crouch.velocity)<.005){state.crouch.value=crouch;state.crouch.velocity=0;}
}
