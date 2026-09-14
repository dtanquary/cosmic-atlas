/** All-stop composition and tour interruption checks on actual browser engines. */
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.ATLAS_TEST_URL??'http://127.0.0.1:4180/',dir=process.env.ATLAS_TEST_OUTPUT??'.cache/tour-polish';await mkdir(dir,{recursive:true});
const report={runId:'tour-polish',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),checks:{},errors:[],status:'running'};
let scope='';const check=(key,value)=>{report.checks[`${scope}:${key}`]=value;assert.ok(value,`${scope}:${key}`)};
const progress=setInterval(()=>console.log(scope,Object.keys(report.checks).length),30000);
try{
 for(const engine of ['chrome','webkit']){
  const browser=await(engine==='chrome'?chromium.launch({channel:'chrome',headless:true}):webkit.launch({headless:true}));
  try{
   const page=await browser.newPage({viewport:{width:402,height:874},isMobile:true,hasTouch:true,reducedMotion:'reduce'});page.on('pageerror',e=>report.errors.push(e.message));
   await page.goto(base);await page.waitForFunction(()=>!document.getElementById('visit-galaxy-button').hidden);await page.evaluate(()=>document.fonts.ready);
   for(const [layout,width,height]of [['portrait',402,874],['landscape',874,402],['desktop',1600,1000]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(100);
    for(const route of ['road-trip','zoom-out']){
     scope=`${engine}:${layout}:${route}`;await page.click('#tours-button');await page.click(`[data-tour="${route}"]`);await page.click('#tour-progress');await page.selectOption('#tour-pace','manual');
     const ids=await page.locator('#tour-chapter option').evaluateAll(options=>options.map(o=>o.value));await page.click('#tour-explore');
     for(const id of ids){
      await page.click('#tour-progress');const start=Date.now();await page.selectOption('#tour-chapter',id);
      // Selecting the current option emits no change: Return handles that first stop.
      if(await page.locator('#tour-options-dialog').isVisible())await page.click('#tour-return');
      await page.waitForFunction(id=>document.getElementById('tour-panel').dataset.stopId===id&&document.getElementById('tour-status').textContent.startsWith('Paused'),id,{timeout:30000});
      check(`${id}:reducedMotionArrival`,Date.now()-start<3500);
      await page.waitForTimeout(150);
      if(['coma','survey','cmb'].includes(id))check(`${id}:previousToastCleared`,await page.locator('#toast').isHidden());
      check(`${id}:context`,(await page.locator('#place-context').textContent()).length>0);
      check(`${id}:mapCenter`,await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight/2)?.tagName==='CANVAS'));
      const panel=await page.locator('#tour-panel').boundingBox();check(`${id}:bounded`,panel.y>=0&&panel.y+panel.height<=height&& (layout!=='portrait'||panel.height<=215));
      check(`${id}:labels`,await page.locator('.tour-object-label:visible').count()===(id==='andromeda-companions'?2:0));
      await page.screenshot({path:`${dir}/${engine}-${layout}-${route}-${id}.png`});
     }
     await page.click('#tour-exit');check('exitClearsLabels',await page.locator('.tour-object-label:visible').count()===0);
    }
   }
   scope=`${engine}:visibility`;await page.click('#tours-button');await page.click('[data-tour="road-trip"]');await page.click('#tour-progress');await page.selectOption('#tour-pace','quick');await page.click('#tour-explore');
   check('continueLabel',await page.locator('#tour-play').textContent()==='Continue');await page.click('#tour-play');
   // Visibility events are simulated; travel and dwell cancellation run in the real browser.
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))});
   check('hidePauses',await page.locator('#tour-play').getAttribute('aria-pressed')==='false');
   await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});
   const stop=await page.locator('#tour-panel').getAttribute('data-stop-id');await page.waitForTimeout(9000);
   check('returnDoesNotResume',await page.locator('#tour-panel').getAttribute('data-stop-id')===stop&&await page.locator('#tour-play').textContent()==='Continue');
   await page.click('#tour-exit');
  }finally{await browser.close()}
 }
 check('noPageErrors',report.errors.length===0);report.status='complete';
}catch(e){report.status='failed';report.failure=e.stack;process.exitCode=1}
finally{clearInterval(progress);await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(report.status,report.failure??Object.keys(report.checks).length)}
