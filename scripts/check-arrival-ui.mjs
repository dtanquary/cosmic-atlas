/** Production checks for prepared arrivals and a real subset's partial Coma view. */
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.ATLAS_TEST_URL??'http://127.0.0.1:4180/',dir=process.env.ATLAS_TEST_OUTPUT??'.cache/arrival-ui';await mkdir(dir,{recursive:true});
const report={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),checks:{},requests:[],errors:[],status:'running'};
let scope='';const check=(key,value)=>{report.checks[`${scope}:${key}`]=value;assert.ok(value,`${scope}:${key}`)};
try{
 for(const engine of ['chrome','webkit']){
  scope=engine;const browser=await(engine==='chrome'?chromium.launch({channel:'chrome',headless:true}):webkit.launch({headless:true}));
  try{
   const page=await browser.newPage({viewport:engine==='chrome'?{width:1600,height:1000}:{width:402,height:874},reducedMotion:'reduce'});page.on('pageerror',e=>report.errors.push(e.message));
   let chapter='',started=0;
   page.on('request',request=>{const path=new URL(request.url()).pathname;if(/512\.(meta|bin)/.test(path))report.requests.push({engine,path,chapter,time:Date.now()-started})});
   await page.goto(base);await page.waitForFunction(()=>!document.getElementById('visit-galaxy-button').hidden);
   await page.click('#tours-button');await page.click('[data-tour="road-trip"]');await page.click('#tour-progress');chapter='triangulum';started=Date.now();await page.selectOption('#tour-chapter','triangulum');
   await page.waitForFunction(()=>document.getElementById('tour-status').textContent.startsWith('Paused'));await page.click('#tour-play');
   await page.waitForTimeout(2200);check('preparationDoesNotNavigate',await page.locator('#tour-panel').getAttribute('data-stop-id')==='triangulum');
   check('metadataRequestedBeforeNextStop',report.requests.some(r=>r.engine===engine&&r.chapter==='triangulum'&&r.path.includes('512.meta')));
   await page.click('#tour-play');const stop=await page.locator('#tour-panel').getAttribute('data-stop-id');await page.waitForTimeout(8500);check('pauseCancelsAdvance',await page.locator('#tour-panel').getAttribute('data-stop-id')===stop);
   chapter='ngc-3982';await page.click('#tour-next');await page.waitForFunction(()=>document.getElementById('tour-panel').dataset.stopId==='ngc-3982'&&document.getElementById('tour-status').textContent.startsWith('Paused'),null,{timeout:30000});check('preparedDestinationArrives',true);
   await page.goto(new URL('?dataset=development',base).href);await page.waitForFunction(()=>!document.getElementById('visit-galaxy-button').hidden);
   await page.click('#tours-button');await page.click('[data-tour="road-trip"]');await page.click('#tour-progress');await page.selectOption('#tour-chapter','coma');
   await page.waitForFunction(()=>document.getElementById('tour-status').textContent.startsWith('Partial'),null,{timeout:15000});check('finitePartialState',await page.locator('#tour-retry').isVisible());
   check('partialMapUsable',await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight/2)?.tagName==='CANVAS'));
   await page.screenshot({path:`${dir}/${engine}-partial.png`});await page.click('#tour-retry');await page.waitForFunction(()=>document.getElementById('tour-status').textContent.startsWith('Preparing'));
   await page.click('#tour-next');await page.waitForFunction(()=>document.getElementById('tour-panel').dataset.stopId==='survey'&&document.getElementById('tour-status').textContent.startsWith('Paused'));check('nextEscapesPendingReadiness',true);
   await page.click('#tour-progress');await page.selectOption('#tour-chapter','coma');await page.waitForFunction(()=>document.getElementById('tour-status').textContent.startsWith('Partial'),null,{timeout:15000});
   await page.click('#tour-play');check('continueAcceptsPartialView',(await page.locator('#tour-status').textContent()).startsWith('Arrived'));await page.click('#tour-exit');
  }finally{await browser.close()}
 }
 check('noPageErrors',report.errors.length===0);report.status='complete';
}catch(e){report.status='failed';report.failure=e.stack;process.exitCode=1}
finally{await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(report.status,report.failure??Object.keys(report.checks).length)}
