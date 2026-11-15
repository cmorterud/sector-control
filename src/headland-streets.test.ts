import {expect,it} from "vitest";
import {headlandMap} from "./headland-map";
import {farmPropParts} from "./farm-props";
import {Game,TestCollision,idle,pathfind} from "./simulation";
import {groundHeight} from "./map";
import {grenadeExplosionProfile} from "./destruction";

const props=headlandMap.boxes.filter(b=>b.id?.startsWith("headland-street-"));
it("dresses gardens with low destructible furniture without filling the roads or capture pockets",()=>{
  expect(props.length).toBeGreaterThanOrEqual(15);expect(props.length).toBeLessThanOrEqual(52);
  expect(new Set(props.map(p=>p.farmProp))).toEqual(new Set(["fence","planter","bench"]));
  for(const b of props) {
    expect(b.kind).toBe("wood");expect(b.h).toBeLessThan(1);
    expect(headlandMap.sectors.every(s=>Math.hypot(b.x-s.x,b.z-s.z)>6)).toBe(true);
    expect(headlandMap.buildings!.every(a=>Math.abs(a.x-b.x)>(a.w+b.w)/2+2||Math.abs(a.z-b.z)>(a.d+b.d)/2+2)).toBe(true);
    for(const street of headlandMap.streets!)for(let i=1;i<street.points.length;i++) {
      const a=street.points[i-1],c=street.points[i],dx=c.x-a.x,dz=c.z-a.z;
      const t=Math.max(0,Math.min(1,((b.x-a.x)*dx+(b.z-a.z)*dz)/(dx*dx+dz*dz)));
      expect(Math.hypot(b.x-a.x-dx*t,b.z-a.z-dz*t)).toBeGreaterThan(street.width/2+Math.hypot(b.w,b.d)/2);
    }
    const detail=farmPropParts(b,b.h);
    expect(detail.length).toBeGreaterThan(5);expect(detail.length).toBeLessThan(20);
    expect(detail.every(p=>[...p.at,...p.size].every(Number.isFinite)&&p.size.every(n=>n>0))).toBe(true);
  }
  const fountain=headlandMap.boxes.find(b=>b.farmProp==="fountain")!;
  expect(farmPropParts(fountain,fountain.h).some(p=>p.name==="still fountain water")).toBe(true);
});

it("removes garden props and their collision under a direct blast",()=>{
  for(const style of ["bench","planter","fence"] as const) {
    const b=props.find(p=>p.farmProp===style)!,g=new Game(new TestCollision(headlandMap),false,6000,1,undefined,{map:headlandMap,ambientArtillery:false});
    g.explode({x:b.x+b.w/2+.1,y:(b.baseY??0)+b.h*.5,z:b.z},-1,null,{...grenadeExplosionProfile,damage:0,craterRadius:0,terrainReach:0});
    expect(g.map.destruction!.objects[b.id!].stage).toBe(2);
    expect(g.map.boxes.some(p=>p.id===b.id)).toBe(false);
  }
});

it("lets real soldiers reach B from both spawns with nearly equal sprint times after street dressing",()=>{
  const times:number[]=[];
  for(const team of ["blue","red"] as const) {
    const g=new Game(new TestCollision(headlandMap),false,6000,1,undefined,{map:headlandMap,ambientArtillery:false});
    const p=g.players[0],start=headlandMap.spawn[team],flag=g.sectors[1];
    Object.assign(p,{...start,y:groundHeight(start.x,start.z,g.map),protectedUntil:Infinity});
    const path=pathfind(p,flag,g.map);let i=0;
    expect(path.length).toBeGreaterThan(0);
    for(let tick=0;tick<1500&&i<path.length;tick++) {
      const next=path[i],dx=next.x-p.x,dz=next.z-p.z,d=Math.hypot(dx,dz);
      if(d<.45&&Math.abs(p.y-(next.y??groundHeight(next.x,next.z,g.map)))<.24){i++;continue;}
      g.step({...idle(),x:dx/Math.max(1,d),z:dz/Math.max(1,d),sprint:true});
    }
    expect(i,team).toBe(path.length);expect(Math.hypot(p.x-flag.x,p.z-flag.z)).toBeLessThan(.6);
    times.push(g.tick/30);
  }
  expect(Math.abs(times[0]-times[1])).toBeLessThan(1.5);
  expect(Math.max(...times)).toBeLessThan(22);
});
