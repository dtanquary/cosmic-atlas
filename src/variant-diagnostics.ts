import * as THREE from 'three';
import {GalaxyVolume,ResolvedGalaxy,spiralLight,type GalaxyDetailData} from './galaxy-detail';
import {galaxyVariants,type GalaxyVariant} from './galaxy-variants';

/** Identical size, seed and palette isolate the effect of changing the disk recipe. */
export function probeGalaxyVariants(renderer:THREE.WebGLRenderer,source:GalaxyDetailData,preview?:HTMLElement){
 const template=new ResolvedGalaxy(source,'spiral'),light=spiralLight(source),size=384;
 const target=new THREE.WebGLRenderTarget(size,size),pixels=new Uint8Array(size*size*4),camera=new THREE.PerspectiveCamera(50,1,.000001,100000);
 const previousTarget=renderer.getRenderTarget(),previousColor=renderer.getClearColor(new THREE.Color()),previousAlpha=renderer.getClearAlpha();
 const grid=document.createElement('div');grid.style.cssText=`display:grid;grid-template-columns:repeat(${galaxyVariants.length},minmax(0,1fr));gap:12px;white-space:normal`;
 const sample=(variant:GalaxyVariant,angle:number,show=false)=>{
  const model=new GalaxyVolume({...light,spiral:{...light.spiral!,...variant,innerStyle:'innerStyle' in variant?variant.innerStyle:undefined,armStyle:'armStyle' in variant?variant.armStyle:undefined}},template.frame,template.radius,template.center);
  try{
   const radians=angle*Math.PI/180;
   camera.up.copy(model.frame.major);camera.position.copy(model.center).addScaledVector(model.frame.normal,12*model.radius*Math.cos(radians)).addScaledVector(model.frame.minor,12*model.radius*Math.sin(radians));
   camera.lookAt(model.center);camera.updateMatrixWorld();model.update(camera,size,1,true);
   renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();renderer.info.reset();renderer.render(model.scene,camera);renderer.readRenderTargetPixels(target,0,0,size,size,pixels);
   let luminance=0,peak=0,hotPixels=0,checksum=2166136261;
   for(let i=0;i<pixels.length;i+=4){
    const value=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;luminance+=value;peak=Math.max(peak,value);if(value>=220)hotPixels++;
    for(let c=0;c<3;c++)checksum=Math.imul(checksum^pixels[i+c],16777619);
   }
   if(show&&preview){
    const card=document.createElement('div'),caption=document.createElement('div'),canvas=document.createElement('canvas');canvas.width=canvas.height=size;canvas.style.cssText='width:100%;height:auto;background:#06090d;border:1px solid #24343c';
    const rgba=new Uint8ClampedArray(pixels.length);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){const from=((size-1-y)*size+x)*4,to=(y*size+x)*4;rgba.set(pixels.subarray(from,from+3),to);rgba[to+3]=255}
    canvas.getContext('2d')!.putImageData(new ImageData(rgba,size,size),0,0);caption.textContent=variant.label;card.append(canvas,caption);grid.append(card);
   }
   return {angle,luminance,peak,hotPixels,checksum:checksum>>>0,calls:renderer.info.render.calls,bytes:model.memoryBytes,pickable:model.hitTest(new THREE.Vector2(),camera)};
  }finally{model.dispose()}
 };
 try{
  const cases=galaxyVariants.map(variant=>({variant:variant.key,views:[0,60,85].map(angle=>sample(variant,angle,angle===0))}));
  const reference=cases[0].views,repeat=sample(galaxyVariants[0],0);
  const comparisons=cases.slice(1).map(entry=>({variant:entry.variant,views:entry.views.map((view,i)=>({angle:view.angle,lightRatio:view.luminance/reference[i].luminance,peakRatio:view.peak/reference[i].peak,extraHotPixels:view.hotPixels-reference[i].hotPixels}))}));
  if(preview)preview.append(grid);
  return {cases,comparisons,reconstructed:repeat.checksum===reference[0].checksum,
   passed:repeat.checksum===reference[0].checksum&&new Set(cases.map(entry=>entry.views[0].checksum)).size===galaxyVariants.length&&
    cases.every(entry=>entry.views.every(view=>view.pickable&&view.calls===2&&view.bytes===reference[0].bytes))&&
    comparisons.every(entry=>entry.views.every(view=>view.lightRatio>.9&&view.lightRatio<1.1&&view.peakRatio<1.3&&view.extraHotPixels<=8))};
 }finally{template.dispose();target.dispose();renderer.setRenderTarget(previousTarget);renderer.setClearColor(previousColor,previousAlpha)}
}
