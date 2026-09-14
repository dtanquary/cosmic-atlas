/** Real-browser photograph loading, bounded layout, source attribution and recovery. */
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.ATLAS_TEST_URL??'http://127.0.0.1:4180/',dir=process.env.ATLAS_TEST_OUTPUT??'.cache/photo-ui';await mkdir(dir,{recursive:true});
const photos=JSON.parse(await readFile(new URL('../public/photos/manifest.json',import.meta.url))).photos;
const report={runId:'photo-ui',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),checks:{},errors:[],status:'running'};
let scope='',page;const check=(name,value)=>{report.checks[`${scope}:${name}`]=value;assert.ok(value,`${scope}:${name}`)};
const progress=setInterval(()=>console.log(scope,Object.keys(report.checks).length),30000);
try{
 for(const engine of ['chrome','webkit']){
  const browser=await(engine==='chrome'?chromium.launch({channel:'chrome',headless:true}):webkit.launch({headless:true}));
  try{
   const mobile=engine==='webkit';scope=engine;page=await browser.newPage({viewport:mobile?{width:402,height:874}:{width:1600,height:1000},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'});page.on('pageerror',e=>report.errors.push(e.message));
   await page.addInitScript(()=>{window.__atlasTools={};Object.defineProperty(document,'modelContext',{value:{registerTool(t){window.__atlasTools[t.name]=t.execute}}});window.__photoUrls=new Set();const create=URL.createObjectURL,revoke=URL.revokeObjectURL;URL.createObjectURL=function(blob){const url=create.call(this,blob);if(blob.type==='image/jpeg')window.__photoUrls.add(url);return url};URL.revokeObjectURL=function(url){window.__photoUrls.delete(url);return revoke.call(this,url)}});
   let requests=0;page.on('request',r=>{if(/\/photos\/.*\.jpg/.test(r.url()))requests++});
   await page.goto(base);await page.waitForFunction(()=>!document.getElementById('visit-galaxy-button').hidden);check('noEagerPhotographs',requests===0);
   const state=()=>page.evaluate(()=>window.__atlasTools.read_atlas_view({}));
   const arrived=()=>page.waitForFunction(()=>/^(Paused|Arrived|Partial)/.test(document.getElementById('tour-status').textContent),null,{timeout:30000});
   const loaded=()=>page.waitForFunction(()=>!document.getElementById('photo-figure').hidden&&document.getElementById('photo-image').naturalWidth>0);
   const chapter=async id=>{if(await page.locator('#photo-panel').isVisible())await page.click('#photo-close');await page.click('#tour-progress');await page.selectOption('#tour-chapter',id);if(await page.locator('#tour-options-dialog').isVisible())await page.click('#tour-return');await arrived()};
   await page.click('#tours-button');await page.click('[data-tour="road-trip"]');await arrived();
   const stops=[['milky-way','milkyway'],['lmc','lmc'],['smc','smc'],['andromeda','m31'],['andromeda-companions','m32'],['andromeda-companions','m110'],['triangulum','m33'],['ngc-3982','ngc3982'],['ngc-4026','ngc4026'],['coma','coma']];
   for(const [stop,key] of stops){
    scope=`${engine}:${key}`;await chapter(stop);const before=(await state()).link;await page.click('#tour-photo');if(key==='m110')await page.selectOption('#photo-choice','m110');await loaded();
    const photo=photos.find(p=>p.key===key);check('correctCredit',await page.locator('#photo-credit').textContent()===photo.credit);check('correctSource',await page.locator('#photo-source').getAttribute('href')===photo.source);check('license',await page.locator('#photo-license').getAttribute('href')===photo.license);
    check('openPausesWithoutMoving',(await state()).tour.status==='paused'&&(await state()).link===before);
    check('oneRetainedImage',await page.evaluate(()=>window.__photoUrls.size===1&&document.querySelectorAll('#photo-panel img').length===1));
    check('mapCenter',await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight/2)?.tagName==='CANVAS'));
    check('matchOnlyCalibrated',await page.locator('#photo-match').isVisible()===Boolean(photo.match));
    await page.screenshot({path:`${dir}/${engine}-${key}.png`});
    if(key==='ngc4026'){
     await page.click('#photo-match');await page.waitForFunction(()=>!document.getElementById('photo-restore').hidden);const matched=(await state()).link,p=new URLSearchParams(matched.slice(1)),t=p.get('t').split(',').map(Number),o=p.get('c').split(',').map(Number),distance=Math.hypot(...t),orbit=Math.hypot(...o);
     check('observerFacing',o.every((v,i)=>Math.abs(v/orbit+t[i]/distance)<1e-7));check('verticalField',Math.abs(orbit-distance*Math.tan(4/60*Math.PI/180)/Math.tan(25*Math.PI/180))<1e-8);
     await page.click('#photo-restore');await page.waitForFunction(()=>document.getElementById('photo-restore').hidden);check('undoExactView',(await state()).link===before);await page.click('.photo-notes summary');check('undoFieldDisclosure',!(await page.locator('#photo-field').textContent()).includes('matched vertical'));
    }
    await page.keyboard.press('Escape');check('escapeClosesOnlyPhoto',await page.locator('#photo-panel').isHidden()&&await page.locator('#tour-panel').isVisible());check('releasedOnClose',await page.evaluate(()=>window.__photoUrls.size===0));
   }
   scope=`${engine}:layout`;await chapter('andromeda');await page.click('#tour-photo');await loaded();
   for(const [name,width,height] of [['portrait',402,874],['landscape',874,402],['desktop',1600,1000],['portrait-again',402,874]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(150);const b=await page.locator('#photo-panel').boundingBox();check(`${name}:bounded`,b.y>=0&&b.y+b.height<=height&&b.x>=0&&b.x+b.width<=width);check(`${name}:map`,await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight/2)?.tagName==='CANVAS'));await page.screenshot({path:`${dir}/${engine}-${name}.png`});
   }
   const beforeDrag=(await state()).link;await page.mouse.move(100,220);await page.mouse.down();await page.mouse.move(220,260,{steps:8});await page.mouse.up();await page.waitForTimeout(400);check('orbitWhileOpen',(await state()).link!==beforeDrag&&await page.locator('#photo-panel').isVisible());
   await page.click('#photo-model');check('modelSwitch',await page.locator('#photo-panel').isHidden());
   await chapter('survey');await page.click('#tour-photo');check('unsupportedFallback',(await page.locator('#photo-note').textContent()).includes('No matched photograph')&&await page.locator('#photo-figure').isHidden());await page.click('#photo-close');
   // A corrupt response fails its hash before any decode; retry uses the real asset.
   const m31=photos.find(p=>p.key==='m31');let corrupt=true;await page.route(`**${m31.asset}`,async r=>{if(corrupt)await r.fulfill({contentType:'image/jpeg',body:'bad image'});else await r.continue()});
   await chapter('andromeda');await page.click('#tour-photo');await page.waitForSelector('#photo-retry:visible');check('corruptImageRejected',(await page.locator('#photo-loading').textContent()).includes('verification')&&await page.evaluate(()=>window.__photoUrls.size===0));corrupt=false;await page.click('#photo-retry');await loaded();check('retryRecovered',true);await page.click('#photo-close');await page.unroute(`**${m31.asset}`);
   let release;const gate=new Promise(r=>release=r);await page.route(`**${m31.asset}`,async r=>{await gate;await r.continue().catch(()=>{})});await page.click('#tour-photo');await page.click('#photo-close');release();await page.waitForTimeout(400);check('closedRequestCannotReopen',await page.locator('#photo-panel').isHidden()&&await page.evaluate(()=>window.__photoUrls.size===0));await page.unroute(`**${m31.asset}`);
   check('catalogUnchanged',(await state()).galaxies===14140375);await page.click('#tour-exit');
  }finally{await browser.close()}
 }
 check('noPageErrors',report.errors.length===0);report.status='complete';
}catch(e){report.status='failed';report.failure=e.stack;process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:`${dir}/failure.png`}).catch(()=>{})}
finally{clearInterval(progress);await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(report.status,report.failure??Object.keys(report.checks).length)}
