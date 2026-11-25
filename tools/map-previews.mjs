// Renders the map picker's preview images from the game itself.
//   npx vite build --base /sector-control/
//   node tools/map-previews.mjs [dist] [out] [map...]
// Each picker map opens at quality=high with a fixed seed, runs the battle
// for a fixed number of ticks and is captured with the HUD hidden. The frame
// is taken at 1280x720 and downscaled to a 640x360 JPEG in public/previews/.
// Software rendering works; Chrome with a GPU gives the most faithful shot.
// CHROME_PATH overrides the browser.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,extname,sep} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

// view: camera for the shot. ticks: simulation steps before the capture.
// survey: stand at the game's fixed review viewpoint instead of the spawn;
// a string names one of that map's detail viewpoints.
export const previewShots={
 'fort-vaux':{view:'third',ticks:420},
 zeppelin:{view:'third',ticks:420,survey:'top'},
 training:{view:'third',ticks:60,survey:true},
 verdun:{view:'third',ticks:540},
 trenches:{view:'third',ticks:540},
 'night-raid':{view:'third',ticks:540,survey:'trench-dugout'},
 headland:{view:'third',ticks:540},
 village:{view:'third',ticks:540,survey:'street'},
 // Not in the picker, but its card shows when ?map=industrial is open.
 industrial:{view:'third',ticks:540},
};

const args=process.argv.slice(2);
const [distArg,outArg,...only]=args;
const dist=resolve(distArg??'dist'),out=resolve(outArg??'public/previews');
const maps=only.length?only:Object.keys(previewShots);
for(const map of maps)if(!previewShots[map])throw Error('Unknown picker map: '+map);
const sitePath='/sector-control/';
const chromePath=process.env.CHROME_PATH??(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/google-chrome');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.glb':'model/gltf-binary','.wav':'audio/wav','.json':'application/json','.webmanifest':'application/manifest+json'};
const generated=new Map();
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  const page=generated.get(url.pathname);
  if(page){res.writeHead(200,{'Content-Type':page.type});res.end(page.body);return;}
  const file=resolve(dist,decodeURIComponent(url.pathname.slice(sitePath.length))||'index.html');
  if(!url.pathname.startsWith(sitePath)||!file.startsWith(dist+sep))throw Error();
  res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream'});res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}${sitePath}`;
const profile=await mkdtemp(join(tmpdir(),'sector-control-previews-'));
const chrome=spawn(chromePath,['--headless=new',`--user-data-dir=${profile}`,'--remote-debugging-port=0','--no-first-run','--no-sandbox','--mute-audio','--hide-scrollbars','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','about:blank'],{stdio:'ignore'});
let port;for(let i=0;i<150&&!port;i++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{await delay(100);}}
if(!port)throw Error('Chrome did not start');
const target=(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let seq=0;const pending=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
const send=(method,params={})=>new Promise((ok,fail)=>{const id=++seq;pending.set(id,m=>m.error?fail(Error(method+': '+m.error.message)):ok(m.result));ws.send(JSON.stringify({id,method,params}));});
const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
const until=async(expression,ms=90000)=>{const end=Date.now()+ms;while(Date.now()<end){try{if(await evaluate(expression))return;}catch(e){if(!/context/.test(String(e)))throw e;}await delay(200);}throw Error('Timed out: '+expression);};
const viewport=(width,height)=>send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
const frames=()=>evaluate(`window.sectorRenderReview.state().frames`);

try{
 await send('Page.enable');await send('Runtime.enable');
 for(const map of maps){
  const shot=previewShots[map];
  await viewport(1280,720);
  const query=new URLSearchParams({map,view:shot.view,autoplay:'',renderReview:'',playtest:'',video:'0',clip:'120',duration:'120',quality:'high'});
  await send('Page.navigate',{url:base+'?'+query});
  await until(`document.querySelector('#primary')?.textContent.trim().startsWith('Begin')`);
  await evaluate(`document.querySelector('#primary').click()`);
  await until(`window.sectorRenderReview?.state().frames>=2`);
  for(let left=shot.ticks;left>0;left-=300)await evaluate(`window.sectorRenderReview.advance(${Math.min(300,left)})`);
  // Autoplay would walk the player off the viewpoint, so hold it still first.
  if(shot.survey)await evaluate(`(window.sectorRenderReview.manual(),window.sectorRenderReview.survey(${shot.view==='first'}${typeof shot.survey==='string'?','+JSON.stringify(shot.survey):''}))`);
  const at=await frames();
  await until(`window.sectorRenderReview.state().frames>=${at+3}`);
  await evaluate(`(()=>{const s=document.createElement('style');s.textContent='#ui,.playtest{visibility:hidden!important}';document.head.append(s);})()`);
  const settled=await frames();
  await until(`window.sectorRenderReview.state().frames>=${settled+2}`);
  const frame=Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64');
  // Downscale in the browser for a smooth result, then encode the card image.
  const path=`${sitePath}__previews/${map}.png`;
  generated.set(path,{type:'image/png',body:frame});
  generated.set(`${sitePath}__previews/${map}.html`,{type:'text/html; charset=utf-8',body:`<!doctype html><style>html,body{margin:0;overflow:hidden;background:#000}img{display:block;width:640px;height:360px}</style><img src="${path}">`});
  await viewport(640,360);
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}${sitePath}__previews/${map}.html`});
  await until(`document.readyState==='complete'&&[...document.images].every(i=>i.complete&&i.naturalWidth)`);
  const jpeg=Buffer.from((await send('Page.captureScreenshot',{format:'jpeg',quality:82})).data,'base64');
  await writeFile(join(out,map+'.jpg'),jpeg);
  console.log(JSON.stringify({map,bytes:jpeg.length}));
 }
}finally{ws.close();chrome.kill();server.close();await rm(profile,{recursive:true,force:true}).catch(()=>{});}
