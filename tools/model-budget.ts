// CPU-only rig/buffer audit; does not submit frames or measure GPU performance.
import {modelScene} from './model-scene';
import {idle} from '../src/simulation';
import {groundHeight} from '../src/map';
const {r,p,destroy}=modelScene('french');
try{
 p.y=groundHeight(0,0,r.map);r.people[0].setPosition(0,p.y,0);r.camera.setPosition(0,p.y+1.6,0);
 const start=performance.now(),players=[p];
 for(let i=1;i<100;i++){
  const q=structuredClone(p),french=i<50;
  Object.assign(q,{id:i,team:french?'blue':'red',faction:french?'french':'german',weaponId:french?'Berthier Mle 1916':'Gewehr 98',x:(i%10-5)*3,z:(Math.floor(i/10)-5)*3});
  q.y=groundHeight(q.x,q.z,r.map);q.command=idle();players.push(q);r.createSoldier(q);
 }
 const constructionMs=performance.now()-start,meshCount=r.kitMeshes.size,materialCount=r.materials.size,textureCount=r.textures.size;
 const triangles=(actor:number)=>r.people[actor].findComponents('render').reduce((n:number,c:any)=>n+c.meshInstances.reduce((v:number,m:any)=>{const indices:number[]=[];m.mesh.getIndices(indices);return v+indices.length/3;},0),0);
 const nearTriangles=triangles(1);r.camera.setPosition(0,1.6,100);r.applyModelDetail(players[1],r.soldiers[1]);const farTriangles=triangles(1);r.camera.setPosition(0,p.y+1.6,0);
 const poseStart=performance.now();for(let tick=100;tick<400;tick++)for(const q of players){const z=q.z-(tick-100)*.035;r.people[q.id].setPosition(q.x,groundHeight(q.x,z,r.map),z);r.animateSoldier(q,q.x,z,1/60,tick);r.applyModelDetail(q,r.soldiers[q.id]);}
 const poseMs=performance.now()-poseStart;
 console.log(JSON.stringify({actors:players.length,constructionMs,meshCount,materialCount,textureCount,nearTriangles,farTriangles,poseFrames:300,poseMs,activeFootRigs:r.soldiers.filter((s:any)=>s.feetActive).length,cpuMsPer100ActorPose:poseMs/300,meshesAfterPose:r.kitMeshes.size,finite:r.people.every((e:any)=>[...e.getWorldTransform().data].every(Number.isFinite))},null,2));
}finally{destroy();}
