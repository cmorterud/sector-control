// Actual renderer/component/mesh inspection with a null graphics device.
// This does not submit a frame or measure browser/GPU performance.
import * as pc from 'playcanvas';
import {Renderer} from '../src/rendering';
import {Game,TestCollision} from '../src/simulation';
import {verdunMap} from '../src/verdun-map';
export function modelScene(faction:'french'|'german'='french') {
  const device=new pc.NullGraphicsDevice();
  const app=new pc.AppBase({id:`model-review-${faction}`} as HTMLCanvasElement);
  const options=new pc.AppOptions();options.graphicsDevice=device;options.componentSystems=[pc.RenderComponentSystem];options.devtools=false;
  app.init(options);
  const g=new Game(new TestCollision(verdunMap),false,1000,42,undefined,{map:verdunMap,ambientArtillery:false});
  const p=g.players[0];Object.assign(p,{faction,team:faction==='french'?'blue':'red',weapon:'serviceRifle',weaponId:faction==='french'?'Berthier Mle 1916':'Gewehr 98',x:0,y:0,z:0,yaw:0,landedAt:-1000});
  const r:any=Object.assign(Object.create(Renderer.prototype),{app,map:g.map,people:[],soldiers:[],materials:new Map(),textures:new Map(),kitMeshes:new Map(),casualtyTemplates:new Map(),actorKits:new Map(),actorBatch:-1,batchGroup:-1,activeGame:g});
  r.camera=new pc.Entity('review camera',app);app.root.addChild(r.camera);r.camera.setPosition(0,1.6,0);r.ray=()=>1;
  r.createSoldier(p);
  const destroy=()=>{
    app.root.destroy();
    for(const mesh of [...r.kitMeshes.values(),...r.casualtyTemplates.values()])mesh.destroy();
    for(const material of r.materials.values())material.destroy();for(const texture of r.textures.values())texture.destroy();
    app.destroy();
  };
  return {r,g,p,destroy};
}
