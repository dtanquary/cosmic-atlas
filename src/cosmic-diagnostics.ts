import * as THREE from 'three';
import type {Explorer} from './explorer';
import {CMB_RADIUS_MPC} from './cosmic-scale';

/** Actual renderer, including near-boundary rays and the real saved UI setting. */
export async function probeCosmicHorizon(atlas:Explorer){
  const horizon=atlas.cosmicHorizon,renderer=atlas.renderer;
  const input=document.getElementById('show-cosmic-horizon') as HTMLInputElement;
  const button=document.getElementById('cosmic-horizon-button') as HTMLButtonElement;
  const saved=input.checked,stored=localStorage.getItem('atlas-cosmic-horizon');
  const position=atlas.camera.position.clone(),rotation=atlas.camera.quaternion.clone(),focus=atlas.controls.target.clone();
  const count=atlas.manifest.count,selected=atlas.selected,measured=atlas.measurementDistance;
  const camera=new THREE.PerspectiveCamera(50,1,.0001,CMB_RADIUS_MPC*12);camera.up.set(0,0,1);
  const target=new THREE.WebGLRenderTarget(256,256,{depthBuffer:false});
  const autoClear=renderer.autoClear,previousTarget=renderer.getRenderTarget(),clearColor=renderer.getClearColor(new THREE.Color()),clearAlpha=renderer.getClearAlpha();
  const change=(enabled:boolean)=>{input.checked=enabled;input.dispatchEvent(new Event('change'))};
  const sample=(offset:number,away=false)=>{
    camera.position.set(0,-CMB_RADIUS_MPC*offset,0);camera.lookAt(0,away?-CMB_RADIUS_MPC*(offset+1):CMB_RADIUS_MPC,0);camera.updateMatrixWorld();
    renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.autoClear=false;renderer.clear();renderer.info.reset();horizon.render(renderer,camera);
    const pixels=new Uint8Array(256*256*4);renderer.readRenderTargetPixels(target,0,0,256,256,pixels);
    let lit=0,peak=0,checksum=2166136261,minX=256,maxX=-1;
    for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]){lit++;minX=Math.min(minX,(i/4)%256);maxX=Math.max(maxX,(i/4)%256)}for(let j=0;j<4;j++){peak=Math.max(peak,pixels[i+j]);checksum=Math.imul(checksum^pixels[i+j],16777619)}}
    return {lit,peak,checksum:checksum>>>0,minX,maxX,centerAlpha:pixels[(128*256+128)*4+3],cornerAlpha:pixels[3],calls:renderer.info.render.calls};
  };
  try{
    change(false);const disabled=sample(3);
    button.click();
    const enabledFromRail=input.checked&&horizon.enabled&&button.getAttribute('aria-pressed')==='true'&&localStorage.getItem('atlas-cosmic-horizon')==='true';
    const posePreserved=position.equals(atlas.camera.position)&&rotation.equals(atlas.camera.quaternion)&&focus.equals(atlas.controls.target);
    const catalogPreserved=count===atlas.manifest.count&&selected===atlas.selected&&measured===atlas.measurementDistance;
    const outside=sample(3),repeat=sample(3),away=sample(3,true),observer=sample(0),inside=sample(.999),crossing=sample(1.001),boundary=sample(1);
    change(false);const disabledAgain=sample(3);
    const savedOff=!horizon.enabled&&button.getAttribute('aria-pressed')==='false'&&localStorage.getItem('atlas-cosmic-horizon')==='false';
    change(true);atlas.viewCosmicHorizon();
    const centered=atlas.controls.target.lengthSq()===0&&atlas.camera.position.length()>CMB_RADIUS_MPC*2;
    return {enabledFromRail,savedOff,posePreserved,catalogPreserved,centered,disabled,outside,away,observer,inside,crossing,boundary,disabledAgain,geometryBytes:horizon.memoryBytes,
      passed:enabledFromRail&&savedOff&&posePreserved&&catalogPreserved&&centered&&disabled.calls===0&&disabled.lit===0&&disabledAgain.lit===0&&
        outside.calls===1&&outside.centerAlpha>0&&outside.cornerAlpha===0&&outside.minX>10&&outside.maxX<246&&repeat.checksum===outside.checksum&&away.lit===0&&
        [observer,inside,crossing,boundary].every(view=>view.calls===1&&view.lit===65536&&view.peak<100)&&
        Math.abs(inside.peak-crossing.peak)<=1&&Math.abs(inside.centerAlpha-crossing.centerAlpha)<=1};
  }finally{
    renderer.setRenderTarget(previousTarget);renderer.setClearColor(clearColor,clearAlpha);renderer.autoClear=autoClear;target.dispose();
    change(saved);if(stored===null)localStorage.removeItem('atlas-cosmic-horizon');else localStorage.setItem('atlas-cosmic-horizon',stored);
    atlas.reset();atlas.invalidate();
  }
}
