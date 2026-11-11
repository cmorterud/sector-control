import {test,expect} from "vitest";
import {verdunMap} from "./verdun-map";
import {Game,TestCollision,pathfind} from "./simulation";
import {groundHeight, walkSegment, blocked} from "./map";
test("Verdun initializes French and German rosters with four reachable open objectives",()=>{
 const g=new Game(new TestCollision(verdunMap),true,100,41,undefined,{map:verdunMap,ambientArtillery:false});
 expect(g.players).toHaveLength(100); expect(g.players[0].faction).toBe("french"); expect(g.players[50].faction).toBe("german");
 expect(g.sectors).toHaveLength(4);
 for(const flag of g.sectors) {
  expect(blocked(flag.x,flag.z,.4,g.map)).toBe(false);
  const side=flag.home==="blue"?-1:1;
  expect(pathfind({x:side*67,z:0},flag,g.map).length, flag.id).toBeGreaterThan(0);
 }
});
test("rear ramps are walkable and trench floors protect below the banks",()=>{
 const t=verdunMap.terrain!;
 expect(t.shelterBays).toHaveLength(6); expect(t.communicationRoutes!.length).toBeGreaterThan(6);
 for(const team of ["blue","red"] as const){
  const side=team==="blue"?-1:1;
  expect(groundHeight(side*51,0,verdunMap)).toBeLessThan(.1);
  expect(groundHeight(side*48,15,verdunMap)).toBeGreaterThan(2);
  expect(walkSegment({x:side*60,z:0},{x:side*51,z:0},verdunMap)).toBe(true);
 }
});
