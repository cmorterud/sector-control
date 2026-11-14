// CPU-only rig/buffer audit; does not submit frames or measure GPU performance.
import {modelScene} from './model-scene';
import {idle} from '../src/simulation';
const {r,p,destroy}=modelScene('french');
try{
 const start=performance.now(),players=[p];
 for(let i=1;i<100;i++){
  const q=structuredClone(p),french=i<50;
  Object.assign(q,{id:i,team:french?'blue':'red',faction:french?'french':'german',weaponId:french?'Berthier Mle 1916':'Gewehr 98',x:(i%10)*4,z:Math.floor(i/10)*4});
  q.command=idle();players.push(q);r.createSoldier(q);
 }
 const constructionMs=performance.now()-start,meshCount=r.kitMeshes.size,materialCount=r.materials.size,textureCount=r.textures.size;
 const triangles=(actor:number)=>r.people[actor].findComponents('render').reduce((n:number,c:any)=>n+c.meshInstances.reduce((v:number,m:any)=>{const indices:number[]=[];m.mesh.getIndices(indices);return v+indices.length/3;},0),0);
 const nearTriangles=triangles(1);r.camera.setPosition(0,1.6,100);r.applyModelDetail(players[1],r.soldiers[1]);const farTriangles=triangles(1);
 const poseStart=performance.now();for(let tick=100;tick<400;tick++)for(const q of players){r.animateSoldier(q,q.x,q.z-tick*.01,1/60,tick);r.applyModelDetail(q,r.soldiers[q.id]);}
 const poseMs=performance.now()-poseStart;
 console.log(JSON.stringify({actors:players.length,constructionMs,meshCount,materialCount,textureCount,nearTriangles,farTriangles,poseFrames:300,poseMs,cpuMsPer100ActorPose:poseMs/300,meshesAfterPose:r.kitMeshes.size,finite:r.people.every((e:any)=>[...e.getWorldTransform().data].every(Number.isFinite))},null,2));
}finally{destroy();}
