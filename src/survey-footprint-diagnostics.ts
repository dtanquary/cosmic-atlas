import * as THREE from 'three';
import type {Explorer} from './explorer';
import {SurveyFootprint} from './survey-footprint';
import {overlayProbe,preservation,savedToggle,settledFrameCalls,sleep} from './overlay-diagnostics';

const direction=(raDeg:number,decDeg:number)=>{const ra=THREE.MathUtils.degToRad(raDeg),dec=THREE.MathUtils.degToRad(decDeg);return new THREE.Vector3(Math.cos(dec)*Math.cos(ra),Math.cos(dec)*Math.sin(ra),Math.sin(dec))};

/** Actual renderer and the real saved Settings checkbox: surveyed/unsurveyed directions, draw counts and the missing-sidecar path. */
export async function probeSurveyFootprint(atlas:Explorer){
  const footprint=atlas.surveyFootprint,renderer=atlas.renderer;
  const toggle=savedToggle('show-survey-footprint','atlas-survey-footprint'),probe=overlayProbe(renderer);
  const camera=new THREE.PerspectiveCamera(50,1,.0001,100000);camera.up.set(0,0,1);
  // One isolated render of the footprint scene from the observer at the origin, looking toward RA/Dec.
  const sample=(overlay:SurveyFootprint,raDeg:number,decDeg:number)=>{
    camera.position.set(0,0,0);camera.lookAt(direction(raDeg,decDeg));camera.updateMatrixWorld();
    const {lit,peak,checksum,centerAlpha,calls}=probe.readback(()=>overlay.render(renderer,camera));
    return {raDeg,decDeg,lit,peak,checksum,centerAlpha,calls};
  };
  try{
    atlas.reset();toggle.set(false);
    const deadline=performance.now()+20000;while(atlas.stats.pending&&performance.now()<deadline)await sleep(100);
    const preserved=preservation(atlas);
    const disabledFrame=await settledFrameCalls(atlas),disabledSample=sample(footprint,149.75,1.25);
    toggle.set(true);
    while(footprint.state==='loading'&&performance.now()<deadline)await sleep(100);
    const state=footprint.state,savedOn=footprint.enabled&&localStorage.getItem('atlas-survey-footprint')==='true';
    const enabledFrame=await settledFrameCalls(atlas);
    // COSMOS is the densest 0.5° cell; RA 180.75° Dec +30.25° is a surveyed cell beside a real gap; RA 60° Dec −70° lies south of the surveyed range.
    const cosmos=sample(footprint,149.75,1.25),repeat=sample(footprint,149.75,1.25),gapNeighbour=sample(footprint,180.75,30.25),unsurveyed=sample(footprint,60,-70);
    toggle.set(false);
    const disabledAgain=await settledFrameCalls(atlas),disabledSampleAgain=sample(footprint,149.75,1.25);
    const savedOff=!footprint.enabled&&localStorage.getItem('atlas-survey-footprint')==='false';
    // A fresh instance pointed at a missing sidecar must fail closed and draw nothing even when enabled.
    const fresh=new SurveyFootprint();fresh.radiusMpc=footprint.radiusMpc;
    await fresh.load(atlas.catalogAsset('survey-footprint-missing.json'),atlas.manifest);fresh.enabled=true;
    const unavailable={state:fresh.state,memoryBytes:fresh.memoryBytes,...sample(fresh,149.75,1.25)};fresh.dispose();
    const {poseDelta,posePreserved,catalogPreserved}=preserved();
    return {state,disclosure:footprint.disclosure,radiusMpc:footprint.radiusMpc,memoryBytes:footprint.memoryBytes,disabledFrame,enabledFrame,disabledAgain,disabledSample,cosmos,repeat,gapNeighbour,unsurveyed,disabledSampleAgain,unavailable,savedOn,savedOff,poseDelta,posePreserved,catalogPreserved,
      passed:state==='ready'&&footprint.radiusMpc===atlas.manifest.maxDistanceMpc&&footprint.memoryBytes===36+720*360&&footprint.disclosure.includes('not the official survey tiling')&&
        disabledFrame.calls>0&&enabledFrame.calls===disabledFrame.calls+1&&disabledAgain.calls===disabledFrame.calls&&
        disabledSample.calls===0&&disabledSample.lit===0&&disabledSampleAgain.calls===0&&
        cosmos.calls===1&&cosmos.centerAlpha>0&&cosmos.peak<255&&repeat.checksum===cosmos.checksum&&gapNeighbour.calls===1&&gapNeighbour.centerAlpha>0&&
        unsurveyed.calls===1&&unsurveyed.centerAlpha===0&&unsurveyed.lit===0&&
        unavailable.state==='failed'&&unavailable.calls===0&&unavailable.lit===0&&unavailable.memoryBytes===36&&savedOn&&savedOff&&posePreserved&&catalogPreserved};
  }finally{probe.dispose();toggle.restore();atlas.reset();atlas.invalidate()}
}
