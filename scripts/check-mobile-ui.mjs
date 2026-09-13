/** Real-browser phone journeys. Install Playwright separately as documented in
 * docs/validation.md; no browser automation code ships in the application. */
import {writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const modulePath=process.env.PLAYWRIGHT_MODULE;
const {chromium,webkit}=await import(modulePath?pathToFileURL(modulePath).href:'playwright');
const base=process.env.ATLAS_TEST_URL??'http://127.0.0.1:5173/';
const dir=process.env.ATLAS_TEST_OUTPUT??'.cache/mobile-ui/checks';await mkdir(dir,{recursive:true});
const head=()=>execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const report={runId:'mobile-ui',sourceCommit:head(),checks:{},browsers:[],errors:[]};
let scope='';const check=(name,value)=>{report.checks[`${scope}:${name}`]=value;assert.ok(value,`${scope}: ${name}`)};
const engines=process.env.ATLAS_TEST_ENGINE?[process.env.ATLAS_TEST_ENGINE]:['chrome','webkit'];
const progress=setInterval(()=>console.log(JSON.stringify({scope,checks:Object.keys(report.checks).length})),30000);
try{
 for(const engine of engines){
  const browser=await (engine==='chrome'?chromium.launch({channel:'chrome',headless:true}):webkit.launch({headless:true}));
  try{
   const page=await browser.newPage({viewport:{width:402,height:874},deviceScaleFactor:1,isMobile:true,hasTouch:true});
   page.on('pageerror',e=>report.errors.push(`${engine}: ${e.message}`));
   page.on('console',m=>{if(m.type()==='error')report.errors.push(`${engine}: ${m.text()}`)});
   scope=engine;await page.goto(base);await page.waitForFunction(()=>!document.getElementById('visit-galaxy-button')?.hidden&&document.querySelector('#galaxy-count')?.textContent!=='—',null,{timeout:120000});await page.evaluate(()=>document.fonts.ready);
   report.browsers.push(await page.evaluate(()=>{const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),count:document.getElementById('galaxy-count').textContent}}));
   const tap=selector=>page.locator(selector).tap();
   const close=selector=>tap(`${selector} [data-close]`);
   const menu=async selector=>{await tap('#mobile-menu-button');await tap(selector)};
   const visit=async name=>{await tap('#visit-galaxy-button');await page.fill('#galaxy-query',name);await page.locator('#galaxy-results [role=option]').first().tap();await page.waitForFunction(name=>document.getElementById('object-name').textContent.includes(name)&&!document.getElementById('inspector').hidden,name);await page.waitForTimeout(1700)};
   const mapDrag=async()=>{await page.mouse.move(55,170);await page.mouse.down();await page.mouse.move(90,205,{steps:10});await page.mouse.up();await page.waitForTimeout(100)};
   const screen=label=>page.screenshot({path:`${dir}/${engine}-${label}.png`});
   const reachable=async selector=>page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width>=43.9&&r.height>=43.9&&x>0&&x<innerWidth&&y>0&&y<innerHeight&&el.contains(document.elementFromPoint(x,y))});
   const savedCamera=async()=>{await menu('#share-button');await page.fill('#view-name','Touch regression');await tap('#save-view-button');const hash=await page.evaluate(()=>JSON.parse(localStorage.getItem('atlas-saved-views')).views[0].hash);await close('#share-dialog');return new URLSearchParams(hash.slice(1))};
   check('responsiveLayout',await page.locator('html').evaluate(e=>e.hasAttribute('data-mobile')));
   for(const id of ['visit-galaxy-button','observer-button','tours-button','mobile-menu-button'])check(`${id}TouchTarget`,await reachable(`#${id}`));
   await visit('Andromeda');check('compactSelection',(await page.locator('#inspector').boundingBox()).height<=160);check('distanceKept',!!(await page.locator('#inspector .mobile-sheet-summary').textContent()));await screen('galaxy-compact');
   await tap('#inspector .mobile-sheet-toggle');check('boundedDetails',(await page.locator('#inspector').boundingBox()).height<=480);check('detailsVisible',await page.locator('#profile-appearance').isVisible());check('exactIdentityAvailable',await page.locator('#object-kind').isVisible()&&(await page.locator('#object-kind').textContent()).includes('nearby:m31'));
   await page.locator('#inspector .inspector-body').evaluate(e=>e.scrollTop=e.scrollHeight);check('detailsScrollable',await page.locator('#inspector .inspector-body').evaluate(e=>e.scrollTop>0));check('focusStaysReachable',await reachable('#focus-button'));check('closeStaysReachable',await reachable('#close-inspector'));await screen('galaxy-details');
   await mapDrag();check('mapDragFoldsDetails',await page.locator('#inspector .mobile-sheet-toggle').getAttribute('aria-expanded')==='false');
   // Chromium CDP injects real touchscreen input into OrbitControls. Camera
   // evidence comes through the public Save view flow, not private test hooks.
   if(engine==='chrome'){
    const cdp=await page.context().newCDPSession(page);
    const gesture=async(from,to)=>{const points=p=>p.map(([x,y],id)=>({x,y,id,radiusX:2,radiusY:2}));await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(from)});for(let n=1;n<=16;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(from.map(([x,y],i)=>[x+(to[i][0]-x)*n/16,y+(to[i][1]-y)*n/16]))});await page.waitForTimeout(16)}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(600)};
    const before=await savedCamera();await gesture([[110,280]],[[265,350]]);const orbited=await savedCamera();check('oneFingerOrbits',before.get('c')!==orbited.get('c')&&before.get('t')===orbited.get('t'));
    const distance=p=>Math.hypot(...p.get('c').split(',').map(Number));await gesture([[150,300],[245,300]],[[100,300],[295,300]]);const zoomed=await savedCamera();check('pinchZoomsCloser',distance(zoomed)<distance(orbited)*.8);
    await gesture([[120,260],[240,260]],[[155,310],[275,310]]);const panned=await savedCamera();check('twoFingersPan',panned.get('t')!==zoomed.get('t'));check('touchKeepsSelection',panned.get('g')==='nearby:m31');await cdp.detach();
   }
   await tap('#mobile-menu-button');await screen('menu');await tap('#help-button');check('oneModalAtATime',await page.locator('dialog[open]').count()===1);await screen('settings');await page.locator('summary').filter({hasText:'Galaxies'}).tap();await page.selectOption('#model-display','focused');await close('#help-dialog');await menu('#help-button');check('settingsRetained',await page.inputValue('#model-display')==='focused');await page.selectOption('#model-display','automatic');await close('#help-dialog');
   await menu('#measure-button');check('measureCanStart',await reachable('#close-measure'));await tap('#close-measure');check('measureCanEnd',await page.locator('#measurement').isHidden());await tap('#close-inspector');await tap('#observer-button');check('compactHome',(await page.locator('#home-inspector').boundingBox()).height<=165);check('sunActionReachable',await reachable('#home-solar-view'));await tap('#home-solar-view');await screen('home');await tap('#close-home');
   await menu('#reset-button');await menu('#cosmic-horizon-button');await page.locator('#cosmic-context').waitFor({state:'visible'});check('compactCosmic',(await page.locator('#cosmic-context').boundingBox()).height<=80);await tap('#cosmic-context .mobile-sheet-toggle');check('cosmicFrameReachable',await reachable('#cosmic-scale-button'));await tap('#cosmic-scale-button');await page.waitForTimeout(1500);await screen('cosmic');await tap('#cosmic-context .mobile-cosmic-header .icon-button');
   await menu('#fly-button');check('touchFlightAvailable',await reachable('#auto-flight-button'));await tap('#auto-flight-button');check('autoFlyStarts',await page.locator('#auto-flight-button').getAttribute('aria-pressed')==='true');await tap('.mobile-flight-close');check('flightCanEnd',await page.locator('#flight-controls').isHidden()&&await page.locator('#auto-flight-button').getAttribute('aria-pressed')==='false');
   await tap('#tours-button');await tap('[data-tour="road-trip"]');await page.waitForFunction(()=>/^(Arrived|Paused)/.test(document.getElementById('tour-status').textContent),null,{timeout:40000});if(await page.locator('#tour-play').getAttribute('aria-pressed')==='true')await tap('#tour-play');
   check('compactTour',(await page.locator('#tour-panel').boundingBox()).height<=190);await tap('#tour-panel .mobile-sheet-toggle');await screen('tour-details');await tap('#tour-next');await page.waitForFunction(()=>document.getElementById('tour-stop-title').textContent==='Large Magellanic Cloud'&&/^Paused/.test(document.getElementById('tour-status').textContent),null,{timeout:40000});check('nextStopCollapsesDescription',await page.locator('#tour-panel .mobile-sheet-toggle').getAttribute('aria-expanded')==='false');await screen('tour-compact');
   await tap('#tour-play');await page.touchscreen.tap(55,200);check('touchPausesTour',await page.locator('#tour-play').getAttribute('aria-pressed')==='false');await tap('#tour-exit');check('tourExitReachable',await page.locator('#tour-panel').isHidden());
   await visit('Small Magellanic Cloud');check('newDetailsStartAtTop',await page.locator('#inspector .inspector-body').evaluate(e=>e.scrollTop===0));
   for(const [width,height] of [[375,812],[430,932],[874,402],[402,874]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(100);scope=`${engine}-${width}x${height}`;
    check('noHorizontalOverflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));check('toolbarAccessible',await reachable('#visit-galaxy-button'));check('selectionActionsReachable',await reachable('#focus-button'));
    await tap('#inspector .mobile-sheet-toggle');check('expandedCloseReachable',await reachable('#close-inspector'));await screen(`${width}x${height}`);await mapDrag();
   }
   scope=engine;
   await tap('#visit-galaxy-button');await page.fill('#galaxy-query','M33');await close('#visit-dialog');await tap('#visit-galaxy-button');await page.fill('#galaxy-query','M32');await page.locator('#galaxy-results [role=option]').first().tap();await page.waitForFunction(()=>document.getElementById('object-name').textContent==='M32');check('searchReopensWithoutStaleVisit',true);
   // Reduced visual viewport simulation checks keyboard placement; this is not
   // a claim that a physical iOS software keyboard was exercised.
   await tap('#visit-galaxy-button');await page.setViewportSize({width:402,height:480});await page.fill('#galaxy-query','Andromeda');check('searchKeyboardCloseReachable',await reachable('#visit-dialog [data-close]'));check('searchInputAtLeast16px',await page.locator('#galaxy-query').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));await screen('short-search');await close('#visit-dialog');await page.setViewportSize({width:402,height:874});
   await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw new Error('Injected unavailable clipboard')}});await menu('#share-button');await tap('#copy-link-button');await page.locator('#share-link').waitFor({state:'visible'});check('clipboardFallbackAvailable',(await page.inputValue('#share-link')).includes('#t='));check('fallbackLinkAtLeast16px',await page.locator('#share-link').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));await close('#share-dialog');
   await page.reload();await page.waitForFunction(()=>!document.getElementById('visit-galaxy-button')?.hidden);check('preferencePersists',await page.inputValue('#model-display')==='automatic');
   await page.close();
   // Wide layout uses the same original DOM before/after repeated phone widths.
   scope=`${engine}-desktop`;
   const desktop=await browser.newPage({viewport:{width:1600,height:1000}});await desktop.goto(base);await desktop.waitForFunction(()=>!document.getElementById('visit-galaxy-button')?.hidden);await desktop.evaluate(()=>document.fonts.ready);
   const structure=()=>desktop.evaluate(()=>Object.fromEntries(['visit-galaxy-button','observer-button','tours-button','orbit-button','units','model-display','show-cosmic-horizon','tour-stop-title'].map(id=>{const e=document.getElementById(id);return [id,{parent:e.parentElement.id||e.parentElement.className,previous:e.previousElementSibling?.id||e.previousElementSibling?.className}]})));
   const initial=await structure();check('desktopHasOriginalLayout',!(await desktop.locator('html').evaluate(e=>e.hasAttribute('data-mobile'))));
   for(let n=0;n<2;n++){await desktop.setViewportSize({width:390,height:844});await desktop.waitForFunction(()=>document.documentElement.hasAttribute('data-mobile'));await desktop.setViewportSize({width:1600,height:1000});await desktop.waitForFunction(()=>!document.documentElement.hasAttribute('data-mobile'))}
   check('originalControlsRestored',JSON.stringify(initial)===JSON.stringify(await structure()));check('noDuplicateIds',await desktop.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return new Set(ids).size===ids.length}));check('desktopMenuHidden',await desktop.locator('#mobile-nav').isHidden());
   await desktop.click('#visit-galaxy-button');await desktop.fill('#galaxy-query','Andromeda');await desktop.locator('#galaxy-results [role=option]').first().click();await desktop.waitForTimeout(1800);check('desktopDetailsExpanded',await desktop.locator('#profile-appearance').isVisible());await desktop.screenshot({path:`${dir}/${engine}-desktop.png`});
   report[`${engine}DesktopGeometry`]=await desktop.evaluate(()=>Object.fromEntries(['.topbar','.rail','.footer','#inspector','#focus-button','#close-inspector','#galaxy-count','#scale-label','#status'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,{x:r.x,y:r.y,width:r.width,height:r.height}]})));
   await desktop.close();
  }finally{await browser.close()}
 }
 scope='all';check('sourceUnchanged',head()===report.sourceCommit);check('noBrowserErrors',report.errors.length===0);report.status='complete';
}catch(error){report.status='failed';report.failure=error.stack??String(error);process.exitCode=1}
finally{clearInterval(progress);await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:Object.keys(report.checks).length,failed:Object.entries(report.checks).filter(([,v])=>!v),errors:report.errors,failure:report.failure}))}
