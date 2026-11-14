import {test,expect} from 'vitest';
import * as pc from 'playcanvas';
import {footCycle,footSupport,updateFootContact} from './foot-placement';
import {modelScene} from '../tools/model-scene';
import {industrialMap,groundHeight,type MapDefinition} from './map';
import {idle} from './simulation';
const flat:MapDefinition={...industrialMap,boxes:[],width:40,depth:40};
const slope:MapDefinition={...flat,terrain:{bankHeight:0,cellSize:1,columns:40,rows:40,heights:new Float32Array(1600),rectangles:[],ramps:[],lining:[],craters:[],elevation:{originX:-20,originZ:-20,spacing:1,columns:41,rows:41,values:Float32Array.from({length:41*41},(_,i)=>(i%41-20)*.12+Math.floor(i/41)*.03)}}};

test('five-point sole supports fit flat terrain and bounded slopes, rejecting the side of deep trenches',()=>{
 expect(footSupport(flat,0,0,0,0)).toEqual({height:.1125,pitch:-0,roll:0});
 const y=groundHeight(0,0,slope),s=footSupport(slope,0,0,0,y)!;
 expect(s).toBeTruthy();expect(s.roll).toBeGreaterThan(.1);expect(Math.abs(s.pitch)).toBeLessThan(.1);
 expect(footSupport(slope,0,0,0,y+2)).toBeNull();
 for(const phase of [0,1,2,3,4,5]){
  const gait=footCycle(phase,1,0,0);expect(gait.lift).toBeGreaterThanOrEqual(0);expect(gait.lift).toBeLessThan(.1);
 }
});

test('stance anchors stay fixed in world space while the body travels, then release for swing or changed earth',()=>{
 const input={x:0,z:0,rootY:0,yaw:0,phase:.1,motion:1,sprint:0,crouch:0,forward:1,sideways:0,side:-1,revision:0};
 const a=updateFootContact(undefined,input,flat)!;const x=a.contact.x,z=a.contact.z;
 const b=updateFootContact(a.contact,{...input,z:-.12,phase:.9},flat)!;
 expect(b.contact.x).toBe(x);expect(b.contact.z).toBe(z);
 const c=updateFootContact(b.contact,{...input,z:-.12,phase:4.5},flat)!;
 expect(c.contact.stance).toBe(false);expect(c.contact.y).toBeGreaterThan(.1125);
 const d=updateFootContact(c.contact,{...input,z:-.12,phase:.2,revision:1},flat)!;
 expect(d.contact.revision).toBe(1);expect(d.contact.z).not.toBe(z);
});

test.each(['french','german'] as const)('%s actual legs plant on flat/sloped terrain through crouching without changing simulation or bone lengths',faction=>{
 const {r,p,destroy}=modelScene(faction);
 try{
  for(const map of [flat,slope]){
   r.map=map;Object.assign(p,{x:0,z:0,y:groundHeight(0,0,map),crouched:false});r.people[0].setPosition(p.x,p.y,p.z);
   r.soldiers[0].feet=undefined;
   for(const crouched of [false,true,false]){
    p.crouched=crouched;p.command={...idle(),crouch:crouched};const before=structuredClone(p);
    for(let i=0;i<60;i++)r.animateSoldier(p,0,0,1/60,100+i/2);
    const rig=r.soldiers[0];expect(rig.feetActive).toBe(true);
    for(const leg of rig.legs){
     const ankle=leg.ankle.getPosition(),support=groundHeight(ankle.x,ankle.z,map);
     expect(ankle.y-support).toBeGreaterThan(.105);expect(ankle.y-support).toBeLessThan(.16);
     expect(leg.hip.getPosition().distance(leg.knee.getPosition())).toBeCloseTo(.42,5);
     expect(leg.knee.getPosition().distance(ankle)).toBeCloseTo(.4,5);
     expect([...leg.ankle.getWorldTransform().data].every(Number.isFinite)).toBe(true);
    }
    expect(p).toEqual(before);
   }
  }
 }finally{destroy();}
});

test('terrain IK releases airborne/teleport contacts and is skipped for distant bots',()=>{
 const {r,p,destroy}=modelScene();
 try{
  r.map=flat;r.people[0].setPosition(0,0,0);r.animateSoldier(p,0,0,1/60,100);expect(r.soldiers[0].feetActive).toBe(true);
  p.fall={startTick:100,velocity:-2};r.animateSoldier(p,0,0,1/60,101);expect(r.soldiers[0].feet).toBeUndefined();p.fall=null;
  r.people[0].setPosition(3,0,0);r.animateSoldier(p,3,0,1/60,102);expect(r.soldiers[0].feet).toBeUndefined();
  p.id=1;r.people[1]=r.people[0];r.soldiers[1]=r.soldiers[0];r.camera.setPosition(0,1,100);
  r.animateSoldier(p,3,0,1/60,103);expect(r.soldiers[1].feetActive).toBe(false);
 }finally{destroy();}
});

test('actual stance boots stay anchored across repeated forward, backward and side steps',()=>{
 const {r,p,destroy}=modelScene();
 try{
  r.map=flat;const rig=r.soldiers[0];
  for(const [dx,dz] of [[0,-.075],[0,.075],[.075,0]]){
   rig.feet=undefined;rig.motion=0;rig.x=rig.z=0;rig.phase=0;r.people[0].setPosition(0,0,0);
   let held=0;const previous:any[]=[];
   for(let i=0;i<100;i++){
    r.people[0].setPosition(dx*i,0,dz*i);r.animateSoldier(p,dx*i,dz*i,1/60,100+i/2);
    for(let j=0;j<2;j++){
     const contact=rig.feet[j],ankle=rig.legs[j].ankle.getPosition().clone(),old=previous[j];
     if(i>20&&contact?.stance&&old?.stance&&Math.hypot(contact.x-old.x,contact.z-old.z)<.001){
      expect(Math.hypot(ankle.x-old.ankle.x,ankle.z-old.ankle.z)).toBeLessThan(.035);held++;
     }
     previous[j]=contact?{...contact,ankle}:undefined;
    }
   }
   expect(held).toBeGreaterThan(10);
  }
 }finally{destroy();}
});
