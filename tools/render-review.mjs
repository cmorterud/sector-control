// Production-browser checks and visual record through Chrome's built-in CDP.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,extname,sep} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {inflateSync} from 'node:zlib';
import {checkArmory,checkBriefing} from './briefing-review.mjs';
import {expectedCI,awaitPublishedManifest} from './pages-preview.mjs';

const map=process.argv[2]??'village';
const maps=['fort-vaux','zeppelin','training','trenches','night-raid','village','verdun','spring-offensive','gallipoli','headland','industrial'];
// Industrial still renders for CI checks but is not offered in the briefing.
const pickerMaps=maps.filter(id=>id!=='industrial');
if(!maps.includes(map))throw Error('Unknown map');
const dist=resolve(process.argv[3]??'dist'),out=resolve(process.argv[4]??`playtest-artifacts/render-${map}`);
const visualOnly=process.env.REVIEW_VISUAL_ONLY==='1';
const armoryStats=process.env.REVIEW_ARMORY_STATS;
const sitePath=process.env.PAGES_BASE_PATH??`/${process.env.GITHUB_REPOSITORY?.split('/')[1]??'sector-control'}/`;
if(!/^\/[a-zA-Z0-9_/-]+\/$/.test(sitePath))throw Error('Invalid deployment base path');
await mkdir(out,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'sector-control-render-'));
const chrome=process.env.CHROME_PATH??'/usr/bin/google-chrome';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.jpg':'image/jpeg','.glb':'model/gltf-binary','.wav':'audio/wav'};
const server=createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith(sitePath)){res.writeHead(404);res.end();return;}
  const relative=decodeURIComponent(url.pathname.slice(sitePath.length));
  const route=!relative||relative.endsWith('/')?relative+'index.html':relative;
  const file=resolve(dist,route);
  if(!file.startsWith(dist+sep)){res.writeHead(403);res.end();return;}
  const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=process.env.REVIEW_BASE_URL??`http://127.0.0.1:${server.address().port}${sitePath}`;
if(!base.endsWith('/')||!['https:','http:'].includes(new URL(base).protocol))throw Error('Invalid review URL');
let browser,client,chromeLog='',armoryURL,published;
const report={map,source:process.env.REVIEW_SOURCE_SHA??process.env.GITHUB_SHA??'local',scenarios:[],errors:[],note:visualOnly?'Fixed viewpoints at the start of the seeded match.':'Controlled snapshots advance 900 real simulation/presentation steps; software GPU displays checkpoints. Not a real-time FPS benchmark.'};
// Inspect the clean overview itself, so a black/flat canvas cannot pass merely
// because the HUD and simulation continue running. Chrome emits 8-bit RGB(A).
function overviewColors(png){
 let width,height,channels;const chunks=[];
 for(let at=8;at<png.length;){const size=png.readUInt32BE(at),type=png.toString('ascii',at+4,at+8),data=png.subarray(at+8,at+8+size);at+=size+12;
  if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);channels=data[9]===6?4:data[9]===2?3:0;if(data[8]!==8||!channels)throw Error('Unsupported screenshot PNG format');}
  if(type==='IDAT')chunks.push(data);
 }
 const bytes=inflateSync(Buffer.concat(chunks)),stride=width*channels,rows=Buffer.alloc(stride*height),colors=new Set();
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const filter=bytes[y*(stride+1)],offset=y*stride;
  for(let x=0;x<stride;x++){const a=x>=channels?rows[offset+x-channels]:0,b=y?rows[offset+x-stride]:0,c=y&&x>=channels?rows[offset+x-stride-channels]:0;
   const predictor=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];if(predictor===undefined)throw Error('Unsupported PNG row filter');rows[offset+x]=(bytes[y*(stride+1)+1+x]+predictor)&255;
  }
  if(y%4===0)for(let x=0;x<width;x+=4){const i=offset+x*channels;colors.add((rows[i]>>5)*64+(rows[i+1]>>5)*8+(rows[i+2]>>5));}
 }
 return {width,height,quantizedColors:colors.size};
}
class CDP {
 constructor(ws){this.ws=ws;this.sequence=0;this.pending=new Map();this.listeners=new Map();ws.addEventListener('message',e=>{
  const m=JSON.parse(e.data);
  if(m.id){const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
  else for(const f of this.listeners.get(m.method)??[])f(m.params);
 });}
 on(method,callback){const list=this.listeners.get(method)??[];list.push(callback);this.listeners.set(method,list);}
 send(method,params={}){return new Promise((resolve,reject)=>{const id=++this.sequence,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout: '+method));},60000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
 async evaluate(expression){const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+': '+r.exceptionDetails.exception?.description);return r.result.value;}
 close(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Browser closed'));}this.pending.clear();this.ws.close();}
}
async function until(fn,ms=45000){const end=Date.now()+ms;while(Date.now()<end){try{const value=await fn();if(value)return value;}catch(e){if(!/context was destroyed|Cannot find context|Cannot find default execution context/.test(String(e)))throw e;}if(browser?.exitCode!==null)throw Error('Chrome exited before review: '+chromeLog.slice(-4000));await delay(250);}throw Error('Timed out waiting for browser/game');}
async function screenshot(name,clean=false){
 if(clean)await client.evaluate(`(()=>{const s=document.createElement('style');s.id='render-review-clean';s.textContent='#ui,.playtest{visibility:hidden!important}';document.head.append(s);})()`);
 try{const png=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true}),bytes=Buffer.from(png.data,'base64');await writeFile(join(out,name+'.png'),bytes);if(clean){const image=overviewColors(bytes);report.overviewImage=image;if(image.quantizedColors<8)throw Error('Blank or flat rendered overview');}}
 finally{if(clean)await client.evaluate(`document.querySelector('#render-review-clean')?.remove()`);}
}
try {
 if(process.env.REVIEW_BASE_URL){
  const expected=expectedCI();
  if(process.env.EXPECTED_HEAD_SHA)expected.head=process.env.EXPECTED_HEAD_SHA;
  const revision=published=await awaitPublishedManifest(base,expected);
  report.checkerSource=report.source;report.source=revision.source;report.head=revision.head;report.deployment=base;
  report.ciRun=revision.run;report.ciAttempt=revision.attempt;
 }
 // Chrome keeps its browser sandbox. Software graphics makes the capture
 // reproducible on hosted runners with no physical display or discrete GPU.
 browser=spawn(chrome,['--headless=new',`--user-data-dir=${profile}`,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-sync','--disable-background-networking','--mute-audio','--window-size=1280,720','--use-angle=swiftshader','--enable-unsafe-swiftshader','about:blank'],{stdio:['ignore','ignore','pipe']});
 browser.stderr.on('data',b=>{chromeLog=(chromeLog+b).slice(-100000);});browser.on('error',e=>report.errors.push(String(e)));
 const port=await until(async()=>{try{return (await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{return null;}});
 const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(),target=targets.find(t=>t.type==='page');
 if(!target)throw Error('No Chrome page target');
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});client=new CDP(ws);
 client.on('Runtime.exceptionThrown',p=>report.errors.push(p.exceptionDetails.exception?.description??p.exceptionDetails.text));
 client.on('Runtime.consoleAPICalled',p=>{if(p.type==='error'||p.type==='assert')report.errors.push(p.args.map(a=>a.value??a.description??'').join(' '));});
 client.on('Network.responseReceived',p=>{if(p.response.status>=400&&!p.response.url.endsWith('/favicon.ico'))report.errors.push(`HTTP ${p.response.status}: ${p.response.url}`);});
 client.on('Network.loadingFailed',p=>{if(!p.canceled)report.errors.push(p.errorText);});
 await client.send('Runtime.enable');await client.send('Page.enable');await client.send('Network.enable');
 await client.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 for(const mode of ['overview','ground']) {
  const query=new URLSearchParams({map,view:'first',autoplay:'',playtest:'',renderReview:'',video:'0',clip:'600',duration:'120',quality:process.env.REVIEW_QUALITY??'high'});if(mode==='overview')query.set('overview','');
  if(map==='fort-vaux'&&mode==='overview'&&!visualOnly&&!process.env.REVIEW_BASE_URL)query.delete('map');
  // Pages caches a page for up to ten minutes. Like the manifest request, ask
  // for a URL unique to this revision so an earlier deployment's HTML cannot answer.
  if(published){query.set('revision',published.head);query.set('run',published.run);}
  console.log(JSON.stringify({map,mode,stage:'loading'}));
  let destination;
  // A Pages edge that has not switched yet can still answer with the previous
  // build's page. Reload from a fresh URL a few times before calling it wrong.
  for(let attempt=1;;attempt++){
   if(attempt>1)query.set('check',String(attempt));
   destination=base+'?'+query;
   await client.send('Page.navigate',{url:destination});
   await until(()=>client.evaluate(`(()=>{if(location.href!==${JSON.stringify(destination)}||document.readyState!=='complete'||!document.body)return false;if(document.body.innerText.includes('Unable to initialize'))throw Error(document.body.innerText);return document.querySelector('#menu')?.classList.contains('hidden')===false&&document.querySelector('#primary')?.textContent.trim().startsWith('Begin operation');})()`));
   if(!published)break;
   // The page under test must be the published build, not a cached predecessor.
   const root=new URL(base).pathname;
   const loaded=await client.evaluate(`[...document.querySelectorAll('script[src],link[rel="stylesheet"][href]')].map(e=>new URL(e.src||e.href,location.href).pathname)`);
   const foreign=loaded.filter(path=>path.startsWith(root)&&!Object.hasOwn(published.files,path.slice(root.length)));
   if(loaded.some(path=>path.startsWith(root+'assets/'))&&!foreign.length)break;
   if(attempt===6)throw Error('The deployed page is not build '+published.head+': it loads '+(foreign.join(', ')||'no bundle'));
   console.log(JSON.stringify({map,mode,stage:'waiting for Pages CDN',attempt,foreign}));
   await delay(5000);
  }
  if(!visualOnly&&!process.env.REVIEW_BASE_URL&&mode==='overview') {
   report.briefing=await client.evaluate(`(${checkBriefing})(${JSON.stringify(map)},${JSON.stringify(pickerMaps)},${!!published})`);
   if(map==='fort-vaux')await client.evaluate(`(()=>{
    const card=document.querySelector('[data-battlefield="fort-vaux"]');
    const brief=document.querySelector('#menu .panel > p');
    if(!card.textContent.includes('6v6')||!card.textContent.includes('Verdun · 1916')||!brief?.textContent.includes('6v6'))
     throw Error('Fort Vaux card or briefing differs from the 6v6 default');
   })()`);
   if(armoryStats)armoryURL=await client.evaluate(`document.querySelector('.armory-link')?.href`);
  }
  await client.evaluate(`document.querySelector('#primary').click()`);
  await until(()=>client.evaluate(`!!document.querySelector('.playtest')`));
  // Keep diagnostic chrome clear of the lesson panel in the recorded views.
  if(map==='training')await client.evaluate(`(()=>{const s=document.createElement('style');s.textContent='.playtest{left:auto!important;right:20px!important}';document.head.append(s);})()`);
  const graphics=await client.evaluate(`(()=>{const c=document.querySelector('#game'),g=c.getContext('webgl2');if(!g)throw Error('No WebGL 2 context');const e=g.getExtension('WEBGL_debug_renderer_info');return {width:c.width,height:c.height,renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)};})()`);
  await until(()=>client.evaluate(`window.sectorRenderReview?.state().frames>=2`));
  if(mode==='ground'){
   if(map==='training')await client.evaluate(`window.sectorRenderReview.training(1)`);
   const before=await client.evaluate(`window.sectorRenderReview.survey(true).frames`);
   await until(()=>client.evaluate(`window.sectorRenderReview.state().frames>=${before+2}`));
  }
  await screenshot(mode==='overview'?'overview-intact':'first-person',mode==='overview');
  if((map==='village'||map==='fort-vaux'||map==='trenches'||map==='night-raid'||map==='verdun'||map==='zeppelin') && mode==='ground') {
   const details=map==='village'?['school','inn','street','manor-room']
    // Each level of the airship, a flag room on two of them and the view from an engine car.
    :map==='zeppelin'?['keel','station','gallery','bomb-bay','top','engine-car']
    :map==='trenches'?['boundary-wire','trench-block','trench-dugout','trench-sign','no-mans-land','firing-step']
    :map==='verdun'?['boundary-wire','dead-zone-woods','west-horizon','east-horizon','south-front','woods','relay','front-trench','trench-dugout','trench-sign','no-mans-land']
    // By lamplight at a dugout, in the dark of no-man's land, and from a firing step.
    :map==='night-raid'?['trench-dugout','no-mans-land','firing-step']
    :['cistern','barracks','casemate','yard'];
   for(const detail of details) {
    let before;
    try{before=await client.evaluate(`window.sectorRenderReview.survey(true,${JSON.stringify(detail)}).frames`);}
    catch(error){
     // The visual comparison runs this script against the base build, which may predate a viewpoint.
     if(!visualOnly||!/Unknown review viewpoint/.test(String(error)))throw error;
     console.log(JSON.stringify({map,stage:'viewpoint unknown to this build',detail}));continue;
    }
    await until(()=>client.evaluate(`window.sectorRenderReview.state().frames>=${before+2}`));
    await screenshot('detail-'+detail,true);
   }
   if(map==='night-raid'&&!visualOnly){
    // A flare over no-man's land lights the ground the darkness rule calls lit, and none beyond it.
    const view=await client.evaluate(`window.sectorRenderReview.survey(true,'no-mans-land').frames`);
    await until(()=>client.evaluate(`window.sectorRenderReview.state().frames>=${view+2}`));
    const dark=await client.evaluate(`window.sectorRenderReview.light(-8,-10)`);
    await client.evaluate(`window.sectorRenderReview.flare(-8,-10)`);
    const burning=await client.evaluate(`window.sectorRenderReview.advance(30).frames`);
    await until(()=>client.evaluate(`window.sectorRenderReview.state().frames>=${burning+2}`));
    const lit=await client.evaluate(`window.sectorRenderReview.light(-8,-10)`),beyond=await client.evaluate(`window.sectorRenderReview.light(-8,50)`);
    if(dark!==0||!(lit>0.8)||beyond!==0)throw Error('The flare did not light the ground as the rule expects: '+JSON.stringify({dark,lit,beyond}));
    await screenshot('flare-over-no-mans-land',true);
    console.log(JSON.stringify({map,flare:{dark,lit,beyond}}));
   }
   await client.evaluate(`window.sectorRenderReview.survey(true)`);
  }
  console.log(JSON.stringify({map,mode,stage:'intact-rendered'}));
  if(visualOnly)continue;
  const advanced=await client.evaluate(`window.sectorRenderReview.advance(900)`);
  console.log(JSON.stringify({map,mode,stage:'battle-advanced',...advanced}));
  // Each flag's cloth must wear its state's dye: one dye per state, and no two states alike.
  // Builds from before the cloth flags have no such report and are skipped.
  const flags=(await client.evaluate(`window.sectorRenderReview.flags?.()??[]`)).filter(flag=>flag.cloth);
  const dyes=new Map();
  for(const flag of flags){
   if(dyes.has(flag.state)&&dyes.get(flag.state)!==flag.cloth)throw Error(`Flag ${flag.id} is ${flag.state} but dyed ${flag.cloth}, not ${dyes.get(flag.state)}`);
   dyes.set(flag.state,flag.cloth);
  }
  if(new Set(dyes.values()).size!==dyes.size)throw Error('Flags in different states share a dye: '+JSON.stringify([...dyes]));
  if(flags.length)console.log(JSON.stringify({map,mode,flags:[...dyes]}));
  const before=await client.evaluate(mode==='ground'?`window.sectorRenderReview.survey(false).frames`:`window.sectorRenderReview.state().frames`);
  await until(()=>client.evaluate(`window.sectorRenderReview.state().frames>=${before+2}`));
  await client.evaluate(`window.sectorRenderReview.finish()`);
  const log=await until(()=>client.evaluate(`(async()=>{const a=[...document.querySelectorAll('.playtest a')].find(a=>a.download.endsWith('.json')&&!a.download.endsWith('.perf.json'));if(!a)return null;const l=await(await fetch(a.href)).json();return {startedAt:l.startedAt,summary:l.summary,performance:l.performance,presentation:l.presentation,lastSample:l.samples.at(-1),events:l.events.filter(e=>['artilleryImpact','destruction','capture','death'].includes(e.type))};})()`),75000);
  await screenshot(mode==='overview'?'overview-battle':'third-person');
  await writeFile(join(out,mode+'-playtest.json'),JSON.stringify(log,null,2));
  if(log.summary.ticks<900||log.summary.frames<2)throw Error('Game did not progress through rendered frames');
  if(map==='fort-vaux'&&(log.summary.artilleryImpacts||log.events.some(event=>event.type==='artilleryImpact')))
   throw Error('Fort Vaux had an artillery impact');
  if(map==='zeppelin'&&(log.summary.artilleryImpacts||log.events.some(event=>event.type==='artilleryImpact')))
   throw Error('The Zeppelin had an artillery impact');
  // Rails keep everyone aboard: nobody should fall off the airship.
  if(map==='zeppelin'&&log.events.some(event=>event.type==='death'&&event.report?.kind==='fall'))
   throw Error('A soldier fell from the Zeppelin');
  if(log.summary.errors.length)report.errors.push(...log.summary.errors);
  report.scenarios.push({mode,graphics,summary:log.summary});
 }
 if(!visualOnly&&(map==='trenches'||map==='verdun')) {
  // Walk out through the boundary wire: the warning must appear and count down,
  // and staying out must end in the boundary salvo rather than a soldier's kill.
  // The west wire starts at the play area's edge: x -80 on Ypres, -104 on Verdun.
  const edge=map==='verdun'?-104:-80;
  report.boundary=await client.evaluate(`(()=>{
   const review=window.sectorRenderReview;
   const send=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
   review.manual();
   review.survey(true,'boundary-walk');
   const start=review.state().player.x;
   send('keydown','KeyW');
   try {review.advance(75);} finally {send('keyup','KeyW');}
   const out=review.state().player, banner=document.querySelector('.boundary-warning')?.textContent??'';
   if(out.x>${edge}-0.2||out.x<start-8)throw Error('Did not walk into the boundary wire: x '+out.x);
   if(!banner.includes('OUT OF BOUNDS')||!/ARTILLERY IN [1-5]/.test(banner))throw Error('Boundary warning missing: '+banner);
   if(!document.querySelector('#ui').classList.contains('out-of-bounds'))throw Error('Boundary vignette missing');
   return {x:out.x,banner};
  })()`);
  {
   const before=await client.evaluate(`window.sectorRenderReview.state().frames`);
   await until(()=>client.evaluate(`window.sectorRenderReview.state().frames>=${before+2}`));
   await screenshot('boundary-warning');
  }
  report.boundary.death=await client.evaluate(`(()=>{
   const review=window.sectorRenderReview;
   review.advance(150);
   const s=review.state(), card=document.querySelector('.death-card')?.textContent??'';
   if(s.player.hp!==0||!card.includes('Left the battlefield'))throw Error('Staying out did not end in the boundary salvo: hp '+s.player.hp+' card '+card);
   return card;
  })()`);
  console.log(JSON.stringify({map,boundary:report.boundary}));
 }
 if(!visualOnly&&map==='fort-vaux') {
  report.floorPlan=await client.evaluate(`(()=>{
   const key=()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyQ',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyQ',bubbles:true}));};
   const review=window.sectorRenderReview;
   review.survey(true);
   const minimap=document.querySelector('#minimap'), mapCanvas=minimap.querySelector('canvas');
   if(!minimap.offsetWidth||minimap.querySelectorAll('.minimap-flag').length!==3||!minimap.querySelector('.minimap-player'))
    throw Error('Fort Vaux minimap is missing the player marker or objective flags');
   const corridor=mapCanvas.getContext('2d').getImageData(mapCanvas.width/2,mapCanvas.height/2,1,1).data;
   if(corridor[0]===34&&corridor[1]===45)throw Error('Fort minimap is missing its interior floor plan');
   key();
   const panel=document.querySelector('#tactical-map');
   if(panel.classList.contains('hidden')||!panel.textContent.includes('FORT VAUX · FLOOR PLAN')||panel.querySelector('.tactical-grid button,.map-cursor'))throw Error('Fort Vaux opened artillery targeting instead of a floor plan');
   for(const room of ['Barracks','Cistern','East Casemate'])if(!panel.textContent.includes(room))throw Error('Missing floor-plan flag '+room);
   if(document.querySelector('#ammo').textContent.includes('ARTILLERY'))throw Error('Artillery HUD is visible at Fort Vaux');
   return {available:true,flags:3,artillery:false};
  })()`);
  await screenshot('fort-floor-plan');
  report.yardApproaches=await client.evaluate(`(()=>{
   const review=window.sectorRenderReview;
   const send=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
   send('keydown','KeyQ');send('keyup','KeyQ');
   if(review.state().teamSize!==6)throw Error('Fort Vaux did not start 6v6');
   review.manual();
   return ['yard-west','yard-east'].map(side=>{
    review.survey(true,side);
    const before=review.state().player;
    send('keydown','KeyW');
    try {review.advance(60);} finally {send('keyup','KeyW');}
    const after=review.state().player;
    if(Math.abs(before.x)<=8||Math.abs(after.x)>=8||Math.abs(after.z-before.z)>.35)
     throw Error('Could not walk into the Sunken Yard from '+side);
    return side;
   });
  })()`);
  for(const side of report.yardApproaches){
   const before=await client.evaluate(`window.sectorRenderReview.survey(true,${JSON.stringify(side)}).frames`);
   await until(()=>client.evaluate(`window.sectorRenderReview.state().frames>=${before+2}`));
   await screenshot('detail-'+side,true);
  }
 }
 if(!visualOnly&&map==='industrial'){
  await client.evaluate(`(()=>{const s=document.createElement('style');s.textContent='.playtest{visibility:hidden!important}';document.head.append(s);})()`);
  const stage=async(name)=>{await client.evaluate(`window.sectorRenderReview.combat(${JSON.stringify(name)})`);const before=await client.evaluate(`window.sectorRenderReview.state().frames`);await until(()=>client.evaluate(`window.sectorRenderReview.state().frames>=${before+2}`));};
  const key=async(code,type='keydown')=>client.evaluate(`window.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)},{code:${JSON.stringify(code)},bubbles:true}))`);
  await stage('hit');
  await client.evaluate(`(()=>{if(window.sectorRenderReview.state().player.hp!==75||!document.querySelector('.damage-bearing'))throw Error('A real hit did not show a directional indicator');})()`);
  await screenshot('combat-hit-direction');
  await stage('death');
  await client.evaluate(`(()=>{const s=window.sectorRenderReview.state(),card=document.querySelector('.death-card');if(s.player.hp!==0||!s.combat.view||!card?.textContent.includes('AR-01')||!card.textContent.includes('100 damage'))throw Error('Death view or report did not reflect real shots');if(!document.querySelector('.kill-feed-entry.blue b.blue')?.textContent.includes('YOU'))throw Error('The death of a friendly soldier was not blue in the kill feed');})()`);
  await screenshot('combat-death-card');
  await client.send('Emulation.setDeviceMetricsOverride',{width:1280,height:600,deviceScaleFactor:1,mobile:false});
  await client.evaluate(`(()=>{const r=document.querySelector('.death-card').getBoundingClientRect();if(r.top<0||r.bottom>innerHeight||r.left<0||r.right>innerWidth)throw Error('Death card is clipped at 600px height');})()`);
  await screenshot('combat-death-card-600');
  await client.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  await client.evaluate(`window.sectorRenderReview.advance(80)`);
  await client.evaluate(`(()=>{const s=window.sectorRenderReview.state();if(s.player.hp!==0||s.combat.view||s.combat.fov<69)throw Error('The brief death view did not end at a wide field of view');})()`);
  await stage('respawn');await key('KeyQ');await key('KeyQ','keyup');
  await until(()=>client.evaluate(`document.querySelector('.battle-sidebar').hidden`));
  await client.evaluate(`(()=>{const s=window.sectorRenderReview.state(),m=document.querySelector('.map-death');if(s.player.hp!==100||s.combat.view||!m||m.hidden||!s.combat.marker)throw Error('Respawn did not retain the death marker and restore the camera');})()`);
  await screenshot('combat-death-map');
  await client.evaluate(`window.sectorRenderReview.advance(181)`);
  await client.evaluate(`(()=>{if(!document.querySelector('.map-death').hidden||window.sectorRenderReview.state().combat.marker)throw Error('Death marker did not expire');})()`);
  await key('KeyQ');await key('KeyQ','keyup');
  await stage('assist');
  await client.evaluate(`(()=>{if(window.sectorRenderReview.state().player.assists!==1||!document.querySelector('.assist-notice')?.textContent.includes('25 DAMAGE'))throw Error('Real teammate damage did not award an assist');})()`);
  await screenshot('combat-assist-notice');await key('Tab');
  await until(()=>client.evaluate(`!document.getElementById('scoreboard').classList.contains('hidden')`));
  await client.evaluate(`(()=>{
   const board=document.getElementById('scoreboard'),row=board.querySelector('.local-soldier');
   if(board.querySelectorAll('table').length!==2||!board.querySelector('[title="Assists"]')||
      row?.children[2].textContent!=='1'||row?.querySelector('.personal-points').textContent!=='75'||
      !board.querySelector('[title="Kill-to-death ratio"]'))throw Error('Scoreboard assist, K/D or personal points are missing or incorrect');
   const other=board.querySelector('.table tbody tr:not(.local-soldier) th');
   if(!/^[A-Z]\\. [^0-9]+$/.test(other?.textContent??''))throw Error('Scoreboard is missing named soldiers');
  })()`);
  await screenshot('combat-assist-scoreboard');await key('Tab','keyup');
  await stage('kill');
  await client.evaluate(`(()=>{
   const confirmation=document.querySelector('.kill-notice'), row=document.querySelector('.kill-feed-entry.red');
   if(!confirmation.textContent.startsWith('You killed ')||row?.querySelector('b.blue')?.textContent!=='YOU'||
      !confirmation.textContent.includes(row.querySelector('b.red').textContent))throw Error('A real kill did not display the victim in the toast and red kill feed');
   const {player}=window.sectorRenderReview.state(), marker=document.querySelector('.minimap-player');
   const map=document.querySelector('#minimap'),canvas=map.querySelector('canvas');
   if(!map.offsetWidth||!canvas.width||marker.hidden||!marker.style.transform.includes('rotate')||
      player.x!==0||marker.style.left!=='50%'||!Number.isFinite(parseFloat(marker.style.top)))throw Error('The minimap did not track the player');
  })()`);
  await screenshot('combat-kill-hud');
  await key('Tab');
  await until(()=>client.evaluate(`!document.getElementById('scoreboard').classList.contains('hidden')`));
  await client.evaluate(`(()=>{
   const row=document.querySelector('#scoreboard .local-soldier');
   if(row.children[5].textContent!=='1.00'||row.querySelector('.personal-points').textContent!=='100')
    throw Error('A real kill did not produce 100 points and a 1.00 K/D');
  })()`);
  await key('Tab','keyup');
  await client.evaluate(`(()=>{window.sectorRenderReview.advance(90);if(document.querySelector('.kill-notice').textContent||!document.querySelector('.kill-feed-entry.red'))throw Error('The kill confirmation and feed did not expire at different times');})()`);
  report.combatChecks={damageBearing:true,deathReport:true,deathView:true,deathViewEnds:true,shortViewport:true,respawnMarker:true,markerExpiry:true,assistCredit:true,scoreboard:true,killConfirmation:true,killFeed:true,minimap:true};
  console.log(JSON.stringify({map,combatChecks:report.combatChecks}));
 }
 if(!visualOnly&&map==='training'){
  await client.evaluate(`(()=>{const b=window.sectorRenderReview;b.manual();b.training(0);b.advance(2);})()`);
  await screenshot('training-guided-movement');
  report.trainingControls=await client.evaluate(`(()=>{
   const b=window.sectorRenderReview,check=(ok,text)=>{if(!ok)throw Error(text);};
   const key=(code,type='keydown')=>window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
   const press=code=>{key(code);key(code,'keyup');};
   const select=(id,value)=>{const el=document.getElementById(id);check(!!el,'Missing '+id);el.value=String(value);el.dispatchEvent(new Event('change',{bubbles:true}));};
   b.manual();b.training(0);
   const before=b.state().player;
   const prompt=document.getElementById('training-action'),marker=document.getElementById('training-marker');
   check(!marker.hidden && marker.textContent.includes('Walk here'),'Missing in-world movement marker');
   check(!prompt.hidden && prompt.textContent.includes('Hold W'),'Missing movement input at lower center');
   key('KeyE');key('KeyE','keyup');
   check(b.state().training.id==='movement','Interact skipped an unfinished drill');
   key('KeyW');b.advance(48);key('KeyW','keyup');
   check(b.state().player.z<before.z-1,'W did not move the trainee');
   check(!marker.hidden && marker.textContent.includes('Sprint here'),'The marker did not advance to the sprint checkpoint');
   press('KeyC');b.advance(1);check(b.state().player.crouched,'C did not crouch');
   press('KeyC');b.advance(1);check(!b.state().player.crouched,'C did not stand');
   const view=b.state().player.firstPerson;press('KeyT');b.advance(1);check(b.state().player.firstPerson!==view,'T did not change view');
   const stations=[];
   for(let i=0;i<9;i++){
    press('Escape');check(b.state().paused,'Escape did not pause');
    select('training-station',i);select('training-loadout',i===1?'marksman':'rifleman');select('training-faction',i===1?'french':'british');
    const free=document.getElementById('training-free');free.checked=true;free.dispatchEvent(new Event('change',{bubbles:true}));
    document.getElementById('primary').click();b.advance(2);
    const state=b.state();check(!state.paused,'Resume did not start the selected exercise');
    check(state.training.loadout===(i===1?'marksman':'rifleman'),'Armory loadout did not apply');
    check(state.training.faction===(i===1?'french':'british'),'Faction equipment did not apply');
    check(state.training.free && marker.hidden,'Free practice did not hide guided markers');stations.push(state.training.id);
    if(i===1){
     const loaded=b.state().player.ammo;
     check(loaded>=5,'Marksman loadout starts without its magazine');
     if(!b.state().player.firstPerson)press('KeyT');
     window.dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true}));b.advance(25);
     window.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));b.advance(12);
     window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));check(b.state().player.ammo===loaded-1,'LMB did not fire one round');
     press('KeyR');b.advance(120);check(b.state().player.ammo===loaded,'R did not reload');
     window.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true}));
    }
    if(i===4){
     press('KeyQ');const map=document.getElementById('tactical-map');
     check(!map.classList.contains('hidden')&&map.textContent.includes('EXERCISE AREA'),'Q did not open the marked training artillery map');
     const bounds=map.getBoundingClientRect(),cancel=map.querySelector(':scope > button').getBoundingClientRect();
     check(bounds.top>=0&&bounds.bottom<=innerHeight&&cancel.bottom<=innerHeight,'The artillery map or cancel button is clipped by the viewport');
     window.dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true}));
     window.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true}));
     check(map.classList.contains('hidden'),'RMB did not cancel the tactical map');
    }
   }
   check(new Set(stations).size===9,'An exercise is missing');
   press('Escape');check(document.getElementById('training-refill'),'Training resupply is missing');
   return {walk:true,crouchToggle:true,viewSwitch:true,aimAndFire:true,reload:true,tacticalMap:true,armory:true,factions:true,freePractice:true,stations};
  })()`);
  await screenshot('training-menu');
  await client.evaluate(`(()=>{
   const b=window.sectorRenderReview;
   const change=(id,value)=>{const el=document.getElementById(id);if(typeof value==='boolean')el.checked=value;else el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
   change('training-station','6');change('training-free',false);
   document.getElementById('primary').click();b.advance(2);
   window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyQ',bubbles:true}));
   window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyQ',bubbles:true}));
   const map=document.getElementById('tactical-map');
   if(!map.querySelector('.exercise-mode'))throw Error('Gas drill did not highlight the mode switch');
   window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',bubbles:true}));
   window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyF',bubbles:true}));
   if(!map.querySelector('.exercise-sector.selected'))throw Error('Gas drill did not highlight and preselect the sector');
  })()`);
  await screenshot('training-gas-map');
  report.trainingGas=await client.evaluate(`(()=>{
   const b=window.sectorRenderReview;
   const press=code=>{window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));};
   document.querySelector('#tactical-map .exercise-sector').click();
   const prompt=document.getElementById('training-action');
   b.advance(1);if(!prompt.textContent.includes('put on your gas mask'))throw Error('Gas call did not advance to the mask');
   press('KeyM');b.advance(32);if(!prompt.textContent.includes('watch the marked sector'))throw Error('Mask seal did not advance to watching the cloud');
   b.advance(100);if(!prompt.textContent.includes('Station complete'))throw Error('The actual gas strike did not complete the drill');
   press('KeyE');b.advance(2);if(b.state().training.id!=='squad')throw Error('Interact did not deploy to the next station');
   return {called:true,maskSealed:true,landed:true,nextStation:true};
  })()`);
  await client.evaluate(`(()=>{
   const b=window.sectorRenderReview,press=code=>{window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));};
   b.training(4);b.advance(2);press('KeyQ');
   if(document.querySelector('#tactical-map .exercise-mode'))press('KeyF');
  })()`);
  await screenshot('training-artillery-map');
  await client.send('Emulation.setDeviceMetricsOverride',{width:1280,height:600,deviceScaleFactor:1,mobile:false});
  await client.evaluate(`(()=>{const map=document.getElementById('tactical-map'),r=map.getBoundingClientRect(),c=map.querySelector(':scope > button').getBoundingClientRect();if(r.top<0||r.bottom>innerHeight||c.bottom>innerHeight)throw Error('Artillery panel is clipped at 600px height');})()`);
  await screenshot('training-artillery-map-600');
  await client.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  const trainGun = async code => client.evaluate(`((code)=>{
   const b=window.sectorRenderReview;
   const press=key=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:key,bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:key,bubbles:true}));};
   const click=(button,type='mousedown')=>window.dispatchEvent(new MouseEvent(type,{button,bubbles:true}));
   const expect=(ok,message)=>{if(!ok)throw Error(message);};
   const select=(id,value)=>{const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
   if(code==='preview'){
    press('KeyQ');press('Escape');
    expect(b.state().paused,'Could not open training armory');
    select('training-station','1');select('training-loadout','emplacement');select('training-faction','british');
    const free=document.getElementById('training-free');free.checked=true;free.dispatchEvent(new Event('change',{bubbles:true}));
    document.getElementById('primary').click();b.advance(2);press('KeyB');
    expect(b.state().training.loadout==='emplacement','Emplacement kit selection did not apply');
    return b.state().frames;
   }
   if(code==='mount'){
    expect(b.emplacement().preview===true,'Valid gun preview did not appear');
    click(0);click(0,'mouseup');b.advance(47);
    expect(b.emplacement().gun?.weaponId==='Vickers','Click did not deploy the kit');
    press('KeyE');b.advance(2);
    expect(b.emplacement().mounted,'Interact did not mount the gun');
    click(2);b.advance(6);
    const loaded=b.emplacement().gun.ammo, z=b.state().player.z;
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true}));
    click(0);b.advance(6);click(0,'mouseup');
    window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',bubbles:true}));
    expect(b.emplacement().gun.ammo<loaded && b.state().player.z===z,'Mounted gun did not fire from a fixed seat');
    expect(b.emplacement().goals.includes('fireGun'),'Training did not count the hit from the mounted gun');
    return b.state().frames;
   }
   const gun=b.emplacement().gun, total=gun.ammo+gun.reserve;
   press('KeyR');b.advance(1);expect(b.emplacement().gun.reloadAt>b.state().tick,'Reload did not start');
   press('KeyE');b.advance(1);expect(!b.emplacement().mounted,'Interact did not dismount the gun');
   click(2,'mouseup');
   b.advance(181);
   expect(!b.emplacement().gun.reloadAt && b.emplacement().gun.ammo+b.emplacement().gun.reserve===total,'Reload did not finish while unmounted');
   press('KeyB');b.advance(1);
   expect(b.emplacement().count===0 && b.emplacement().goals.includes('packGun'),'Pack did not return the kit');
   return { preview:true, mounted:true, firing:true, reload:true, packed:true };
  })(${JSON.stringify(code)})`);
  const previewFrame=await trainGun('preview');
  await until(()=>client.evaluate(`window.sectorRenderReview.state().frames>=${previewFrame+2}`));
  await screenshot('training-emplacement-preview');
  const mountedFrame=await trainGun('mount');
  await until(()=>client.evaluate(`window.sectorRenderReview.state().frames>=${mountedFrame+2}`));
  await screenshot('training-emplacement-sights');
  report.emplacement=await trainGun('pack');
  console.log(JSON.stringify({map,emplacement:report.emplacement}));
  console.log(JSON.stringify({map,trainingControls:report.trainingControls}));
 }
 if(!visualOnly&&armoryStats) {
  if(armoryURL!==new URL('armory/',base).href)throw Error('Briefing link does not point to the built Armory');
  const expected=JSON.parse(await readFile(armoryStats,'utf8'));
  await client.send('Page.navigate',{url:armoryURL});
  await until(()=>client.evaluate(`location.href===${JSON.stringify(armoryURL)}&&document.readyState==='complete'&&!!document.querySelector('#armory .card')`));
  report.armory=await client.evaluate(`(${checkArmory})(${JSON.stringify(expected)})`);
  await screenshot('armory-comparison');
  // The page used to live at armoury/; old links and bookmarks must still arrive.
  await client.send('Page.navigate',{url:new URL('armoury/?from=old-link',base).href});
  await until(()=>client.evaluate(`location.href===${JSON.stringify(armoryURL+'?from=old-link')}&&!!document.querySelector('#armory .card')`));
  console.log(JSON.stringify({armory:report.armory}));
 }
 if(report.errors.length)throw Error(`${report.errors.length} browser errors`);
 if(report.deployment)await awaitPublishedManifest(base,{head:report.head,source:report.source,run:report.ciRun,attempt:report.ciAttempt});
 console.log(JSON.stringify({map,source:report.source,scenarios:report.scenarios.map(s=>({mode:s.mode,ticks:s.summary.ticks,frames:s.summary.frames,shots:s.summary.shots,artilleryImpacts:s.summary.artilleryImpacts,errors:s.summary.errors.length})),errors:report.errors}));
}catch(error){report.errors.push(String(error));console.error(error);process.exitCode=1;if(client)try{await screenshot('failure');}catch{}}
finally {
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));await writeFile(join(out,'chrome.log'),chromeLog);
 client?.close();browser?.kill('SIGTERM');await delay(1500);if(browser?.exitCode===null)browser.kill('SIGKILL');server.closeAllConnections();await new Promise(r=>server.close(r));await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});
}
