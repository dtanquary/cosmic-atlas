/** Public-control tour invitation checks; Playwright setup: docs/validation.md. */
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.ATLAS_TEST_URL??'http://127.0.0.1:5173/',dir=process.env.ATLAS_TEST_OUTPUT??'.cache/tour-invitation';await mkdir(dir,{recursive:true});
const head=()=>execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const report={runId:'tour-invitation',sourceCommit:head(),checks:{},browsers:[],errors:[]};let scope='';
const check=(key,value)=>{report.checks[`${scope}:${key}`]=value;assert.ok(value,`${scope}: ${key}`)};
const progress=setInterval(()=>console.log(JSON.stringify({scope,checks:Object.keys(report.checks).length})),30000);
const ready=p=>p.waitForFunction(()=>!document.getElementById('visit-galaxy-button')?.hidden&&document.getElementById('galaxy-count')?.textContent==='14,140,375',null,{timeout:120000});
try{
 for(const engine of process.env.ATLAS_TEST_ENGINE?[process.env.ATLAS_TEST_ENGINE]:['chrome','webkit']){
  scope=engine;const browser=await (engine==='chrome'?chromium.launch({channel:'chrome',headless:true}):webkit.launch({headless:true}));
  try{
   const mobile=engine==='webkit',context=await browser.newContext({viewport:mobile?{width:402,height:874}:{width:1600,height:1000},isMobile:mobile,hasTouch:mobile});
   const makePage=async()=>{const p=await context.newPage();p.on('pageerror',e=>report.errors.push(`${engine}: ${e.message}`));return p};
   const act=(p,selector)=>mobile?p.locator(selector).tap():p.click(selector);
   const menu=async(p,selector)=>{if(mobile)await act(p,'#mobile-menu-button');await act(p,selector)};
   const p=await makePage();await p.goto(base);await ready(p);report.browsers.push(await p.evaluate(()=>navigator.userAgent));
   await act(p,'#visit-galaxy-button');await p.fill('#galaxy-query','Andromeda');await act(p,'#galaxy-results [role=option]');await p.waitForTimeout(1800);
   // Capture the clipboard call; camera/tour startup runs without test hooks.
   await p.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.__copiedLink=text}});
   await menu(p,'#share-button');await act(p,'#copy-link-button');const viewLink=await p.evaluate(()=>window.__copiedLink);check('viewLinkStillCarriesSelection',viewLink.includes('g=nearby:m31'));
   await act(p,'#copy-road-trip-button');const link=await p.evaluate(()=>window.__copiedLink);check('invitationHasOnlyRoute',link===`${new URL(base).origin}${new URL(base).pathname}#tour=road-trip`);check('copyDoesNotStartSenderTour',await p.locator('#tour-panel').isHidden());await p.screenshot({path:`${dir}/${engine}-share.png`});await p.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw new Error('Injected unavailable clipboard')}});await act(p,'#copy-road-trip-button');await p.locator('#share-link').waitFor({state:'visible'});check('invitationCopyFallback',await p.inputValue('#share-link')===link);await p.close();
   const receiver=await makePage();await receiver.goto(link);await receiver.waitForFunction(()=>document.getElementById('tour-stop-title')?.textContent==='The Milky Way'&&document.getElementById('tour-status')?.textContent.startsWith('Arrived'),null,{timeout:120000});
   check('startsAtMilkyWay',await receiver.locator('#tour-progress').textContent()==='Guided tour · 1 / 10');check('autoplayStarts',await receiver.locator('#tour-play').getAttribute('aria-pressed')==='true');check('invitationConsumed',new URL(receiver.url()).hash==='');await receiver.screenshot({path:`${dir}/${engine}-arrival.png`});
   await receiver.waitForFunction(()=>document.getElementById('tour-stop-title')?.textContent==='Large Magellanic Cloud',null,{timeout:30000});check('advancesWithoutInput',await receiver.locator('#tour-play').getAttribute('aria-pressed')==='true');
   await receiver.mouse.move(55,180);await receiver.mouse.down();await receiver.mouse.move(110,220,{steps:10});await receiver.mouse.up();check('inputPausesInvitedTour',await receiver.locator('#tour-play').getAttribute('aria-pressed')==='false');await act(receiver,'#tour-exit');
   await receiver.reload();await ready(receiver);await receiver.waitForTimeout(400);check('reloadDoesNotRestartTour',await receiver.locator('#tour-panel').isHidden());await receiver.evaluate(()=>location.hash='tour=road-trip');await receiver.waitForFunction(()=>document.getElementById('tour-stop-title')?.textContent==='The Milky Way'&&!document.getElementById('tour-panel').hidden);check('invitationWorksInOpenTab',await receiver.locator('#tour-play').getAttribute('aria-pressed')==='true'&&new URL(receiver.url()).hash==='');await act(receiver,'#tour-exit');await receiver.close();
   const ordinary=await makePage();await ordinary.goto(viewLink);await ordinary.waitForFunction(()=>document.getElementById('object-name')?.textContent==='Andromeda',null,{timeout:120000});check('ordinaryViewRestores',await ordinary.locator('#tour-panel').isHidden());await ordinary.close();
   const unknown=await makePage();await unknown.goto(`${base}#tour=missing`);await ready(unknown);check('unknownRouteStaysOverview',await unknown.locator('#tour-panel').isHidden());await unknown.close();
   // Hold the name request after atlas readiness; explicit navigation must win
   // even when the asynchronous name load eventually completes.
   const delayed=await makePage();let release,seen;const gate=new Promise(r=>{release=r}),requested=new Promise(r=>{seen=r});
   await delayed.route('**/galaxy-search.json',async route=>{seen();await gate;await route.continue()});await delayed.goto(link);await Promise.race([requested,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Name request never started')),20000))]);await ready(delayed);
   await menu(delayed,'#reset-button');const response=delayed.waitForResponse(r=>r.url().endsWith('/galaxy-search.json'));release();await response;await delayed.waitForFunction(()=>document.getElementById('search-status')?.textContent.startsWith('Popular & nearby'));await delayed.waitForTimeout(500);
   check('navigationCancelsPendingStart',await delayed.locator('#tour-panel').isHidden());await delayed.close();
  }finally{await browser.close()}
 }
 scope='all';check('sourceUnchanged',head()===report.sourceCommit);check('noBrowserErrors',report.errors.length===0);report.status='complete';
}catch(error){report.status='failed';report.failure=error.stack??String(error);process.exitCode=1}
finally{clearInterval(progress);await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:Object.keys(report.checks).length,failed:Object.entries(report.checks).filter(([,v])=>!v),errors:report.errors,failure:report.failure}))}
