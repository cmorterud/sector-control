// A map illustration from the authored layout, not a captured gameplay frame.
import {writeFileSync} from 'node:fs';
import {headlandMap as map} from '../src/headland-map';
const w=960,h=540,s=3.1,ox=w/2,oz=h/2+4;
const x=(v:number)=>(ox+v*s).toFixed(1),z=(v:number)=>(oz+v*s).toFixed(1);
const shapes:string[]=[];
const land=map.coast!.map(p=>x(p.x)+','+z(p.z)).join(' ');
shapes.push('<polygon points="'+land+'" fill="none" stroke="#9fc0c4" stroke-width="9" opacity=".35" stroke-linejoin="round"/>');
shapes.push('<polygon points="'+land+'" fill="#73785d" stroke="#8d8468" stroke-width="3" stroke-linejoin="round"/>');
for(const road of map.streets??[]){const pts=road.points.map(p=>x(p.x)+','+z(p.z)).join(' ');
 shapes.push('<polyline points="'+pts+'" fill="none" stroke="#a69a80" stroke-width="'+road.width*s+'" stroke-linejoin="round" stroke-linecap="round"/><polyline points="'+pts+'" fill="none" stroke="#bfb296" stroke-width="'+Math.max(1,road.width*s-3)+'" stroke-linejoin="round" stroke-linecap="round"/>');}
for(const b of map.vegetation??[])shapes.push('<ellipse cx="'+x(b.x)+'" cy="'+z(b.z)+'" rx="6" ry="5" fill="#555d40" stroke="#737b52" stroke-width="1.5"/>');
for(const b of map.boxes.filter(b=>!b.architecture&&b.kind!=='building'))shapes.push('<rect x="'+x(b.x-b.w/2)+'" y="'+z(b.z-b.d/2)+'" width="'+Math.max(1.5,b.w*s)+'" height="'+Math.max(1.5,b.d*s)+'" fill="#4f493d"/>');
for(const [i,b] of map.buildings!.entries()) {
 const px=+x(b.x-b.w/2),py=+z(b.z-b.d/2),bw=b.w*s,bh=b.d*s;
 shapes.push('<rect x="'+(px+3)+'" y="'+(py+5)+'" width="'+bw+'" height="'+bh+'" fill="#302f27" opacity=".42"/>');
 shapes.push('<rect x="'+px+'" y="'+py+'" width="'+bw+'" height="'+bh+'" fill="'+(i%2?'#786d5b':'#81735e')+'" stroke="#d2bfa0" stroke-width="2"/>');
 shapes.push('<rect x="'+px+'" y="'+py+'" width="'+bw/2+'" height="'+bh+'" fill="#9b8870"/><path d="M'+x(b.x)+','+py+'v'+bh+'" stroke="#51483e" stroke-width="2"/>');
}
for(const b of map.boxes.filter(b=>b.kind==='building')) {
 const px=+x(b.x-b.w/2),py=+z(b.z-b.d/2),bw=b.w*s,bh=b.d*s;
 shapes.push('<rect x="'+(px+4)+'" y="'+(py+4+b.h/3)+'" width="'+bw+'" height="'+bh+'" fill="#302f27" opacity=".45"/>');
 shapes.push('<rect x="'+px+'" y="'+py+'" width="'+bw+'" height="'+bh+'" fill="'+(b.id==='headland-lighthouse'?'#e4dfd0':'#5d5a52')+'" stroke="#e0d2b4" stroke-width="2"/>');
}
for(const f of map.sectors){const c=f.home==='blue'?'#92bdca':f.home==='red'?'#d39985':'#d7c28c';
 shapes.push('<circle cx="'+x(f.x)+'" cy="'+z(f.z)+'" r="12" fill="#26352f" stroke="'+c+'" stroke-width="2"/><text x="'+x(f.x)+'" y="'+(+z(f.z)+5)+'" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="14" fill="'+c+'">'+f.id+'</text>');}
for(const [team,c,label] of [['blue','#92bdca','FRENCH'],['red','#d39985','GERMAN']] as const){const p=map.spawn[team];
 shapes.push('<rect x="'+(+x(p.x)-24)+'" y="'+(+z(p.z)-20)+'" width="48" height="40" fill="'+c+'" opacity=".28" stroke="'+c+'" stroke-width="1.5"/><text x="'+x(p.x)+'" y="'+(+z(p.z)+34)+'" text-anchor="middle" font-family="sans-serif" font-size="10" letter-spacing="1" fill="#e6dfcd">'+label+'</text>');}
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><title>Lighthouse Point layout: three flags on a headland</title><rect width="960" height="540" fill="#33586a"/>'+shapes.join('')+'<rect x="18" y="18" width="924" height="504" rx="4" fill="none" stroke="#d2c6a8" opacity=".3"/><text x="32" y="484" font-family="sans-serif" font-size="22" font-weight="bold" letter-spacing="3" fill="#e6dfcd">LIGHTHOUSE POINT</text><text x="32" y="508" font-family="sans-serif" font-size="12" letter-spacing="2" fill="#d0cbb8">COASTAL LAYOUT · THREE-FLAG DOMINATION</text></svg>';
writeFileSync('public/previews/headland.svg',svg);
