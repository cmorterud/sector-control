// A map illustration from the authored layout, not a captured gameplay frame.
import {writeFileSync} from 'node:fs';
import {villageMap as map} from '../src/village-map';
import {villageYards,yardPaths} from '../src/village-outdoors';
const w=960,h=540,s=2.95,ox=w/2,oz=h/2;
const x=(v:number)=>ox+v*s,z=(v:number)=>oz+v*s;
const shapes:string[]=[];
for(let i=0;i<150;i++) {
 const px=-88+((i*7919)%1760)/10,pz=-77+((i*3571)%1540)/10;
 shapes.push('<ellipse cx="'+x(px)+'" cy="'+z(pz)+'" rx="'+(2+i%4)+'" ry="'+(1+i%3)+'" fill="#6c7256" opacity=".15"/>');
}
for(const yard of villageYards) {
 const color=yard.surface==='paving'?'#b1a58b':yard.surface==='gravel'?'#9a9076':'#635e3f';
 shapes.push('<rect x="'+x(yard.x-yard.w/2)+'" y="'+z(yard.z-yard.d/2)+'" width="'+yard.w*s+'" height="'+yard.d*s+'" rx="2" fill="'+color+'"/>');
 if(yard.surface==='garden')for(let i=1;i<yard.w/2;i++)shapes.push('<path d="M'+x(yard.x-yard.w/2+i*2)+','+z(yard.z-yard.d/2+1)+'v'+((yard.d-2)*s)+'" stroke="#7b8050" stroke-width="2"/>');
}
for(const lane of yardPaths(map))shapes.push('<path d="M'+x(lane.a.x)+','+z(lane.a.z)+'L'+x(lane.b.x)+','+z(lane.b.z)+'" stroke="#b4a58a" stroke-width="'+(1.6*s)+'"/>');
for(const road of map.streets??[])shapes.push('<polyline points="'+road.points.map(p=>x(p.x)+','+z(p.z)).join(' ')+'" fill="none" stroke="#a69a80" stroke-width="'+road.width*s+'"/><polyline points="'+road.points.map(p=>x(p.x)+','+z(p.z)).join(' ')+'" fill="none" stroke="#bfb296" stroke-width="'+Math.max(1,road.width*s-3)+'"/>');
for(const line of map.terrain!.trenchLines!)for(const q of line.sections)
 shapes.push('<rect x="'+x(q.x-1)+'" y="'+z(q.z-q.length/2)+'" width="'+2*s+'" height="'+q.length*s+'" fill="#4a4439"/>');
for(const b of map.boxes.filter(b=>!b.architecture&&b.kind==='masonry'))shapes.push('<rect x="'+x(b.x-b.w/2)+'" y="'+z(b.z-b.d/2)+'" width="'+Math.max(1,b.w*s)+'" height="'+Math.max(1,b.d*s)+'" fill="#6e6657"/>');
for(const b of map.boxes.filter(b=>b.farmProp))shapes.push('<rect x="'+x(b.x-b.w/2)+'" y="'+z(b.z-b.d/2)+'" width="'+Math.max(2,b.w*s)+'" height="'+Math.max(2,b.d*s)+'" rx="1" fill="'+(b.kind==='wood'?'#66513b':'#90917f')+'" stroke="#c0ab7d" stroke-width=".6"/>');
for(const [i,b] of map.buildings!.entries()) {
 const px=x(b.x-b.w/2),py=z(b.z-b.d/2),bw=b.w*s,bh=b.d*s;
 shapes.push('<rect x="'+(px+4)+'" y="'+(py+6*b.stories)+'" width="'+bw+'" height="'+bh+'" fill="#302f27" opacity=".42"/>');
 shapes.push('<rect x="'+px+'" y="'+py+'" width="'+bw+'" height="'+bh+'" fill="'+(i%2?'#786d5b':'#81735e')+'" stroke="#d2bfa0" stroke-width="3"/>');
 shapes.push('<rect x="'+px+'" y="'+py+'" width="'+bw/2+'" height="'+bh+'" fill="#9b8870"/><path d="M'+x(b.x)+','+py+'v'+bh+'" stroke="#51483e" stroke-width="2"/>');
 for(let k=1;k<5;k++)shapes.push('<path d="M'+px+','+(py+bh*k/5)+'h'+bw+'" stroke="#524b40" opacity=".3"/>');
 if(b.stories===2)shapes.push('<rect x="'+(px-3)+'" y="'+(py-3)+'" width="'+(bw+6)+'" height="'+(bh+6)+'" fill="none" stroke="#d7c5a5" stroke-width="2"/>');
 if(b.flag){const c=b.flag==='C'?'#d7c28c':b.x<0?'#92bdca':'#d39985';shapes.push('<circle cx="'+x(b.x)+'" cy="'+z(b.z)+'" r="12" fill="#26352f" stroke="'+c+'" stroke-width="2"/><text x="'+x(b.x)+'" y="'+(z(b.z)+5)+'" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="14" fill="'+c+'">'+b.flag+'</text>');}
}
for(const b of map.vegetation??[])shapes.push('<ellipse cx="'+x(b.x)+'" cy="'+z(b.z)+'" rx="7" ry="6" fill="#555d40" stroke="#737b52" stroke-width="2"/>');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><title>Village Front layout: nine buildings and five flags</title><rect width="960" height="540" fill="#73785d"/>'+shapes.join('')+'<rect x="18" y="18" width="924" height="504" rx="4" fill="none" stroke="#d2c6a8" opacity=".3"/><text x="32" y="49" font-family="sans-serif" font-size="22" font-weight="bold" letter-spacing="3" fill="#e6dfcd">VILLAGE FRONT</text><text x="32" y="75" font-family="sans-serif" font-size="12" letter-spacing="2" fill="#d0cbb8">LAYOUT OVERVIEW · FIVE-FLAG DOMINATION</text></svg>';
writeFileSync('public/previews/village.svg',svg);
