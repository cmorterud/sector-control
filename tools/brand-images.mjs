// Generates the browser icons and the social preview from a production build.
//   node tools/brand-images.mjs [dist] [out]
// Icons are rasterized from public/favicon.svg. The social preview is a real
// Verdun battle (fixed seed, fixed tick) with the title composited over it.
// Needs Chrome with a GPU for a representative shot: CHROME_PATH overrides.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,extname,sep} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const dist=resolve(process.argv[2]??'dist'),out=resolve(process.argv[3]??'public');
const shot={map:'verdun',view:process.env.SHOT_VIEW??'third',ticks:Number(process.env.SHOT_TICKS??540),quality:'high'};
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
const profile=await mkdtemp(join(tmpdir(),'sector-control-brand-'));
const chrome=spawn(chromePath,['--headless=new',`--user-data-dir=${profile}`,'--remote-debugging-port=0','--no-first-run','--mute-audio','--hide-scrollbars','--disable-background-timer-throttling','--disable-renderer-backgrounding','about:blank'],{stdio:'ignore'});
let port;for(let i=0;i<150&&!port;i++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{await delay(100);}}
if(!port)throw Error('Chrome did not start');
const target=(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let seq=0;const pending=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
const send=(method,params={})=>new Promise((ok,fail)=>{const id=++seq;pending.set(id,m=>m.error?fail(Error(method+': '+m.error.message)):ok(m.result));ws.send(JSON.stringify({id,method,params}));});
const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
const until=async(expression,ms=60000)=>{const end=Date.now()+ms;while(Date.now()<end){try{if(await evaluate(expression))return;}catch(e){if(!/context/.test(String(e)))throw e;}await delay(200);}throw Error('Timed out: '+expression);};
const viewport=(width,height,scale=1)=>send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false});
const capture=async()=>Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64');
let pages=0;
const show=async(html)=>{const path=`${sitePath}__brand/${++pages}.html`;generated.set(path,{type:'text/html; charset=utf-8',body:html});await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}${path}`});await until(`document.readyState==='complete'&&[...document.images].every(i=>i.complete)`);await evaluate('document.fonts.ready.then(()=>true)');};

await (async()=>{try{
 // Icons: transparent outside the rounded square.
 const svg=await readFile(resolve('public/favicon.svg'),'utf8');
 await send('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
 for(const [name,size] of [['favicon-32.png',32],['apple-touch-icon.png',180],['icon-192.png',192],['icon-512.png',512]]){
  await viewport(size,size);
  await show(`<style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`);
  await writeFile(join(out,name),await capture());
 }
 await send('Emulation.setDefaultBackgroundColorOverride',{});

 // The battle shot, at twice the preview's resolution for a sharp downscale.
 await viewport(1200,630,2);
 const query=new URLSearchParams({map:shot.map,view:shot.view,autoplay:'',renderReview:'',playtest:'',video:'0',clip:'120',duration:'120',quality:shot.quality});
 await send('Page.navigate',{url:base+'?'+query});
 await until(`document.querySelector('#primary')?.textContent.trim().startsWith('Begin')`,90000);
 await evaluate(`document.querySelector('#primary').click()`);
 await until(`window.sectorRenderReview?.state().frames>=2`);
 for(let left=shot.ticks;left>0;left-=300)await evaluate(`window.sectorRenderReview.advance(${Math.min(300,left)})`);
 const frames=await evaluate(`window.sectorRenderReview.state().frames`);
 await until(`window.sectorRenderReview.state().frames>=${frames+3}`);
 await evaluate(`(()=>{const s=document.createElement('style');s.textContent='#ui,.playtest{visibility:hidden!important}';document.head.append(s);})()`);
 await delay(300);
 const battle=await capture();
 if(process.env.SHOT_ONLY){await writeFile(join(out,'social-shot.png'),battle);return;}

 // Title band in the briefing screen's style, over the shot.
 generated.set(`${sitePath}__brand/shot.png`,{type:'image/png',body:battle});
 await viewport(1200,630);
 await show(`<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#202c2c}
  body{font-family:Inter,"Helvetica Neue",Arial,sans-serif;color:#edf0e7;position:relative}
  /* The soldier stands mid-frame; shift the shot so they clear the title. */
  .shot{position:absolute;top:0;left:240px;width:1200px;height:630px}
  .band{position:absolute;inset:0;background:linear-gradient(90deg,#152424 0,#152424 290px,#152424d9 420px,#15242470 580px,#15242400 760px)}
  .copy{position:absolute;left:64px;top:0;bottom:0;width:470px;display:flex;flex-direction:column;justify-content:center}
  .eyebrow{font-size:17px;letter-spacing:.2em;font-weight:700;color:#efd07b}
  h1{margin:14px 0 18px;font-size:92px;line-height:.92;font-weight:800;letter-spacing:-.02em}
  p{margin:0;font-size:30px;line-height:1.25;color:#d5d9ce}
  .sectors{display:flex;gap:12px;margin:34px 0 0}
  .sector{width:56px;padding:9px 0 8px;text-align:center;font-weight:800;font-size:24px;background:#152424d9;border:1px solid #d3dfd333;border-radius:6px}
  .sector i{display:block;height:5px;margin:8px 9px 0;border-radius:3px;background:#d3dfd333}
  .blue{color:#69c5ef}.blue i{background:#69c5ef}.red{color:#f38e7b}.red i{background:#f38e7b}
  .contested{color:#efd07b}.contested i{background:linear-gradient(90deg,#69c5ef 50%,#f38e7b 50%)}
  .url{position:absolute;left:64px;bottom:34px;font-size:19px;color:#b8c4c0;letter-spacing:.02em}
  .url b{color:#edf0e7;font-weight:700}
 </style>
 <img class="shot" src="${sitePath}__brand/shot.png"><div class="band"></div>
 <div class="copy"><div class="eyebrow">LOCAL OPERATIONS</div><h1>SECTOR<br>CONTROL</h1>
  <p>Squad infantry battles for capture sectors.</p>
  <div class="sectors"><div class="sector blue">A<i></i></div><div class="sector contested">B<i></i></div><div class="sector red">C<i></i></div></div></div>
 <div class="url"><b>Free in your browser</b> · codymorterud.com/sector-control</div>`);
 await writeFile(join(out,'social-preview.png'),await capture());
 console.log('Wrote icons and social preview to',out);
}finally{ws.close();chrome.kill();server.close();await rm(profile,{recursive:true,force:true}).catch(()=>{});}})();
