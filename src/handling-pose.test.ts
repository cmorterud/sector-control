import {test,expect} from 'vitest';
import * as pc from 'playcanvas';
import {handlingPath,handlingWrist} from './handling-pose';
import {modelScene} from '../tools/model-scene';
import {idle} from './simulation';
import {weaponProfiles,armLengths} from './weapons';

test('reload arcs pass through interaction anchors with bounded curves and deliberate contact pauses',()=>{
 const keys=[{t:0,p:{x:0,y:0,z:0}},{t:.3,p:{x:.2,y:-.2,z:0}},{t:.6,p:{x:0,y:.2,z:-.3},contact:true},{t:1,p:{x:0,y:0,z:0}}];
 for(const k of keys)expect(handlingPath(keys,k.t)).toEqual(k.p);
 for(let t=0;t<=1;t+=.01){const p=handlingPath(keys,t);expect(Object.values(p).every(Number.isFinite)).toBe(true);expect(Math.abs(p.x)).toBeLessThan(.23);}
 const near=handlingPath(keys,.5999),at=handlingPath(keys,.6);expect(Math.hypot(near.x-at.x,near.y-at.y,near.z-at.z)).toBeLessThan(1e-6);
});

test.each(['french','german'] as const)('%s carries reload ammo in its palm and follows the moving bolt without losing either wrist target',faction=>{
 const {r,p,destroy}=modelScene(faction);
 try{
  const rig=r.soldiers[0],hand=rig.arms[1].elbow.findByName('hand');
  expect(rig.reloadMagazine.parent).toBe(hand);expect(rig.reloadMagazine.getLocalPosition().length()).toBeLessThan(.03);
  r.createFirstPersonRig();const view=r.firstPersonRig;
  p.command={...idle(),firstPerson:true};p.reloadAt=100+weaponProfiles.serviceRifle.reloadTicks;
  for(const progress of [.14,.32,.48,.6,.84,.97]){
   const tick=100+progress*weaponProfiles.serviceRifle.reloadTicks;r.animateSoldier(p,0,0,1/60,tick);r.drawFirstPerson(p,tick,1/60);
   const wrist=view.arms[1].elbow.getWorldTransform().transformPoint(new pc.Vec3(0,-armLengths.forearm,0));
   expect(view.reloadMagazine.getPosition().distance(wrist)).toBeLessThan(.035);
   expect(view.supportHand.getPosition().distance(view.arms[0].elbow.getWorldTransform().transformPoint(new pc.Vec3(0,-armLengths.forearm,0)))).toBeLessThan(.001);
  }
  p.reloadAt=0;p.lastShotAt=200;
  for(const age of [5,7,9,11,13]){
   r.animateSoldier(p,0,0,1/60,200+age);r.drawFirstPerson(p,200+age,1/60);
   const pose=handlingWrist(p,200+age),expected=new pc.Quat().slerp(view.rifle.getRotation(),view.bolt.getRotation(),pose.bolt);
   expect(Math.abs((view.arms[1].elbow.findByName('hand') as pc.Entity).getRotation().dot(expected))).toBeCloseTo(1,5);
  }
 }finally{destroy();}
});
