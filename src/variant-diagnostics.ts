import * as THREE from 'three';
import {GalaxyVolume,ResolvedGalaxy,type GalaxyDetailData} from './galaxy-detail';
import {catalogLookLabels,type CatalogLookKey} from './galaxy-looks';

/** Every catalog look at the same size, identity and palette: one draw, no texture, unclipped highlights and a
 * bounded light budget per look, at face-on, 60° and 85°. */
export function probeGalaxyVariants(renderer:THREE.WebGLRenderer,source:GalaxyDetailData,preview?:HTMLElement){
 const template=new ResolvedGalaxy(source,'spiral'),size=384,keys=Object.keys(catalogLookLabels) as CatalogLookKey[];
 const target=new THREE.WebGLRenderTarget(size,size),pixels=new Uint8Array(size*size*4),camera=new THREE.PerspectiveCamera(50,1,.000001,100000);
 const previousTarget=renderer.getRenderTarget(),previousColor=renderer.getClearColor(new THREE.Color()),previousAlpha=renderer.getClearAlpha();
 const grid=document.createElement('div');grid.style.cssText=`display:grid;grid-template-columns:repeat(${keys.length},minmax(0,1fr));gap:12px;white-space:normal`;
 const sample=(key:CatalogLookKey,angle:number,show=false)=>{
  const model=new GalaxyVolume({family:'spiral',look:{key,identity:'variant-probe'},gaussians:[],seed:1},template.frame,template.radius,template.center);
  try{
   const radians=angle*Math.PI/180;
   camera.up.copy(model.frame.major);camera.position.copy(model.center).addScaledVector(model.frame.normal,12*model.radius*Math.cos(radians)).addScaledVector(model.frame.minor,12*model.radius*Math.sin(radians));
   camera.lookAt(model.center);camera.updateMatrixWorld();model.update(camera,size,1,true);
   renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();renderer.info.reset();renderer.render(model.scene,camera);renderer.readRenderTargetPixels(target,0,0,size,size,pixels);
   let luminance=0,peak=0,clipped=0,checksum=2166136261;
   for(let i=0;i<pixels.length;i+=4){
    const value=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;luminance+=value;peak=Math.max(peak,pixels[i],pixels[i+1],pixels[i+2]);
    if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>=250)clipped++;
    for(let c=0;c<3;c++)checksum=Math.imul(checksum^pixels[i+c],16777619);
   }
   if(show&&preview){
    const card=document.createElement('div'),caption=document.createElement('div'),canvas=document.createElement('canvas');canvas.width=canvas.height=size;canvas.style.cssText='width:100%;height:auto;background:#06090d;border:1px solid #24343c';
    const rgba=new Uint8ClampedArray(pixels.length);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){const from=((size-1-y)*size+x)*4,to=(y*size+x)*4;rgba.set(pixels.subarray(from,from+3),to);rgba[to+3]=255}
    canvas.getContext('2d')!.putImageData(new ImageData(rgba,size,size),0,0);caption.textContent=catalogLookLabels[key];card.append(canvas,caption);grid.append(card);
   }
   return {angle,luminance,peak,clipped,checksum:checksum>>>0,calls:renderer.info.render.calls,bytes:model.memoryBytes,pickable:model.hitTest(new THREE.Vector2(),camera)};
  }finally{model.dispose()}
 };
 try{
  const cases=keys.map(key=>({look:key,views:[0,60,85].map(angle=>sample(key,angle,angle===0))}));
  const repeat=sample(keys[0],0),faces=cases.map(entry=>entry.views[0].luminance).sort((a,b)=>a-b),median=faces[Math.floor(faces.length/2)];
  const budgets=cases.map(entry=>({look:entry.look,faceLightRatio:entry.views[0].luminance/median}));
  if(preview)preview.append(grid);
  return {cases,budgets,reconstructed:repeat.checksum===cases[0].views[0].checksum,
   passed:repeat.checksum===cases[0].views[0].checksum&&new Set(cases.map(entry=>entry.views[0].checksum)).size===keys.length&&
    cases.every(entry=>entry.views.every(view=>view.pickable&&view.calls===1&&view.bytes===0&&view.clipped===0&&view.luminance>0))&&
    budgets.every(entry=>entry.faceLightRatio>.5&&entry.faceLightRatio<2)};
 }finally{template.dispose();target.dispose();renderer.setRenderTarget(previousTarget);renderer.setClearColor(previousColor,previousAlpha)}
}
