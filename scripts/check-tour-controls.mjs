/** Public-control acceptance for tour chapters, pacing, cues and return. */
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.ATLAS_TEST_URL??'http://127.0.0.1:4180/',dir=process.env.ATLAS_TEST_OUTPUT??'.cache/tour-controls';
await mkdir(dir,{recursive:true});
const report={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),status:'running',checks:{},errors:[]};
let scope='';const check=(name,value)=>{report.checks[`${scope}:${name}`]=value;assert.ok(value,`${scope}: ${name}`)};
const progress=setInterval(()=>console.log(JSON.stringify({scope,checks:Object.keys(report.checks).length})),30000);
try{
 for(const engine of ['chrome','webkit']){
  scope=engine;const mobile=engine==='webkit',browser=await (mobile?webkit.launch({headless:true}):chromium.launch({channel:'chrome',headless:true}));
  try{
   const page=await browser.newPage({viewport:mobile?{width:402,height:874}:{width:1600,height:1000},isMobile:mobile,hasTouch:mobile});
   page.on('pageerror',error=>report.errors.push(error.message));
   await page.addInitScript(()=>{window.__atlasTools={};Object.defineProperty(document,'modelContext',{value:{registerTool(tool){window.__atlasTools[tool.name]=tool.execute}}})});
   await page.goto(base);await page.waitForFunction(()=>!document.getElementById('visit-galaxy-button')?.hidden);
   const act=s=>mobile?page.locator(s).tap():page.click(s);
   const state=()=>page.evaluate(()=>window.__atlasTools.read_atlas_view({}));
   const options=()=>act('#tour-progress');
   const arrived=()=>page.waitForFunction(()=>/^(Arrived|Paused)/.test(document.getElementById('tour-status').textContent),null,{timeout:40000});
   await act('#tours-button');await act('[data-tour="road-trip"]');await arrived();
   check('visualCue',await page.locator('#tour-cue').isVisible()&&(await page.locator('#tour-cue').textContent()).includes('dust lanes'));
   await options();check('optionsPause',await page.locator('#tour-play').getAttribute('aria-pressed')==='false');
   check('tenChapters',await page.locator('#tour-chapter option').count()===10);
   await page.selectOption('#tour-pace','manual');await act('#tour-explore');
   check('manualDisablesAutoplay',await page.locator('#tour-play').isDisabled());
   await page.waitForTimeout(9000);check('manualHoldsStop',(await state()).tour.index===0);
   await options();await page.selectOption('#tour-chapter','andromeda');await arrived();
   check('chapterIdentity',(await state()).tour.index===3&&await page.locator('#tour-panel').getAttribute('data-stop-id')==='andromeda');
   check('chapterLandsPaused',(await state()).tour.status==='paused');
   const original=(await state()).link;
   await page.mouse.move(mobile?100:500,250);await page.mouse.down();await page.mouse.move(mobile?230:650,280,{steps:12});await page.mouse.up();await page.waitForTimeout(500);
   check('explorationMovesCamera',(await state()).link!==original);
   await options();await act('#tour-return');await arrived();
   const restored=(await state()).link;
   const coordinates=hash=>{const p=new URLSearchParams(hash.slice(1));return ['t','c'].flatMap(key=>p.get(key).split(',').map(Number))};
   const a=coordinates(original),b=coordinates(restored);check('returnRestoresFraming',a.every((v,i)=>Math.abs(v-b[i])<1e-8));
   check('returnKeepsManual',await page.locator('#tour-play').isDisabled());
   await options();await page.selectOption('#tour-pace','relaxed');await page.keyboard.press('Escape');
   check('escapeClosesOnlyOptions',await page.locator('#tour-options-dialog').isHidden()&&await page.locator('#tour-panel').isVisible());
   check('paceChangeDoesNotResume',await page.locator('#tour-play').getAttribute('aria-pressed')==='false');
   await act('#tour-play');await page.waitForTimeout(9000);check('relaxedHoldsLonger',(await state()).tour.index===3);
   await options();await page.screenshot({path:`${dir}/${engine}-options.png`});
   await page.selectOption('#tour-pace','quick');await act('#tour-explore');await act('#tour-play');
   await page.waitForFunction(()=>document.getElementById('tour-panel').dataset.stopId==='andromeda-companions',null,{timeout:15000});
   check('quickAdvances',true);await options();await page.selectOption('#tour-chapter','coma');await arrived();
   check('comaChapter',(await state()).tour.index===8&&(await page.locator('#tour-cue').textContent()).includes('gathering'));
   await page.screenshot({path:`${dir}/${engine}-coma.png`});
   if(mobile){
    check('compactPanel',(await page.locator('#tour-panel').boundingBox()).height<=215);
    check('mapCenterAvailable',await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight/2)?.tagName==='CANVAS'));
    await page.setViewportSize({width:874,height:402});check('landscapeCueDefersToDetails',await page.locator('#tour-cue').isHidden());
    await act('#tour-panel .mobile-sheet-toggle');check('landscapeDetailsRestoreCue',await page.locator('#tour-cue').isVisible());
    await page.setViewportSize({width:1600,height:1000});await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-mobile'));
    check('desktopCueRestored',await page.locator('#tour-cue').evaluate(el=>el.parentElement.classList.contains('inspector-body')));
    await page.setViewportSize({width:402,height:874});
   }
   await options();await page.selectOption('#tour-pace','manual');await act('#tour-explore');await act('#tour-exit');
   // A deliberate built-in invitation retains its established automatic start,
   // even after a different session pacing preference was selected.
   await page.evaluate(()=>location.hash='tour=road-trip');await arrived();
   check('invitationKeepsAutoplay',await page.locator('#tour-play').getAttribute('aria-pressed')==='true'&&!await page.locator('#tour-play').isDisabled());
   await act('#tour-exit');check('fullCatalog',(await state()).galaxies===14140375);
   const visit=async name=>{await act('#visit-galaxy-button');await page.fill('#galaxy-query',name);await act('#galaxy-results [role="option"]');await page.waitForFunction(name=>document.getElementById('object-name').textContent===name,name);await page.waitForTimeout(300)};
   await visit('Andromeda');const beforeHistory=(await state()).link;
   await visit('Triangulum');check('historyAvailable',await page.locator('#back-view-button').evaluate(el=>!el.hidden)&&await page.locator('#back-view-button').count()===1);
   if(mobile)await act('#mobile-menu-button');await act('#back-view-button');await page.waitForTimeout(1800);
   check('backRestoresNamedView',(await state()).link===beforeHistory);
   await page.close();
  }finally{await browser.close()}
 }
 check('noPageErrors',report.errors.length===0);report.status='complete';
}catch(error){report.status='failed';report.failure=error.stack;process.exitCode=1}
finally{clearInterval(progress);await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))}
