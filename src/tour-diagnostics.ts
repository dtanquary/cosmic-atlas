import * as THREE from 'three';
import type {Explorer} from './explorer';
import type {ResolvedGalaxy} from './galaxy-detail';
import {MODEL_LIMIT} from './model-catalog';
import {CMB_RADIUS_MPC} from './cosmic-scale';
import {tourClock,tours} from './tour';
import {element,frame,savedToggle,sleep} from './overlay-diagnostics';

const statusText=()=>element('tour-status').textContent??'';
const stopNumber=()=>Number(/· (\d+) \//.exec(element('tour-progress').textContent??'')?.[1]??0);
const panelOpen=()=>!element('tour-panel').hidden;
const settled=/^(Arrived|Paused|Finished)/;
const escape=()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));
async function until(test:()=>boolean,what:string,ms=20000){const deadline=performance.now()+ms;while(!test()){if(performance.now()>deadline)throw new Error(`Tour probe timed out waiting for ${what}`);await frame()}}

/** Drives the real Tours button, dialog and panel through both routes at 10× speed: per-stop framing, shell show/restore
 * for both saved states, pause on a wheel tick mid-hop, Escape, unavailable-stop skipping and model eviction during hops. */
export async function probeTours(atlas:Explorer){
  const previousSpeed=tourClock.speed;tourClock.speed=10;
  const shell=savedToggle('show-cosmic-horizon','atlas-cosmic-horizon'),toast=element('toast'),notices:string[]=[];
  const observer=new MutationObserver(()=>{const text=toast.textContent??'';if(text&&notices[notices.length-1]!==text)notices.push(text)});
  observer.observe(toast,{childList:true,characterData:true,subtree:true});
  const removed:{id:number;blend:number;onScreen:boolean}[]=[],remove=atlas['removeModel'];let maxResident=0;
  atlas['removeModel']=(model:ResolvedGalaxy)=>{const p=model.center.clone().project(atlas.camera);removed.push({id:model.data.galaxy.id,blend:model.blend.value,onScreen:p.z>-1&&p.z<1&&Math.abs(p.x)<1&&Math.abs(p.y)<1});remove.call(atlas,model)};
  const zoomOut=tours.find(tour=>tour.key==='zoom-out')!,roadTrip=tours.find(tour=>tour.key==='road-trip')!;
  const start=async(key:string)=>{
    if(panelOpen()){escape();await frame()}
    element('tours-button').click();await frame();
    const button=document.querySelector<HTMLButtonElement>(`[data-tour="${key}"]`)!;if(button.disabled)throw new Error('Start is disabled');
    button.click();await until(()=>panelOpen()&&stopNumber()===1,'the first stop');
  };
  const pose=()=>({target:atlas.controls.target.clone(),distance:atlas.camera.position.distanceTo(atlas.controls.target)});
  const expected=(index:number)=>{
    const stop=zoomOut.stops[index],halfFov=Math.atan(Math.tan(THREE.MathUtils.degToRad(atlas.camera.fov/2))*Math.min(1,atlas.camera.aspect));
    switch(stop.target.kind){
      case 'sun':return {target:new THREE.Vector3(),distance:stop.distanceMpc!};
      case 'core':return {target:atlas.milkyWay.center.clone(),distance:.06};
      case 'localgroup':return {target:new THREE.Vector3().fromArray(stop.target.positionMpc!),distance:stop.distanceMpc!};
      case 'overview':return {target:atlas['overviewTarget'].clone(),distance:atlas['overviewRadius']*2.1};
      default:return {target:new THREE.Vector3(),distance:CMB_RADIUS_MPC/Math.sin(halfFov)*1.14};
    }
  };
  const track=()=>{maxResident=Math.max(maxResident,atlas.resolvedGalaxies.length)};
  try{
    // 1. Zoom-out with the shell saved off: framing at every stop, shell only at the CMB stop, restored after exit.
    shell.set(false);const storedOff=localStorage.getItem('atlas-cosmic-horizon');
    await start('zoom-out');
    const stops:{title:string;status:string;targetErrorMpc:number;distanceError:number;shell:boolean;resident:number;passed:boolean}[]=[];
    for(let n=1;n<=zoomOut.stops.length;n++){
      await until(()=>{track();return stopNumber()===n&&settled.test(statusText())},`arrival at stop ${n}`);
      const p=pose(),e=expected(n-1),targetErrorMpc=p.target.distanceTo(e.target),distanceError=Math.abs(p.distance-e.distance)/e.distance,kind=zoomOut.stops[n-1].target.kind;
      stops.push({title:zoomOut.stops[n-1].title,status:statusText(),targetErrorMpc,distanceError,shell:atlas.cosmicHorizon.enabled,resident:atlas.resolvedGalaxies.length,
        passed:targetErrorMpc<=1e-6*Math.max(e.distance,e.target.length())&&distanceError<1e-6&&atlas.cosmicHorizon.enabled===(kind==='cmb')&&/^Arrived/.test(statusText())});
      if(n<zoomOut.stops.length)await until(()=>{track();return stopNumber()===n+1},`the hop to stop ${n+1}`);
    }
    await until(()=>/^Finished/.test(statusText()),'the finished state');
    const finished={shell:atlas.cosmicHorizon.enabled,checkbox:shell.input.checked,nextDisabled:element<HTMLButtonElement>('tour-next').disabled};
    escape();await frame();
    const exitOff={panelHidden:!panelOpen(),shell:atlas.cosmicHorizon.enabled,checkbox:shell.input.checked,stored:localStorage.getItem('atlas-cosmic-horizon'),passed:false};
    exitOff.passed=exitOff.panelHidden&&!exitOff.shell&&!exitOff.checkbox&&exitOff.stored===storedOff;
    // 2. Shell saved on: the CMB stop shows it, Prev off that stop and Exit both leave it on and saved.
    shell.set(true);
    await start('zoom-out');element('tour-play').click(); // autoplay off: every arrival must land Paused, so Next is deterministic
    for(let n=1;n<zoomOut.stops.length;n++){await until(()=>stopNumber()===n&&/^Paused/.test(statusText()),`stop ${n} paused`);element('tour-next').click();await frame()}
    await until(()=>stopNumber()===zoomOut.stops.length&&/^Paused/.test(statusText()),'the CMB stop paused');
    const shellAtCmb=atlas.cosmicHorizon.enabled;
    element('tour-previous').click();await until(()=>stopNumber()===zoomOut.stops.length-1&&settled.test(statusText()),'the overview stop again');
    const shellAfterPrev=atlas.cosmicHorizon.enabled;
    escape();await frame();
    const exitOn={shellAtCmb,shellAfterPrev,shell:atlas.cosmicHorizon.enabled,checkbox:shell.input.checked,stored:localStorage.getItem('atlas-cosmic-horizon'),passed:false};
    exitOn.passed=shellAtCmb&&shellAfterPrev&&exitOn.shell&&exitOn.checkbox&&exitOn.stored==='true';
    shell.set(false);
    // 3. A wheel tick during a hop pauses the tour at once; the orbit target then stays put.
    await start('zoom-out');
    await until(()=>stopNumber()===2&&/^Travelling/.test(statusText()),'the second hop');
    atlas.canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true}));
    await until(()=>/^Paused/.test(statusText()),'the paused state',5000);
    const pausedStatus=statusText(),targetAfterInput=atlas.controls.target.clone(),distanceAfterInput=atlas.camera.position.distanceTo(atlas.controls.target);
    await sleep(300);
    const wheel={status:pausedStatus,targetDriftMpc:atlas.controls.target.distanceTo(targetAfterInput),distanceDrift:Math.abs(atlas.camera.position.distanceTo(atlas.controls.target)-distanceAfterInput)/distanceAfterInput,playPressed:element('tour-play').getAttribute('aria-pressed'),passed:false};
    wheel.passed=/drag or scroll/.test(pausedStatus)&&wheel.targetDriftMpc===0&&wheel.distanceDrift<1e-9&&wheel.playPressed==='false';
    escape();await frame();const escapeExits=!panelOpen();
    // 4. Road trip: every stop arrives, or is skipped with the notice (catalog stops on subsets), through to Finished.
    notices.length=0;await start('road-trip');
    const seen=new Map<number,string>();
    await until(()=>{track();const n=stopNumber(),s=statusText();if(n&&settled.test(s)&&!seen.has(n))seen.set(n,s);return /^Finished/.test(s)},'the road trip to finish',90000);
    const skipped=notices.filter(text=>/not available in this dataset/.test(text));
    const road={arrived:[...seen.keys()].sort((a,b)=>a-b),skipped,total:roadTrip.stops.length,passed:seen.size+skipped.length>=roadTrip.stops.length&&[...seen.values()].every(s=>!/^Paused/.test(s))};
    escape();await frame();
    // 5. Hold a real catalog metadata lookup, pause before an animation exists, then release it.
    // Subsets have no matching catalog stops, so the skipping checks above cover that case.
    let pendingVisit:{skipped:boolean;passed:boolean;status?:string;targetDriftMpc?:number;cameraDriftMpc?:number;resumed?:boolean}={skipped:skipped.length>0,passed:true};
    if(!pendingVisit.skipped){
      await start('road-trip');
      await until(()=>stopNumber()===1&&/^Arrived/.test(statusText()),'the first road-trip arrival');
      element('tour-play').click();
      for(let n=2;n<=6;n++){element('tour-next').click();await until(()=>stopNumber()===n&&/^Paused/.test(statusText()),`road-trip stop ${n} paused`)}
      const metadataFor=atlas['metadataFor'];let release!:()=>void,entered=false;
      const gate=new Promise<void>(resolve=>{release=resolve});
      atlas['metadataFor']=async node=>{entered=true;await gate;return metadataFor.call(atlas,node)};
      try{
        element('tour-play').click();element('tour-next').click();
        await until(()=>entered,'the pending catalog lookup');
        element('tour-play').click();
        const status=statusText(),target=atlas.controls.target.clone(),camera=atlas.camera.position.clone();
        release();await sleep(900);
        const targetDriftMpc=atlas.controls.target.distanceTo(target),cameraDriftMpc=atlas.camera.position.distanceTo(camera);
        pendingVisit={skipped:false,status,targetDriftMpc,cameraDriftMpc,
          passed:/^Paused/.test(status)&&/^Paused/.test(statusText())&&targetDriftMpc===0&&cameraDriftMpc<1e-9};
      }finally{release();atlas['metadataFor']=metadataFor}
      element('tour-play').click();
      await until(()=>stopNumber()===7&&/^Arrived/.test(statusText()),'the resumed catalog stop');
      pendingVisit.resumed=true;escape();await frame();
    }
    const visibleEvictions=removed.filter(item=>item.onScreen&&item.blend>.05);
    return {speed:tourClock.speed,stops,finished,exitOff,exitOn,wheel,escapeExits,roadTrip:road,pendingVisit,maxResident,removals:removed.length,visibleEvictions,
      passed:stops.every(stop=>stop.passed)&&finished.shell&&finished.checkbox&&finished.nextDisabled&&exitOff.passed&&exitOn.passed&&wheel.passed&&escapeExits&&road.passed&&pendingVisit.passed&&maxResident<=MODEL_LIMIT&&visibleEvictions.length===0};
  }finally{if(panelOpen()){escape();await frame()}atlas['removeModel']=remove;tourClock.speed=previousSpeed;observer.disconnect();shell.restore()}
}
