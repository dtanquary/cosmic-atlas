import * as THREE from 'three';
import type {Explorer} from './explorer';
import {chooseRings,lookbackReference} from './lookback';

/** Actual renderer and the real saved Settings checkbox: draw counts, silhouette pixels, labels and the table. */
export async function probeLookbackRings(atlas:Explorer){
  const rings=atlas.lookbackRings,renderer=atlas.renderer;
  const input=document.getElementById('show-lookback-rings') as HTMLInputElement;
  const saved=input.checked,stored=localStorage.getItem('atlas-lookback-rings');
  const count=atlas.manifest.count,selected=atlas.selected,measured=atlas.measurementDistance;
  const camera=new THREE.PerspectiveCamera(50,1,.0001,100000);camera.up.set(0,0,1);
  const target=new THREE.WebGLRenderTarget(256,256,{depthBuffer:false});
  const autoClear=renderer.autoClear,previousTarget=renderer.getRenderTarget(),clearColor=renderer.getClearColor(new THREE.Color()),clearAlpha=renderer.getClearAlpha();
  const change=(enabled:boolean)=>{input.checked=enabled;input.dispatchEvent(new Event('change'))};
  const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
  const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  // One isolated render of the ring scene from `distance` along the current view direction, looking at the observer.
  const sample=(distance:number)=>{
    camera.position.copy(atlas.camera.position).normalize().multiplyScalar(distance);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const chosen=chooseRings(distance,camera.fov,1,256);
    renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.autoClear=false;renderer.clear();renderer.info.reset();
    rings.render(renderer,camera,chosen);
    const pixels=new Uint8Array(256*256*4);renderer.readRenderTargetPixels(target,0,0,256,256,pixels);
    const calls=renderer.info.render.calls;
    renderer.setRenderTarget(previousTarget);renderer.setClearColor(clearColor,clearAlpha);renderer.autoClear=autoClear;
    let lit=0,peak=0,checksum=2166136261;
    for(let i=0;i<pixels.length;i+=4){if(pixels[i+3])lit++;for(let j=0;j<4;j++){peak=Math.max(peak,pixels[i+j]);checksum=Math.imul(checksum^pixels[i+j],16777619)}}
    return {distanceMpc:distance,ringCount:chosen.length,lit,peak,checksum:checksum>>>0,calls};
  };
  // Draw calls of a complete real frame after the toggle settles.
  const frameCalls=async()=>{atlas.invalidate();await frame();return {calls:atlas.stats.calls,pending:atlas.stats.pending,rings:atlas.rings.length}};
  const labelRects=()=>[...document.querySelectorAll<HTMLElement>('.ring-label')].filter(label=>!label.hidden).map(label=>label.getBoundingClientRect());
  try{
    atlas.reset();change(false);
    const deadline=performance.now()+20000;while(atlas.stats.pending&&performance.now()<deadline)await sleep(100);
    const position=atlas.camera.position.clone(),rotation=atlas.camera.quaternion.clone(),focus=atlas.controls.target.clone();
    const disabledFrame=await frameCalls(),disabledSample=sample(position.length());
    change(true);
    const enabledFrame=await frameCalls(),chosen=atlas.rings.map(ring=>({lookbackGyr:ring.lookbackGyr,comovingMpc:ring.comovingMpc,angleDeg:ring.angle*180/Math.PI}));
    const rects=labelRects();let overlapping=0;
    for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];if(a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom)overlapping++}
    const savedOn=rings.enabled&&localStorage.getItem('atlas-lookback-rings')==='true';
    const overview=sample(position.length()),repeat=sample(position.length()),local=sample(1e-5);
    change(false);
    const disabledAgain=await frameCalls(),labelsHidden=labelRects().length===0;
    const savedOff=!rings.enabled&&localStorage.getItem('atlas-lookback-rings')==='false';
    // Real frames ran between toggles; OrbitControls re-derives the position from spherical coordinates, so compare within float noise.
    // Quaternion.angleTo uses acos near 1, whose own rounding floor is ~3e-8 rad; 1e-6 rad is still far below one pixel at any viewport.
    const poseDelta={positionMpc:position.distanceTo(atlas.camera.position),angleRad:rotation.angleTo(atlas.camera.quaternion),focusMpc:focus.distanceTo(atlas.controls.target)};
    const posePreserved=poseDelta.positionMpc<=position.length()*1e-9&&poseDelta.angleRad<=1e-6&&poseDelta.focusMpc<=Math.max(1,focus.length())*1e-9;
    const catalogPreserved=count===atlas.manifest.count&&selected===atlas.selected&&measured===atlas.measurementDistance;
    const {comovingMpc,lookbackGyr}=lookbackReference.table;
    const monotonic=comovingMpc.every((value,i)=>!i||value>comovingMpc[i-1])&&lookbackGyr.every((value,i)=>!i||value>lookbackGyr[i-1]);
    return {disabledFrame,enabledFrame,disabledAgain,chosen,labelsVisible:rects.length,overlapping,labelsHidden,disabledSample,overview,repeat,local,savedOn,savedOff,poseDelta,posePreserved,catalogPreserved,monotonic,geometryBytes:rings.memoryBytes,
      passed:disabledFrame.calls>0&&enabledFrame.calls===disabledFrame.calls+1&&disabledAgain.calls===disabledFrame.calls&&disabledFrame.rings===0&&enabledFrame.rings>0&&enabledFrame.rings<=8&&
        disabledSample.calls===0&&disabledSample.lit===0&&overview.calls===1&&overview.lit>0&&overview.peak<255&&repeat.checksum===overview.checksum&&local.calls===0&&local.lit===0&&local.ringCount===0&&
        rects.length>0&&rects.length<=8&&overlapping===0&&labelsHidden&&savedOn&&savedOff&&posePreserved&&catalogPreserved&&monotonic};
  }finally{
    renderer.setRenderTarget(previousTarget);renderer.setClearColor(clearColor,clearAlpha);renderer.autoClear=autoClear;target.dispose();
    change(saved);if(stored===null)localStorage.removeItem('atlas-lookback-rings');else localStorage.setItem('atlas-lookback-rings',stored);
    atlas.reset();atlas.invalidate();
  }
}
