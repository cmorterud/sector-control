import {test,expect} from 'vitest';
import * as pc from 'playcanvas';
import {modelScene} from '../tools/model-scene';
import {gripHandGeometry} from './hand-geometry';
import {characterGeometry,type CharacterShape} from './character-geometry';
import {modelSurfaceAtlas,modelSurfaces,modelUV} from './model-surfaces';
import {rifleGeometry,rifleSurfaceMaps} from './rifle-geometry';
import {idle} from './simulation';
import {armLengths,weaponProfiles} from './weapons';

test('sculpted uniforms, boots, faces, helmets and mirrored hands have finite UVs, unit normals and bounded meshes',()=>{
 for(const shape of ['coat','coatHem','sleeve','trouser','boot','face','adrian','stahlhelm','pouch'] as CharacterShape[]){
  const mesh=characterGeometry(shape,16);expect(mesh.positions.every(Number.isFinite)).toBe(true);
  expect(mesh.uvs.length).toBe(mesh.positions.length/3*2);expect(mesh.indices.length/3).toBeLessThan(400);
  for(let i=0;i<mesh.normals.length;i+=3)expect(Math.hypot(...mesh.normals.slice(i,i+3))).toBeCloseTo(1);
 }
 for(const side of ['left','right'] as const){
  const mesh=gripHandGeometry(side,'view');expect(mesh.positions.every(Number.isFinite)).toBe(true);
  expect(mesh.indices.every(i=>i>=0&&i<mesh.positions.length/3)).toBe(true);expect(mesh.uvs.length).toBe(mesh.positions.length/3*2);
  expect(mesh.indices.length/3).toBeGreaterThan(gripHandGeometry(side,'far').indices.length/3*2);
  for(let i=0;i<mesh.normals.length;i+=3)expect(Math.hypot(...mesh.normals.slice(i,i+3))).toBeCloseTo(1);
 }
 expect(characterGeometry('adrian').positions).not.toEqual(characterGeometry('stahlhelm').positions);
 expect(rifleGeometry('berthierStock').positions).not.toEqual(rifleGeometry('gewehrStock').positions);
});

test.each(['french','german'] as const)('%s coat stays joined at the waist without a second pair of dangling panels',faction=>{
 const {r,p,destroy}=modelScene(faction);
 try{
  const rig=r.soldiers[0],root=r.people[0],hem=root.findByName('coat hem') as pc.Entity;
  expect(root.findByName('coat skirt')).toBeNull();
  expect(root.find((e:pc.GraphNode)=>e.name==='coat hem')).toHaveLength(1);
  expect(root.find((e:pc.GraphNode)=>e.name==='boot')).toHaveLength(2);
  expect(hem.parent).toBe(rig.hips);expect(hem.getLocalScale().y).toBeLessThan(.2);
  const bounds=hem.render!.meshInstances[0].mesh!.aabb;
  expect(bounds.halfExtents.x*hem.getLocalScale().x*2).toBeGreaterThan(.48);
  for(const crouched of [false,true]){
   p.crouched=crouched;p.command={...idle(),sprint:!crouched};
   for(let i=0;i<30;i++){
    r.animateSoldier(p,0,-i*.08,1/60,100+i);
    const hipSpace=rig.hips.getWorldTransform().clone().invert();
    const waist=hipSpace.transformPoint(hem.getPosition());
    expect(waist.y-hem.getLocalScale().y/2).toBeGreaterThan(-.09);
    for(const leg of rig.legs)expect((leg.ankle.findByName('boot') as pc.Entity).parent).toBe(leg.ankle);
   }
  }
 }finally{destroy();}
});

test('material atlas isolates cloth, skin, leather and metal tiles; rifle reflectance follows grain',()=>{
 const atlas=modelSurfaceAtlas();expect(atlas).toEqual(modelSurfaceAtlas());
 for(const tile of modelSurfaces){const [u,v]=modelUV(.5,.5,tile);expect(u).toBeGreaterThan(0);expect(u).toBeLessThan(1);expect(v).toBeGreaterThan(0);expect(v).toBeLessThan(1);}
 expect(atlas.normal.length).toBe(atlas.diffuse.length);expect(atlas.gloss).not.toEqual(atlas.diffuse);
 expect(rifleSurfaceMaps('walnut').gloss).not.toEqual(rifleSurfaceMaps('steel').gloss);
});

test.each(['french','german'] as const)('%s actual rig retains material UVs through first person, distance changes and corpse preparation',faction=>{
 const {r,g,p,destroy}=modelScene(faction);
 try{
  const rig=r.soldiers[0],upper=rig.upper.render.meshInstances[0],near=upper.mesh;
  const colors:number[]=[],uv:number[]=[];near.getColors(colors);near.getUvs(0,uv);
  expect(new Set(colors).size).toBeGreaterThan(8);expect(uv.length).toBe(near.vertexBuffer.numVertices*2);
  expect(upper.material.normalMap).toBeTruthy();expect(upper.material.glossMap).toBeTruthy();
  expect(rig.upper.render.batchGroupId).toBe(-1);
  expect(rig.rifle.findByName('flush stock screw')).toBeNull();
  r.createFirstPersonRig();const view=r.firstPersonRig;
  expect(view.rifle.findByName('flush stock screw')).toBeTruthy();
  const worldStock=rig.rifle.findByName('wooden stock').render.meshInstances[0].mesh,viewStock=view.rifle.findByName('wooden stock').render.meshInstances[0].mesh;
  const count=(m:pc.Mesh)=>{const a:number[]=[];m.getIndices(a);return a.length/3;};
  expect(count(viewStock)).toBeGreaterThan(count(worldStock)*2);
  for(const loading of [false,true])for(const crouched of [false,true]){
   Object.assign(p,{crouched,reloadAt:loading?100+weaponProfiles.serviceRifle.reloadTicks:0});p.command={...idle(),firstPerson:true,aim:!loading};
   const before=structuredClone(p);
   for(const tick of [100,104,112,119]){
    r.animateSoldier(p,0,0,1/60,tick);r.drawFirstPerson(p,tick,1/60);
    const wrist=view.arms[0].elbow.getWorldTransform().transformPoint(new pc.Vec3(0,-armLengths.forearm,0));
    expect(wrist.distance(view.supportHand.getPosition())).toBeLessThan(.001);
    const hand=view.arms[1].elbow.findByName('hand');
    expect([...hand.getWorldTransform().data].every(Number.isFinite)).toBe(true);
    if(!loading)expect(Math.abs(hand.getRotation().dot(view.rifle.getRotation()))).toBeCloseTo(1);
   }
   expect(p).toEqual(before);
  }
  // Human remains detailed; a bot changes only shared presentation buffers.
  p.id=1;r.people[1]=r.people[0];r.camera.setPosition(0,1.6,70);r.applyModelDetail(p,rig);
  const far=upper.mesh;expect(count(far)).toBeLessThan(count(near)*.65);
  expect(upper.material.normalMap).toBeTruthy();r.camera.setPosition(0,1.6,36);r.applyModelDetail(p,rig);expect(upper.mesh).toBe(far);
  r.camera.setPosition(0,1.6,10);r.applyModelDetail(p,rig);expect(upper.mesh).toBe(near);p.id=0;
  const corpse=r.casualtyMesh(p),corpseUV:number[]=[],weights:number[]=[];
  corpse.getUvs(0,corpseUV);corpse.getVertexStream(pc.SEMANTIC_BLENDWEIGHT,weights);
  expect(corpseUV.every(Number.isFinite)).toBe(true);expect(corpseUV.length).toBe(corpse.vertexBuffer.numVertices*2);
  expect(corpse.skin.boneNames).toHaveLength(14);expect(weights.filter((_:number,i:number)=>i%4===0).every((v:number)=>v===1)).toBe(true);
  expect(g.players[0].hp).toBe(100);
 }finally{destroy();}
});
