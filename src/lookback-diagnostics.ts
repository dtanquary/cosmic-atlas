import * as THREE from 'three';
import type {Explorer} from './explorer';
import {chooseRings,lookbackReference} from './lookback';
import {overlayProbe,preservation,savedToggle,settledFrameCalls,sleep} from './overlay-diagnostics';

/** Actual renderer and the real saved Settings checkbox: draw counts, silhouette pixels, labels and the table. */
export async function probeLookbackRings(atlas:Explorer){
  const rings=atlas.lookbackRings,renderer=atlas.renderer;
  const toggle=savedToggle('show-lookback-rings','atlas-lookback-rings'),probe=overlayProbe(renderer);
  const camera=new THREE.PerspectiveCamera(50,1,.0001,100000);camera.up.set(0,0,1);
  // One isolated render of the ring scene from `distance` along the current view direction, looking at the observer.
  const sample=(distance:number)=>{
    camera.position.copy(atlas.camera.position).normalize().multiplyScalar(distance);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const chosen=chooseRings(distance,camera.fov,1,256);
    const {lit,peak,checksum,calls}=probe.readback(()=>rings.render(renderer,camera,chosen));
    return {distanceMpc:distance,ringCount:chosen.length,lit,peak,checksum,calls};
  };
  const frameCalls=async()=>({...await settledFrameCalls(atlas),rings:atlas.rings.length});
  const labelRects=()=>[...document.querySelectorAll<HTMLElement>('.ring-label')].filter(label=>!label.hidden).map(label=>label.getBoundingClientRect());
  try{
    atlas.reset();toggle.set(false);
    const deadline=performance.now()+20000;while(atlas.stats.pending&&performance.now()<deadline)await sleep(100);
    const preserved=preservation(atlas),distance=atlas.camera.position.length();
    const disabledFrame=await frameCalls(),disabledSample=sample(distance);
    toggle.set(true);
    const enabledFrame=await frameCalls(),chosen=atlas.rings.map(ring=>({lookbackGyr:ring.lookbackGyr,comovingMpc:ring.comovingMpc,angleDeg:ring.angle*180/Math.PI}));
    const rects=labelRects();let overlapping=0;
    for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];if(a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom)overlapping++}
    const savedOn=rings.enabled&&localStorage.getItem('atlas-lookback-rings')==='true';
    const overview=sample(distance),repeat=sample(distance),local=sample(1e-5);
    toggle.set(false);
    const disabledAgain=await frameCalls(),labelsHidden=labelRects().length===0;
    const savedOff=!rings.enabled&&localStorage.getItem('atlas-lookback-rings')==='false';
    const {poseDelta,posePreserved,catalogPreserved}=preserved();
    const {comovingMpc,lookbackGyr}=lookbackReference.table;
    const monotonic=comovingMpc.every((value,i)=>!i||value>comovingMpc[i-1])&&lookbackGyr.every((value,i)=>!i||value>lookbackGyr[i-1]);
    return {disabledFrame,enabledFrame,disabledAgain,chosen,labelsVisible:rects.length,overlapping,labelsHidden,disabledSample,overview,repeat,local,savedOn,savedOff,poseDelta,posePreserved,catalogPreserved,monotonic,geometryBytes:rings.memoryBytes,
      passed:disabledFrame.calls>0&&enabledFrame.calls===disabledFrame.calls+1&&disabledAgain.calls===disabledFrame.calls&&disabledFrame.rings===0&&enabledFrame.rings>0&&enabledFrame.rings<=8&&
        disabledSample.calls===0&&disabledSample.lit===0&&overview.calls===1&&overview.lit>0&&overview.peak<255&&repeat.checksum===overview.checksum&&local.calls===0&&local.lit===0&&local.ringCount===0&&
        rects.length>0&&rects.length<=8&&overlapping===0&&labelsHidden&&savedOn&&savedOff&&posePreserved&&catalogPreserved&&monotonic};
  }finally{probe.dispose();toggle.restore();atlas.reset();atlas.invalidate()}
}
