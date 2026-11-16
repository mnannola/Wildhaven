import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';

const label=process.argv[2]??'trial',port=9287,sitePort=5189;
const browserPath=process.env.PERF_BROWSER??['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>existsSync(p));if(!browserPath)throw Error('Set PERF_BROWSER to a Chromium browser executable.');
for(const candidate of [port,sitePort])await new Promise((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(candidate,'127.0.0.1',()=>server.close(resolve));});
const profile=join(tmpdir(),'wildhaven-performance-browser');mkdirSync(profile,{recursive:true});
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(sitePort),'--strictPort'],{windowsHide:true,stdio:'ignore'});
const edge=spawn(browserPath,['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--disable-extensions','--disable-background-networking','--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader','--window-size=1440,1000','about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;const pending=new Map();let nextId=0;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(url){for(let i=0;i<100;i++){try{const r=await fetch(url);if(r.ok)return await r.json();}catch{}await pause(100);}throw Error('Timed out: '+url);}
function cdp(method,params={}){return new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},120000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
try{
 const pages=await waitFor(`http://127.0.0.1:${port}/json`),page=pages.find(p=>p.type==='page');socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});socket.onmessage=event=>{const message=JSON.parse(event.data),p=pending.get(message.id);if(p){pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}};
 await cdp('Page.enable');await cdp('Runtime.enable');
 await cdp('Page.navigate',{url:`http://127.0.0.1:${sitePort}`});
 for(let i=0;i<200;i++){try{if(await evaluate("!!document.querySelector('canvas')"))break;}catch{}await pause(100);}
 const results=[];
 for(const count of [50,100,200])for(const speed of [0,1,5]){
  const result=await evaluate(`(async()=>{const {bridge}=await import('/src/game.ts'),{World,W,H}=await import('/src/sim.ts');bridge.speed=0;bridge.world=new World(4721);for(let i=0;i<${count};i++)bridge.world.spawn(i<${count}*.85?'deer':i<${count}*.95?'wolf':'bear',2+bridge.world.random()*(W-4),2+bridge.world.random()*(H-4));bridge.selected=0;bridge.selectedRiver=0;bridge.onChange();bridge.speed=${speed};await new Promise(r=>setTimeout(r,1000));const intervals=[];const began=performance.now();let previous=began;return await new Promise(resolve=>{function frame(now){intervals.push(now-previous);previous=now;if(now-began<6000)requestAnimationFrame(frame);else {const sorted=[...intervals].sort((a,b)=>a-b),elapsed=now-began;resolve({count:${count},speed:${speed},frames:intervals.length,elapsedMs:elapsed,fps:intervals.length*1000/elapsed,p95FrameMs:sorted[Math.floor(sorted.length*.95)],maxFrameMs:Math.max(...intervals),renderer:document.querySelector('canvas')?.getAttribute('width'),survivors:bridge.world.animals.filter(a=>a.alive).length});}}requestAnimationFrame(frame);});})()`);
  results.push(result);console.log(JSON.stringify(result));
 }
 mkdirSync('performance-results',{recursive:true});writeFileSync(`performance-results/browser-${label}.json`,JSON.stringify({label,environment:'Headless Edge with SwiftShader software WebGL, 1440x1000 window',results},null,2)+'\n');
}finally{try{if(socket?.readyState===WebSocket.OPEN)await cdp('Browser.close');}catch{}socket?.close();edge.kill();vite.kill();}
