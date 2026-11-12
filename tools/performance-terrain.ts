// Real terrain positions/colors/normals and Ammo replacement, without a browser/GPU.
import {createHash} from 'node:crypto';
import {calculateNormals,Entity} from 'playcanvas';
import {Game,TestCollision} from '../src/simulation';
import {trenchMap} from '../src/trench-map';
import {groundHeight} from '../src/map';
import {artilleryExplosionProfile} from '../src/destruction';
import {terrainGeometry} from '../src/terrain-geometry';
import {terrainNormals,invalidateTerrainNormals} from '../src/terrain-shading';
import {TerrainPhysics} from '../src/physics';
const g=new Game(new TestCollision(trenchMap),false,10000,12345,undefined,{map:trenchMap,ambientArtillery:false});
const physics=new TerrainPhysics(),root=new Entity(),hash=createHash('sha256');let geometryMs=0,normalMs=0,physicsMs=0,patches=0;
for(let i=0;i<12;i++){
 const x=-24+(i%4)*2,z=-35+Math.floor(i/4)*3;
 g.explode({x,z,y:groundHeight(x,z,g.map)+.02},-1,null,{...artilleryExplosionProfile,damage:0});
 const changes=g.events.filter(e=>e.type==='destruction');
 for(const e of changes){if(e.type!=='destruction')continue;invalidateTerrainNormals(g.map,e.change);for(const key of e.change.patches){
  let start=performance.now();const data=terrainGeometry(g.map,key);geometryMs+=performance.now()-start;
  start=performance.now();const normals=terrainNormals(g.map,data,calculateNormals(data.positions,data.indices));normalMs+=performance.now()-start;
  start=performance.now();physics.setPatch(key,data,root);physicsMs+=performance.now()-start;
  hash.update(JSON.stringify({key,data,normals}));patches++;
 }}
 g.events=[];
}
physics.destroy();root.destroy();console.log(JSON.stringify({patches,geometryMs,normalMs,physicsMs,geometryAndLighting:hash.digest('hex')},null,2));
