import * as THREE from 'three';
import type {Explorer} from './explorer';

/** Shared boilerplate of the observer-centered overlay probes (development only): saved toggles, an isolated
 * 256² readback with renderer-state restore, pose/catalog preservation and settled frame draw counts. */
export const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
export const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));

/** The real Settings checkbox and its saved key; `restore` puts both back exactly as found. */
export function savedToggle(inputId:string,key:string){
  const input=document.getElementById(inputId) as HTMLInputElement,saved=input.checked,stored=localStorage.getItem(key);
  const set=(checked:boolean)=>{input.checked=checked;input.dispatchEvent(new Event('change'))};
  return {input,set,restore(){set(saved);if(stored===null)localStorage.removeItem(key);else localStorage.setItem(key,stored)}};
}

/** Isolated 256×256 render of `draw` with the renderer state restored afterwards: lit alpha pixels, peak channel,
 * FNV-1a checksum over every channel, centre/corner alpha, lit x-range and draw calls. */
export function overlayProbe(renderer:THREE.WebGLRenderer){
  const target=new THREE.WebGLRenderTarget(256,256,{depthBuffer:false});
  const autoClear=renderer.autoClear,previousTarget=renderer.getRenderTarget(),clearColor=renderer.getClearColor(new THREE.Color()),clearAlpha=renderer.getClearAlpha();
  const restore=()=>{renderer.setRenderTarget(previousTarget);renderer.setClearColor(clearColor,clearAlpha);renderer.autoClear=autoClear};
  return {
    readback(draw:()=>void){
      renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.autoClear=false;renderer.clear();renderer.info.reset();draw();
      const pixels=new Uint8Array(256*256*4);renderer.readRenderTargetPixels(target,0,0,256,256,pixels);
      const calls=renderer.info.render.calls;restore();
      let lit=0,peak=0,checksum=2166136261,minX=256,maxX=-1;
      for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]){lit++;minX=Math.min(minX,(i/4)%256);maxX=Math.max(maxX,(i/4)%256)}for(let j=0;j<4;j++){peak=Math.max(peak,pixels[i+j]);checksum=Math.imul(checksum^pixels[i+j],16777619)}}
      return {lit,peak,checksum:checksum>>>0,minX,maxX,centerAlpha:pixels[(128*256+128)*4+3],cornerAlpha:pixels[3],calls};
    },
    dispose(){restore();target.dispose()},
  };
}

/** Snapshot of camera pose and catalog identity, compared later within float noise: OrbitControls re-derives the
 * position from spherical coordinates, and Quaternion.angleTo (2·acos of the dot product) cannot resolve below
 * about 3e-8 rad near identity, so the angle tolerance is a microradian. */
export function preservation(atlas:Explorer){
  const position=atlas.camera.position.clone(),rotation=atlas.camera.quaternion.clone(),focus=atlas.controls.target.clone();
  const count=atlas.manifest.count,selected=atlas.selected,measured=atlas.measurementDistance;
  return ()=>{
    const poseDelta={positionMpc:position.distanceTo(atlas.camera.position),angleRad:rotation.angleTo(atlas.camera.quaternion),focusMpc:focus.distanceTo(atlas.controls.target)};
    return {poseDelta,posePreserved:poseDelta.positionMpc<=position.length()*1e-9&&poseDelta.angleRad<=1e-6&&poseDelta.focusMpc<=Math.max(1,focus.length())*1e-9,
      catalogPreserved:count===atlas.manifest.count&&selected===atlas.selected&&measured===atlas.measurementDistance};
  };
}

/** Draw calls of a complete real frame once streaming has settled: two consecutive frames with equal counts and
 * nothing pending, bounded by the deadline. A frame taken mid-stream would attribute newly resident chunks to a toggle. */
export async function settledFrameCalls(atlas:Explorer){
  let previous=-1;const deadline=performance.now()+20000;
  for(;;){atlas.invalidate();await frame();const current={calls:atlas.stats.calls,pending:atlas.stats.pending};if((current.calls===previous&&!current.pending)||performance.now()>deadline)return current;previous=current.calls;await sleep(200)}
}
