// Production-browser smoke check and visual record. No game test hooks or deps.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,extname,sep} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {inflateSync} from 'node:zlib';

const map=process.argv[2]??'village';
if(!['industrial','trenches','verdun','village','headland'].includes(map))throw Error('Unknown map');
const dist=resolve(process.argv[3]??'dist'),out=resolve(process.argv[4]??`playtest-artifacts/render-${map}`);
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
  const relative=decodeURIComponent(url.pathname.slice(sitePath.length))||'index.html';
  const file=resolve(dist,relative);
  if(!file.startsWith(dist+sep)){res.writeHead(403);res.end();return;}
  const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=process.env.REVIEW_BASE_URL??`http://127.0.0.1:${server.address().port}${sitePath}`;
if(!base.endsWith('/')||!['https:','http:'].includes(new URL(base).protocol))throw Error('Invalid review URL');
let browser,client,chromeLog='';
const report={map,source:process.env.GITHUB_SHA??'local',scenarios:[],errors:[],note:'Controlled snapshots advance 900 real simulation/presentation steps; software GPU displays checkpoints. Not a real-time FPS benchmark.'};
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
  const query=new URLSearchParams({map,view:'first',autoplay:'',playtest:'',renderReview:'',video:'0',clip:'120',duration:'120'});if(mode==='overview')query.set('overview','');
  const destination=base+'?'+query;
  console.log(JSON.stringify({map,mode,stage:'loading'}));
  await client.send('Page.navigate',{url:destination});
  await until(()=>client.evaluate(`(()=>{if(location.href!==${JSON.stringify(destination)}||document.readyState!=='complete'||!document.body)return false;if(document.body.innerText.includes('Unable to initialize'))throw Error(document.body.innerText);return document.querySelector('#menu')?.classList.contains('hidden')===false&&document.querySelector('#primary')?.textContent.trim().startsWith('Begin operation');})()`));
  await client.evaluate(`document.querySelector('#primary').click()`);
  await until(()=>client.evaluate(`!!document.querySelector('.playtest')`));
  const graphics=await client.evaluate(`(()=>{const c=document.querySelector('#game'),g=c.getContext('webgl2');if(!g)throw Error('No WebGL 2 context');const e=g.getExtension('WEBGL_debug_renderer_info');return {width:c.width,height:c.height,renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)};})()`);
  await until(()=>client.evaluate(`window.sectorRenderReview?.state().frames>=2`));
  if(mode==='ground'){
   const before=await client.evaluate(`window.sectorRenderReview.survey(true).frames`);
   await until(()=>client.evaluate(`window.sectorRenderReview.state().frames>=${before+2}`));
  }
  await screenshot(mode==='overview'?'overview-intact':'first-person',mode==='overview');
  console.log(JSON.stringify({map,mode,stage:'intact-rendered'}));
  const advanced=await client.evaluate(`window.sectorRenderReview.advance(900)`);
  console.log(JSON.stringify({map,mode,stage:'battle-advanced',...advanced}));
  const before=await client.evaluate(mode==='ground'?`window.sectorRenderReview.survey(false).frames`:`window.sectorRenderReview.state().frames`);
  await until(()=>client.evaluate(`window.sectorRenderReview.state().frames>=${before+2}`));
  await client.evaluate(`window.sectorRenderReview.finish()`);
  const log=await until(()=>client.evaluate(`(async()=>{const a=[...document.querySelectorAll('.playtest a')].find(a=>a.download.endsWith('.json')&&!a.download.endsWith('.perf.json'));if(!a)return null;const l=await(await fetch(a.href)).json();return {startedAt:l.startedAt,summary:l.summary,performance:l.performance,presentation:l.presentation,lastSample:l.samples.at(-1),events:l.events.filter(e=>['artilleryImpact','destruction','capture','death'].includes(e.type))};})()`),75000);
  await screenshot(mode==='overview'?'overview-battle':'third-person');
  await writeFile(join(out,mode+'-playtest.json'),JSON.stringify(log,null,2));
  if(log.summary.ticks<900||log.summary.frames<2)throw Error('Game did not progress through rendered frames');
  if(log.summary.errors.length)report.errors.push(...log.summary.errors);
  report.scenarios.push({mode,graphics,summary:log.summary});
 }
 if(report.errors.length)throw Error(`${report.errors.length} browser errors`);
 console.log(JSON.stringify({map,source:report.source,scenarios:report.scenarios.map(s=>({mode:s.mode,ticks:s.summary.ticks,frames:s.summary.frames,shots:s.summary.shots,artilleryImpacts:s.summary.artilleryImpacts,errors:s.summary.errors.length})),errors:report.errors}));
}catch(error){report.errors.push(String(error));console.error(error);process.exitCode=1;if(client)try{await screenshot('failure');}catch{}}
finally {
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));await writeFile(join(out,'chrome.log'),chromeLog);
 client?.close();browser?.kill('SIGTERM');await delay(1500);if(browser?.exitCode===null)browser.kill('SIGKILL');server.closeAllConnections();await new Promise(r=>server.close(r));await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});
}
