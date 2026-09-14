/** Production-package benchmark through public controls. No instrumentation ships.
 * See docs/performance.md for metrics, limitations and reproduction. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.ATLAS_TEST_URL??'http://127.0.0.1:4180/';
const output=process.env.ATLAS_TEST_OUTPUT??'.cache/performance/baseline';
const soakSeconds=Number(process.env.ATLAS_SOAK_SECONDS??600);
assert.ok(Number.isFinite(soakSeconds)&&soakSeconds>=0&&soakSeconds<=1800,'Soak must be 0–1800 seconds');
const selected=(process.env.ATLAS_BENCH_CASES??'chrome-cold,chrome-warm,chrome-slow,webkit-phone').split(',');
const allowed=['chrome-cold','chrome-warm','chrome-slow','webkit-phone'];
assert.ok(selected.every(name=>allowed.includes(name)),'Unknown benchmark case');
assert.ok(!selected.includes('chrome-warm')||selected.includes('chrome-cold'),'Warm follows cold in the same context');
await mkdir(output,{recursive:true});
const head=()=>execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const digest=value=>createHash('sha256').update(value).digest('hex');
async function bundle(){
 const html=await (await fetch(base)).text(),path=html.match(/<script[^>]*src="([^"]+)"/)?.[1];
 assert.ok(path,'Production entry script missing');
 return {path,sha256:digest(Buffer.from(await (await fetch(new URL(path,base))).arrayBuffer()))};
}
const report={version:1,sourceCommit:head(),startedAt:new Date().toISOString(),bundle:await bundle(),status:'running',cases:[],physicalDevice:false};
let current='initializing';
const progress=setInterval(()=>console.log(JSON.stringify({case:current,completed:report.cases.length})),30000);

/** Count actual GL draws inside app animation callbacks. Never add an animation
 * loop, force a redraw, read pixels, or synchronously wait for the GPU. */
function instrument(){
 const state=window.__journey={frames:[],samples:[],transitions:[],longTasks:[],draws:0,gesture:false,excluded:false,last:null,firstCoarseMs:null};
 window.__atlasTools={};
 Object.defineProperty(document,'modelContext',{configurable:true,value:{registerTool(tool){window.__atlasTools[tool.name]=tool.execute}}});
 for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
  const original=WebGL2RenderingContext.prototype[name];
  WebGL2RenderingContext.prototype[name]=function(...args){state.draws++;return original.apply(this,args)};
 }
 const raf=window.requestAnimationFrame.bind(window);
 window.requestAnimationFrame=callback=>raf(time=>{
  const before=state.draws,start=performance.now();callback(time);
  const calls=state.draws-before;if(!calls||state.excluded){state.last=null;return}
  const status=document.getElementById('tour-status')?.textContent??'';
  const title=document.getElementById('tour-stop-title')?.textContent??'overview';
  const kind=state.gesture?'gesture':status.startsWith('Travelling')?'travel':'settling-or-idle';
  const key=`${title}:${kind}`;
  state.frames.push({time,interval:state.last?.key===key?time-state.last.time:null,cpuMs:performance.now()-start,calls,title,kind});
  state.last={key,time};
 });
 if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>{
  for(const entry of list.getEntries())state.longTasks.push({start:entry.startTime,duration:entry.duration});
 }).observe({type:'longtask',buffered:true});
 const text=id=>document.getElementById(id)?.textContent??'';
 const count=id=>Number(text(id).replace(/[^0-9]/g,''));
 let previous='';
 setInterval(()=>{
  const now=performance.now(),detail=text('detail-status'),status=text('tour-status'),title=text('tour-stop-title');
  if(state.firstCoarseMs===null&&count('drawn-count')>0&&document.getElementById('loading')?.hidden===true)state.firstCoarseMs=now;
  const diagnostic=text('diagnostics');
  const values=diagnostic.match(/([\d.]+) draw calls · ([\d.]+) close-up models · ([\d.]+) MiB managed/);
  state.samples.push({time:now,title,status,detail,loaded:count('loaded-count'),submitted:count('drawn-count'),pending:Number(detail.match(/loading (\d+) chunks/)?.[1]??0),managedMiB:values?Number(values[3]):null,models:values?Number(values[2]):null});
  const key=`${title}:${status}`;
  if(key!==previous){state.transitions.push({time:now,title,status});previous=key}
 },250);
}
const distribution=values=>{
 const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
 if(!sorted.length)return {samples:0};
 const mean=sorted.reduce((a,b)=>a+b,0)/sorted.length;
 return {samples:sorted.length,meanMs:mean,p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],p99Ms:sorted[Math.floor(sorted.length*.99)],maxMs:sorted.at(-1),over50Ms:sorted.filter(v=>v>50).length,over100Ms:sorted.filter(v=>v>100).length};
};
function summarize(raw){
 const movement=raw.frames.filter(frame=>frame.kind!=='settling-or-idle');
 const lastTime=raw.samples.at(-1)?.time??0;
 return {firstCoarseMs:raw.firstCoarseMs,movementFrames:distribution(movement.map(f=>f.interval)),renderCallbackCpu:distribution(movement.map(f=>f.cpuMs)),earlyMovement:distribution(movement.filter(f=>f.time<120000).map(f=>f.interval)),lateMovement:distribution(movement.filter(f=>f.time>lastTime-120000).map(f=>f.interval)),peakManagedMiB:Math.max(0,...raw.samples.map(s=>s.managedMiB??0)),peakModels:Math.max(0,...raw.samples.map(s=>s.models??0)),peakPending:Math.max(0,...raw.samples.map(s=>s.pending)),longTasks:raw.longTasks.length,blockedSamples:raw.samples.filter(s=>s.detail.includes('memory limit')).length};
}
async function runCase(browser,context,name,{mobile=false,slow=false,soak=0}={}){
 current=name;const page=await context.newPage(),errors=[],requests=[];let cdp;
 const finished=new Set();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfinished',request=>{
  const pending=(async()=>{try{const sizes=await request.sizes();requests.push({path:new URL(request.url()).pathname,bodyBytes:sizes.responseBodySize,timing:request.timing()})}catch{}})();
  finished.add(pending);pending.finally(()=>finished.delete(pending));
 });
 if(slow){cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:5_000_000/8,uploadThroughput:1_000_000/8,connectionType:'cellular4g'})}
 await page.addInitScript(instrument);
 const act=selector=>mobile?page.locator(selector).tap():page.click(selector);
 const result={name,network:slow?'Chromium emulation: 5 Mbps down, 1 Mbps up, 80 ms latency':'local production preview, unthrottled',viewport:page.viewportSize(),soakSeconds:soak,stops:[],errors};
 try{
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>document.getElementById('loading')?.hidden&&!document.getElementById('visit-galaxy-button')?.hidden&&Number(document.getElementById('drawn-count')?.textContent.replaceAll(',',''))>0,null,{timeout:120000});
  await page.keyboard.press('F8');
  result.environment=await page.evaluate(()=>{const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),drawingSize:[canvas.width,canvas.height],devicePixelRatio,galaxies:document.getElementById('galaxy-count').textContent,minimumOpacity:document.getElementById('minimum-opacity').value}});
  assert.equal(result.environment.galaxies,'14,140,375');assert.equal(result.environment.minimumOpacity,'0.5');
  async function screenshot(label){
   await page.evaluate(()=>window.__journey.excluded=true);
   await page.screenshot({path:`${output}/${name}-${label}.png`});
   await page.waitForTimeout(250);await page.evaluate(()=>{window.__journey.excluded=false;window.__journey.last=null});
  }
  async function start(){await act('#tours-button');await act('[data-tour="road-trip"]')}
  const started=await page.evaluate(()=>performance.now());await start();
  for(let index=0;index<10;index++){
   await page.waitForFunction(index=>document.getElementById('tour-progress').textContent===`Guided tour · ${index+1} / 10`&&document.getElementById('tour-status').textContent.startsWith('Arrived'),index,{timeout:120000});
   const arrival=await page.evaluate(()=>({time:performance.now(),title:document.getElementById('tour-stop-title').textContent,detail:document.getElementById('detail-status').textContent}));
   await page.waitForTimeout(1500);await screenshot(`stop-${index+1}`);result.stops.push(arrival);
  }
  await page.waitForFunction(()=>document.getElementById('tour-status').textContent.startsWith('Finished'),null,{timeout:30000});
  result.tourDurationMs=await page.evaluate(started=>performance.now()-started,started);
  console.log(JSON.stringify({case:name,tourComplete:true,stops:result.stops.length}));
  if(soak){
   const until=Date.now()+soak*1000;result.soakStartedMs=await page.evaluate(()=>performance.now());let lastGesture='';
   await act('#tour-exit');await start();
   while(Date.now()<until){
    const state=await page.evaluate(()=>({title:document.getElementById('tour-stop-title').textContent,status:document.getElementById('tour-status').textContent}));
    if(state.status.startsWith('Finished')){await act('#tour-exit');await start();lastGesture=''}
    else if(state.status.startsWith('Arrived')&&['Andromeda','Coma cluster'].includes(state.title)&&lastGesture!==state.title){
     lastGesture=state.title;await act('#tour-play');await page.evaluate(()=>window.__journey.gesture=true);
     // Public mouse orbit on desktop; phone benchmarking here uses native tour
     // travel. Actual phone touch correctness belongs to check-mobile-ui.mjs.
     await page.mouse.move(300,240);await page.mouse.down();
     for(let step=0;step<180&&Date.now()<until;step++){await page.mouse.move(300+Math.sin(step/25)*100,240+Math.cos(step/25)*45);await page.waitForTimeout(33)}
     await page.mouse.up();await page.evaluate(()=>{window.__journey.gesture=false;window.__journey.last=null});await act('#tour-play');
    }
    await page.waitForTimeout(250);
   }
   await act('#tour-play');result.soakActualSeconds=(await page.evaluate(()=>performance.now())-result.soakStartedMs)/1000;
  }
  const raw=await page.evaluate(()=>window.__journey);result.summary=summarize(raw);
  for(const stop of result.stops){
   const next=raw.transitions.find(t=>t.time>stop.time&&t.title!==stop.title);
   const settled=raw.samples.find(s=>s.time>=stop.time&&s.time<(next?.time??Infinity)&&s.pending===0);
   stop.globalQueueSettledAfterMs=settled?settled.time-stop.time:null;
  }
  await Promise.allSettled([...finished]);
  result.responses={count:requests.length,bodyBytes:requests.reduce((n,r)=>n+r.bodyBytes,0),workerPointResponses:requests.filter(r=>/points-.*\.bin|\/points\//.test(r.path)).length};
  assert.deepEqual(errors,[]);result.status='complete';
  await writeFile(`${output}/${name}-raw.json`,JSON.stringify({instrumentation:raw,requests},null,2)+'\n');
 }catch(error){result.status='failed';result.failure=error.stack;throw error}
 finally{report.cases.push(result);await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');await cdp?.detach();await page.close()}
 return result;
}
try{
 if(selected.some(name=>name.startsWith('chrome'))){
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
   const context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1});
   if(selected.includes('chrome-cold'))await runCase(browser,context,'chrome-cold',{soak:soakSeconds});
   if(selected.includes('chrome-warm'))await runCase(browser,context,'chrome-warm');
   await context.close();
   if(selected.includes('chrome-slow')){const slow=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1});await runCase(browser,slow,'chrome-slow',{slow:true});await slow.close()}
  }finally{await browser.close()}
 }
 if(selected.includes('webkit-phone')){
  const browser=await webkit.launch({headless:true});
  try{const context=await browser.newContext({viewport:{width:402,height:874},deviceScaleFactor:3,isMobile:true,hasTouch:true});await runCase(browser,context,'webkit-phone',{mobile:true});await context.close()}finally{await browser.close()}
 }
 assert.deepEqual(await bundle(),report.bundle,'Production bundle changed during baseline');
 report.status='complete';
}catch(error){report.status='failed';report.failure=error.stack;process.exitCode=1}
finally{clearInterval(progress);report.finishedAt=new Date().toISOString();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))}
