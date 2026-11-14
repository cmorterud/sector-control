import {test,expect} from 'vitest';
import {movementWeight,advanceMovementWeight,spring} from './movement-weight';
import {modelScene} from '../tools/model-scene';
import {industrialMap} from './map';
import {idle} from './simulation';

test('critically damped stance has a gentle start, no overshoot and frame-rate-independent settling',()=>{
 const ends:number[]=[];
 for(const fps of [30,60,120]){
  const s={value:0,velocity:0};let previous=0;
  for(let i=0;i<fps;i++){spring(s,1,16,1/fps);expect(s.value).toBeGreaterThanOrEqual(previous);expect(s.value).toBeLessThanOrEqual(1);previous=s.value;}
  ends.push(s.value);expect(s.value).toBeGreaterThan(.9999);
 }
 expect(Math.max(...ends)-Math.min(...ends)).toBeLessThan(1e-8);
 const s={value:0,velocity:0};spring(s,1,16,1/60);expect(s.value).toBeLessThan(.04);
});

test('acceleration/braking and wrapped turns carry bounded weight and settle at rest',()=>{
 const state=movementWeight(Math.PI-.01);let start=0,stop=0;
 for(let i=0;i<60;i++){advanceMovementWeight(state,4.5,0,-Math.PI+.01,0,1/60);start=Math.max(start,state.forward.value);}
 expect(start).toBeGreaterThan(.5);expect(Math.abs(state.turn.value)).toBeLessThan(.01);
 for(let i=0;i<90;i++){advanceMovementWeight(state,0,0,-Math.PI+.01,0,1/60);stop=Math.min(stop,state.forward.value);}
 expect(stop).toBeLessThan(-.5);expect(Math.abs(state.forward.value)).toBeLessThan(.01);
 advanceMovementWeight(state,7,7,0,0,1/60,true);expect(state.forward.value).toBe(0);expect(state.turn.value).toBe(0);
});

test('actual crouch/stand and turn transitions retain grounded feet and leave the player state untouched',()=>{
 const {r,p,destroy}=modelScene();
 try{
  r.map={...industrialMap,boxes:[]};r.people[0].setPosition(0,0,0);const rig=r.soldiers[0];
  p.command=idle();r.animateSoldier(p,0,0,1/60,100);
  for(const crouched of [true,false]){
   p.crouched=crouched;p.command={...idle(),crouch:crouched};const before=structuredClone(p),heights:number[]=[];
   for(let i=0;i<90;i++){
    r.animateSoldier(p,0,0,1/60,101+i/2);heights.push(rig.body.getLocalPosition().y);
    for(const leg of rig.legs)expect(leg.ankle.getPosition().y).toBeGreaterThan(.105);
   }
   expect(Math.abs(heights[1]-heights[0])).toBeLessThan(.04);expect(p).toEqual(before);
   expect(rig.crouch).toBe(crouched?1:0);
  }
 }finally{destroy();}
});
