import type { Box } from "./map";
type Point={x:number;y:number;z:number};
function local(p:Point,b:Box) {
  const angle=b.architecture?.roofPitch??0,c=Math.cos(angle),s=Math.sin(angle);
  const x=p.x-b.x,y=p.y-((b.baseY??0)+b.h/2);
  return {x:x*c+y*s,y:-x*s+y*c,z:p.z-b.z};
}
export function nearestBoxPoint(p:Point,b:Box):Point {
  const q=local(p,b),angle=b.architecture?.roofPitch??0,c=Math.cos(angle),s=Math.sin(angle);
  const x=Math.max(-b.w/2,Math.min(b.w/2,q.x)),y=Math.max(-b.h/2,Math.min(b.h/2,q.y));
  return {x:b.x+x*c-y*s,y:(b.baseY??0)+b.h/2+x*s+y*c,z:b.z+Math.max(-b.d/2,Math.min(b.d/2,q.z))};
}
export function pitchedBoxRay(a:Point,b:Point,box:Box) {
  const from=local(a,box),to=local(b,box),half={x:box.w/2,y:box.h/2,z:box.d/2};
  let enter=0,exit=1;
  for(const axis of ["x","y","z"] as const) {
    const delta=to[axis]-from[axis];
    if(Math.abs(delta)<1e-10){if(Math.abs(from[axis])>half[axis])return 1;continue;}
    const t1=(-half[axis]-from[axis])/delta,t2=(half[axis]-from[axis])/delta;
    enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));
  }
  return enter<=exit?enter:1;
}
