import {expect, test, vi} from "vitest";
import * as pc from "playcanvas";
import {Renderer} from "./rendering";
import {VisualWorkQueue} from "./visual-work";

test("queued casualties retain blast impulse, deduplicate and cannot hide respawned or replaced actors", () => {
  const players = [0,1].map(id=>({id,hp:0,x:0,y:0,z:0}));
  const actors = players.map(()=>new pc.Entity());
  const rigs = players.map(()=>({remnantCreated:false}));
  const blast=vi.fn(), retain=vi.fn((_p:unknown,_impulse?:pc.Vec3)=>({ragdoll:{blast}}));
  const r=Object.assign(Object.create(Renderer.prototype),{
    activeGame:{players}, people:actors, soldiers:rigs, camera:new pc.Entity(),
    visualWork:new VisualWorkQueue(), pendingCasualties:new Map(),
    deathHits:new Map([[0,new pc.Vec3(7,0,0)]]),casualties:[],
    retainCasualty:retain, ray:()=>1,
  });
  r.queueCasualty(players[0]);r.queueCasualty(players[0]);r.queueCasualty(players[1]);
  expect(r.visualWork.size).toBe(2);
  r.blastCasualties({type:"artilleryImpact",at:{x:0,y:0,z:0},radius:5});
  r.visualWork.flush(4,2);
  expect(retain).toHaveBeenCalledTimes(1);
  expect(retain.mock.calls[0][1]!.equals(new pc.Vec3(7,0,0))).toBe(true);
  expect(blast).toHaveBeenCalledWith(new pc.Vec3(0,0,0),6.25,140);
  expect(actors[0].getLocalScale().equals(pc.Vec3.ZERO)).toBe(true);
  players[1].hp=100;
  r.visualWork.flush();
  expect(retain).toHaveBeenCalledTimes(1);
  expect(actors[1].getLocalScale().equals(pc.Vec3.ONE)).toBe(true);
  expect(r.pendingCasualties.size).toBe(0);
  players[1].hp=0;rigs[1].remnantCreated=false;
  r.queueCasualty(players[1]);r.soldiers[1]={remnantCreated:false};
  r.visualWork.flush();expect(retain).toHaveBeenCalledTimes(1);
  actors.forEach(a=>a.destroy());r.camera.destroy();
});
