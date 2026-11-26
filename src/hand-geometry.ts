import {characterGeometry} from './character-geometry';
import {modelUV} from './model-surfaces';
// How far each finger (index to little) and the thumb open from the full grip:
// 0 wraps the rifle's wrist, 1 lies straight. The first-person right hand
// swaps between these as it fires, works the bolt, feeds a clip or holds a grenade.
export const handPoses = {
  grip: { fingers: [0, 0, 0, 0], thumb: 0 },
  trigger: { fingers: [.55, 0, 0, 0], thumb: .1 },
  pinch: { fingers: [.4, .12, .05, 0], thumb: .55 },
  open: { fingers: [.8, .72, .66, .6], thumb: .6 },
  grenade: { fingers: [.28, .25, .22, .2], thumb: .3 },
} as const;
export type HandPose = keyof typeof handPoses;
// A point path bent `open` of the way toward the straight line its first
// segment points along, keeping each segment's length.
function opened(points:number[][],open:number){
  if(!open)return points;
  const d=points[1].map((v,i)=>v-points[0][i]),length=Math.hypot(...d);
  let along=0;
  return points.map((p,i)=>{
    if(i)along+=Math.hypot(...p.map((v,k)=>v-points[i-1][k]));
    return p.map((v,k)=>v+(points[0][k]+d[k]/length*along-v)*open);
  });
}
// A grip pose with separate thumb and four curled fingers, merged into one
// shared mesh. Wrist anchors remain owned by the existing two-bone arm solver.
export function gripHandGeometry(side:'left'|'right',detail:'world'|'view'|'far'='world',pose:HandPose='grip') {
  const shape=handPoses[pose];
  const result={positions:[] as number[],normals:[] as number[],indices:[] as number[],uvs:[] as number[]};
  const sign=side==='left'?1:-1,sides=detail==='view'?14:detail==='far'?5:8;
  const palm=characterGeometry('palm',sides);
  for(let i=0;i<palm.positions.length;i+=3){result.positions.push((palm.positions[i]*.075-.025)*sign,palm.positions[i+1]*.09-.012,palm.positions[i+2]*.075);result.normals.push(palm.normals[i]*sign,palm.normals[i+1],palm.normals[i+2]);}
  result.uvs.push(...palm.uvs.flatMap((_,i,a)=>i%2?[]:modelUV(a[i],a[i+1],'skin')));
  result.indices.push(...palm.indices.map((n,i,a)=>sign<0?i%3===1?a[i+1]:i%3===2?a[i-1]:n:n));
  function finger(points:number[][],radius:number){
    const base=result.positions.length/3;
    for(let ring=0;ring<points.length;ring++){
      const p=points[ring],before=points[Math.max(0,ring-1)],after=points[Math.min(points.length-1,ring+1)];
      const dx=after[0]-before[0],dy=after[1]-before[1],length=Math.hypot(dx,dy)||1;
      const r=radius*(ring===points.length-1?0:1);
      for(let j=0;j<=sides;j++){
        const angle=j/sides*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle);
        result.positions.push((p[0]-dy/length*c*r)*sign,p[1]+dx/length*c*r,p[2]+s*r);
        result.normals.push(-dy/length*c*sign,dx/length*c,s);result.uvs.push(...modelUV(j/sides,ring/(points.length-1),'skin'));
        if(ring&&j<sides){const a=base+(ring-1)*(sides+1)+j,b=a+sides+1;result.indices.push(...(sign>0?[a,b+1,b,a,a+1,b+1]:[a,b,b+1,a,b+1,a+1]));}
      }
    }
  }
  for(let n=0;n<4;n++){
    // n=3 lies beside the thumb: the index finger.
    const z=(n-1.5)*.019;
    finger(opened([[-.037,-.035,z],[-.008,-.055,z],[.026,-.049,z],[.046,-.025,z],[.04,.001,z]],shape.fingers[3-n]),.0095-(n===3?.001:0));
  }
  finger(opened([[-.045,.014,.035],[-.031,.035,.025],[.003,.042,.015],[.021,.028,.005]],shape.thumb),.012);
  return result;
}
