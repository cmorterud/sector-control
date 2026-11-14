import {characterGeometry} from './character-geometry';
import {modelUV} from './model-surfaces';
// A fixed grip pose with separate thumb and four curled fingers, merged into one
// shared mesh. Wrist anchors remain owned by the existing two-bone arm solver.
export function gripHandGeometry(side:'left'|'right',detail:'world'|'view'|'far'='world') {
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
    const z=(n-1.5)*.019;
    finger([[-.037,-.035,z],[-.008,-.055,z],[.026,-.049,z],[.046,-.025,z],[.04,.001,z]],.0095-(n===3?.001:0));
  }
  finger([[-.045,.014,.035],[-.031,.035,.025],[.003,.042,.015],[.021,.028,.005]],.012);
  return result;
}
