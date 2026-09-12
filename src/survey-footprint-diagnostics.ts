import * as THREE from 'three';
import type {Explorer} from './explorer';
import {SurveyFootprint} from './survey-footprint';

const direction=(raDeg:number,decDeg:number)=>{const ra=THREE.MathUtils.degToRad(raDeg),dec=THREE.MathUtils.degToRad(decDeg);return new THREE.Vector3(Math.cos(dec)*Math.cos(ra),Math.cos(dec)*Math.sin(ra),Math.sin(dec))};

/** Actual renderer and the real saved Settings checkbox: surveyed/unsurveyed directions, draw counts and the missing-sidecar path. */
export async function probeSurveyFootprint(atlas:Explorer){
  const footprint=atlas.surveyFootprint,renderer=atlas.renderer;
  const input=document.getElementById('show-survey-footprint') as HTMLInputElement;
  const saved=input.checked,stored=localStorage.getItem('atlas-survey-footprint');
  const count=atlas.manifest.count,selected=atlas.selected,measured=atlas.measurementDistance;
  const camera=new THREE.PerspectiveCamera(50,1,.0001,100000);camera.up.set(0,0,1);
  const target=new THREE.WebGLRenderTarget(256,256,{depthBuffer:false});
  const autoClear=renderer.autoClear,previousTarget=renderer.getRenderTarget(),clearColor=renderer.getClearColor(new THREE.Color()),clearAlpha=renderer.getClearAlpha();
  const change=(enabled:boolean)=>{input.checked=enabled;input.dispatchEvent(new Event('change'))};
  const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
  const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  // One isolated render of the footprint scene from the observer at the origin, looking toward RA/Dec.
  const sample=(overlay:SurveyFootprint,raDeg:number,decDeg:number)=>{
    camera.position.set(0,0,0);camera.lookAt(direction(raDeg,decDeg));camera.updateMatrixWorld();
    renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.autoClear=false;renderer.clear();renderer.info.reset();
    overlay.render(renderer,camera);
    const pixels=new Uint8Array(256*256*4);renderer.readRenderTargetPixels(target,0,0,256,256,pixels);
    const calls=renderer.info.render.calls;
    renderer.setRenderTarget(previousTarget);renderer.setClearColor(clearColor,clearAlpha);renderer.autoClear=autoClear;
    let lit=0,peak=0,checksum=2166136261;
    for(let i=0;i<pixels.length;i+=4){if(pixels[i+3])lit++;for(let j=0;j<4;j++){peak=Math.max(peak,pixels[i+j]);checksum=Math.imul(checksum^pixels[i+j],16777619)}}
    return {raDeg,decDeg,lit,peak,checksum:checksum>>>0,centerAlpha:pixels[(128*256+128)*4+3],calls};
  };
  // Draw calls of a complete real frame once streaming has settled: two consecutive frames with equal
  // draw counts and nothing pending, bounded by the deadline. A frame taken mid-stream would attribute
  // newly resident chunks to the toggle.
  const frameCalls=async()=>{
    let previous=-1;const deadline=performance.now()+20000;
    for(;;){atlas.invalidate();await frame();const current={calls:atlas.stats.calls,pending:atlas.stats.pending};if((current.calls===previous&&!current.pending)||performance.now()>deadline)return current;previous=current.calls;await sleep(200)}
  };
  try{
    atlas.reset();change(false);
    const deadline=performance.now()+20000;while(atlas.stats.pending&&performance.now()<deadline)await sleep(100);
    const position=atlas.camera.position.clone(),rotation=atlas.camera.quaternion.clone(),focus=atlas.controls.target.clone();
    const disabledFrame=await frameCalls(),disabledSample=sample(footprint,149.75,1.25);
    change(true);
    while(footprint.state==='loading'&&performance.now()<deadline)await sleep(100);
    const state=footprint.state,savedOn=footprint.enabled&&localStorage.getItem('atlas-survey-footprint')==='true';
    const enabledFrame=await frameCalls();
    // COSMOS is the densest 0.5° cell; RA 180.75° Dec +30.25° is a surveyed cell beside a real gap; RA 60° Dec −70° lies south of the surveyed range.
    const cosmos=sample(footprint,149.75,1.25),repeat=sample(footprint,149.75,1.25),gapNeighbour=sample(footprint,180.75,30.25),unsurveyed=sample(footprint,60,-70);
    change(false);
    const disabledAgain=await frameCalls(),disabledSampleAgain=sample(footprint,149.75,1.25);
    const savedOff=!footprint.enabled&&localStorage.getItem('atlas-survey-footprint')==='false';
    // A fresh instance pointed at a missing sidecar must fail closed and draw nothing even when enabled.
    const fresh=new SurveyFootprint();fresh.radiusMpc=footprint.radiusMpc;
    await fresh.load(atlas.catalogAsset('survey-footprint-missing.json'),atlas.manifest);fresh.enabled=true;
    const unavailable={state:fresh.state,memoryBytes:fresh.memoryBytes,...sample(fresh,149.75,1.25)};fresh.dispose();
    // Real frames ran between toggles; OrbitControls re-derives the position from spherical coordinates, so compare within float noise.
    // Quaternion.angleTo is 2·acos(dot) and cannot resolve below ~3e-8 rad near identity, so the angle tolerance is a microradian.
    const poseDelta={positionMpc:position.distanceTo(atlas.camera.position),angleRad:rotation.angleTo(atlas.camera.quaternion),focusMpc:focus.distanceTo(atlas.controls.target)};
    const posePreserved=poseDelta.positionMpc<=position.length()*1e-9&&poseDelta.angleRad<=1e-6&&poseDelta.focusMpc<=Math.max(1,focus.length())*1e-9;
    const catalogPreserved=count===atlas.manifest.count&&selected===atlas.selected&&measured===atlas.measurementDistance;
    return {state,disclosure:footprint.disclosure,radiusMpc:footprint.radiusMpc,memoryBytes:footprint.memoryBytes,disabledFrame,enabledFrame,disabledAgain,disabledSample,cosmos,repeat,gapNeighbour,unsurveyed,disabledSampleAgain,unavailable,savedOn,savedOff,poseDelta,posePreserved,catalogPreserved,
      passed:state==='ready'&&footprint.radiusMpc===atlas.manifest.maxDistanceMpc&&footprint.memoryBytes===36+720*360&&footprint.disclosure.includes('not the official survey tiling')&&
        disabledFrame.calls>0&&enabledFrame.calls===disabledFrame.calls+1&&disabledAgain.calls===disabledFrame.calls&&
        disabledSample.calls===0&&disabledSample.lit===0&&disabledSampleAgain.calls===0&&
        cosmos.calls===1&&cosmos.centerAlpha>0&&cosmos.peak<255&&repeat.checksum===cosmos.checksum&&gapNeighbour.calls===1&&gapNeighbour.centerAlpha>0&&
        unsurveyed.calls===1&&unsurveyed.centerAlpha===0&&unsurveyed.lit===0&&
        unavailable.state==='failed'&&unavailable.calls===0&&unavailable.lit===0&&unavailable.memoryBytes===36&&savedOn&&savedOff&&posePreserved&&catalogPreserved};
  }finally{
    renderer.setRenderTarget(previousTarget);renderer.setClearColor(clearColor,clearAlpha);renderer.autoClear=autoClear;target.dispose();
    change(saved);if(stored===null)localStorage.removeItem('atlas-survey-footprint');else localStorage.setItem('atlas-survey-footprint',stored);
    atlas.reset();atlas.invalidate();
  }
}
