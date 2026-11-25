import { it, expect } from "vitest";
import { Entity } from "playcanvas";
import { Renderer, standInKit } from "./rendering";
import { Game, TestCollision, type Soldier } from "./simulation";
import { trenchMap } from "./trench-map";
import { verdunMap } from "./verdun-map";
import { fortVauxMap } from "./fort-vaux-map";
import { headlandMap } from "./headland-map";
import { zeppelinMap } from "./zeppelin-map";

// The briefing's shader warm-up deploys a stand-in match (src/main.ts), and
// Begin keeps each of its soldiers whose kit the real match deploys again.
it("deploys the same soldier kits in the warm-up stand-in as in the match", () => {
  for (const map of [trenchMap, verdunMap, fortVauxMap, headlandMap, zeppelinMap]) {
    const standIn = new Game(new TestCollision(map), true, 30, 12345, undefined, { map, humanPlayerIds: [0], ambientArtillery: false });
    standIn.selectLoadout(standIn.players[0], "rifleman");
    for (const [settings, humans] of [[{ difficulty: "veteran" }, [0]], [{ difficulty: "regular" }, []]] as const) {
      const match = new Game(new TestCollision(map), true, 14400, 12345, settings, { map, humanPlayerIds: [...humans] });
      match.selectLoadout(match.players[0], "rifleman");
      expect(match.players.map(standInKit), map.id).toEqual(standIn.players.map(standInKit));
    }
  }
});

type Harness = {
  app: { root: Entity };
  camera: Entity;
  map: typeof trenchMap;
  people: Entity[];
  soldiers: { magazine: Entity; gasMask?: Entity; [key: string]: unknown }[];
  cube: Renderer["cube"];
  ray(): number;
  createSoldier(p: Soldier): void;
  reuseSoldier(p: Soldier, root: Entity, rig: Harness["soldiers"][number]): void;
  animateSoldier(p: Soldier, x: number, z: number, dt: number, tick: number): void;
};
function harness() {
  const r = Object.create(Renderer.prototype) as Harness;
  r.app = { root: new Entity("test world") };
  Object.assign(r.app.root, { _enabledInHierarchy: true });
  r.camera = new Entity("test camera");
  r.app.root.addChild(r.camera);
  r.map = trenchMap;
  r.ray = () => 1;
  r.people = [];
  r.soldiers = [];
  r.cube = (name, x, y, z, w, h, d, _color, _solid, parent, rotation = 0) => {
    const e = new Entity(name);
    (parent ?? r.app.root).addChild(e);
    e.setLocalPosition(x, y, z);
    e.setLocalScale(w, h, d);
    e.setLocalEulerAngles(0, 0, rotation);
    return e;
  };
  return r;
}
const pose = (root: Entity) => root.find(() => true).map((e) => [...e.getWorldTransform().data].map((v) => +v.toFixed(5)));

it("poses a reused warm-up soldier exactly like a freshly built one", () => {
  const g = new Game(new TestCollision(trenchMap), false), p = g.players[0];
  Object.assign(p, { vx: 3, vz: 0 });
  // The warm-up soldier: built, run about, masked and posed before Begin.
  const warm = harness();
  warm.createSoldier(p);
  for (let tick = 1; tick < 40; tick++) warm.animateSoldier(p, p.x + tick * 0.1, p.z, 1 / 30, tick);
  warm.soldiers[0].gasMask?.setLocalScale(1, 1, 1);
  warm.soldiers[0].magazine.setLocalScale(0, 0, 0);
  const [root] = warm.people, [rig] = warm.soldiers;
  warm.people = [];
  warm.soldiers = [];
  warm.reuseSoldier(p, root, rig);
  expect(warm.people[0]).toBe(root);
  expect(warm.soldiers[0]).not.toBe(rig);

  const fresh = harness();
  fresh.createSoldier(p);
  const { bounds: _a, ...reused } = warm.soldiers[0], { bounds: _b, ...built } = fresh.soldiers[0];
  expect(Object.keys(reused).sort()).toEqual(Object.keys(built).sort());
  for (const key of ["maskShown", "forward", "sideways", "deathAt", "remnantCreated", "x", "z", "phase", "motion", "sprint", "crouch", "alive"])
    expect(reused[key], key).toEqual(built[key]);
  Object.assign(p, { vx: 0, vz: 0 });
  for (let tick = 40; tick < 46; tick++) {
    warm.animateSoldier(p, p.x, p.z, 1 / 30, tick);
    fresh.animateSoldier(p, p.x, p.z, 1 / 30, tick);
  }
  expect(pose(root)).toEqual(pose(fresh.people[0]));
});
