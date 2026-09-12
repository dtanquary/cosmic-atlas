import * as THREE from 'three';
import type {Explorer} from './explorer';
import {CMB_RADIUS_MPC} from './cosmic-scale';
import {overlayProbe,preservation,savedToggle} from './overlay-diagnostics';

/** Actual renderer, including near-boundary rays and the real saved UI setting. */
export async function probeCosmicHorizon(atlas:Explorer){
  const horizon=atlas.cosmicHorizon,renderer=atlas.renderer;
  const toggle=savedToggle('show-cosmic-horizon','atlas-cosmic-horizon'),button=document.getElementById('cosmic-horizon-button') as HTMLButtonElement;
  const preserved=preservation(atlas),probe=overlayProbe(renderer);
  const camera=new THREE.PerspectiveCamera(50,1,.0001,CMB_RADIUS_MPC*12);camera.up.set(0,0,1);
  const sample=(offset:number,away=false)=>{
    camera.position.set(0,-CMB_RADIUS_MPC*offset,0);camera.lookAt(0,away?-CMB_RADIUS_MPC*(offset+1):CMB_RADIUS_MPC,0);camera.updateMatrixWorld();
    return probe.readback(()=>horizon.render(renderer,camera));
  };
  try{
    toggle.set(false);const disabled=sample(3);
    button.click();
    const enabledFromRail=toggle.input.checked&&horizon.enabled&&button.getAttribute('aria-pressed')==='true'&&localStorage.getItem('atlas-cosmic-horizon')==='true';
    const {posePreserved,catalogPreserved}=preserved();
    const outside=sample(3),repeat=sample(3),away=sample(3,true),observer=sample(0),inside=sample(.999),crossing=sample(1.001),boundary=sample(1);
    toggle.set(false);const disabledAgain=sample(3);
    const savedOff=!horizon.enabled&&button.getAttribute('aria-pressed')==='false'&&localStorage.getItem('atlas-cosmic-horizon')==='false';
    toggle.set(true);atlas.viewCosmicHorizon();
    const centered=atlas.controls.target.lengthSq()===0&&atlas.camera.position.length()>CMB_RADIUS_MPC*2;
    return {enabledFromRail,savedOff,posePreserved,catalogPreserved,centered,disabled,outside,away,observer,inside,crossing,boundary,disabledAgain,geometryBytes:horizon.memoryBytes,
      passed:enabledFromRail&&savedOff&&posePreserved&&catalogPreserved&&centered&&disabled.calls===0&&disabled.lit===0&&disabledAgain.lit===0&&
        outside.calls===1&&outside.centerAlpha>0&&outside.cornerAlpha===0&&outside.minX>10&&outside.maxX<246&&repeat.checksum===outside.checksum&&away.lit===0&&
        [observer,inside,crossing,boundary].every(view=>view.calls===1&&view.lit===65536&&view.peak<100)&&
        Math.abs(inside.peak-crossing.peak)<=1&&Math.abs(inside.centerAlpha-crossing.centerAlpha)<=1};
  }finally{probe.dispose();toggle.restore();atlas.reset();atlas.invalidate()}
}
