import * as THREE from 'three';
import {ResolvedGalaxy,type GalaxyDetailData} from './galaxy-detail';

/** Actual GPU checks shared by image-inspired disk and cloud volumes. */
export function probeVolumes(renderer:THREE.WebGLRenderer,sources:GalaxyDetailData[],limits:{calls:number;maxBytes:number},preview?:HTMLElement){
 const size=320,target=new THREE.WebGLRenderTarget(size,size),camera=new THREE.PerspectiveCamera(50,1,1e-8,100);
 const previousTarget=renderer.getRenderTarget(),clearColor=renderer.getClearColor(new THREE.Color()),clearAlpha=renderer.getClearAlpha();
 const difference=(a:Uint8Array,b:Uint8Array)=>{let total=0;for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++)total+=Math.abs(a[i+c]-b[i+c]);return total/(size*size*3)};
 const capture=(model:ResolvedGalaxy)=>{
  model.update(camera,size,1,true);renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();renderer.info.reset();renderer.render(model.scene,camera);
  const pixels=new Uint8Array(size*size*4);renderer.readRenderTargetPixels(target,0,0,size,size,pixels);
  let lit=0,clipped=0,peak=0,sum=0,checksum=2166136261;
  for(let i=0;i<pixels.length;i+=4){const max=Math.max(pixels[i],pixels[i+1],pixels[i+2]);if(max>12)lit++;if(max>=250)clipped++;peak=Math.max(peak,max);sum+=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;for(let c=0;c<3;c++)checksum=Math.imul(checksum^pixels[i+c],16777619)}
  return {pixels,metrics:{litPixels:lit,clippedPixels:clipped,peak,mean:sum/(size*size),checksum:checksum>>>0,calls:renderer.info.render.calls,pickable:model.hitTest(new THREE.Vector2(),camera)}};
 };
 const show=(pixels:Uint8Array,label:string)=>{
  if(!preview)return;
  const card=document.createElement('div'),canvas=document.createElement('canvas'),caption=document.createElement('p');canvas.width=canvas.height=size;canvas.style.cssText='width:100%;background:#06090d';caption.textContent=label;
  const rgba=new Uint8ClampedArray(pixels.length);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const from=((size-y-1)*size+x)*4,to=(y*size+x)*4;rgba.set(pixels.subarray(from,from+3),to);rgba[to+3]=255}
  canvas.getContext('2d')!.putImageData(new ImageData(rgba,size,size),0,0);card.append(canvas,caption);preview.append(card);
 };
 try{
  const cases=sources.map(data=>{
   const model=new ResolvedGalaxy(data,'spiral'),material=(model.scene.children[0] as THREE.Mesh<THREE.PlaneGeometry,THREE.RawShaderMaterial>).material;
   const dust=material.uniforms.uDustStrength,savedDust=dust?.value;
   const view=(tilt:number,distance=12,back=false)=>{camera.up.copy(model.frame.major);camera.position.copy(model.center).addScaledVector(model.frame.normal,Math.cos(tilt)*distance*model.radius*(back?-1:1)).addScaledVector(model.frame.minor,Math.sin(tilt)*distance*model.radius);camera.lookAt(model.center);camera.updateMatrixWorld()};
   try{
    const views=[];
    for(const [name,tilt,back] of [['face',0,false],['inclined',1.1,false],['reverse',1.1,true],['edge',Math.PI/2,false]] as const){view(tilt,12,back);const sample=capture(model);views.push({name,...sample.metrics});if(name==='face'||name==='inclined')show(sample.pixels,`${data.name} · ${name}`)}
    view(1.1);const original=capture(model);if(dust)dust.value=0;const clear=capture(model);if(dust)dust.value=savedDust;const repeat=capture(model);
    view(1.101);const moved=capture(model);view(0,.001);const inside=capture(model);
    view(0,12);camera.lookAt(camera.position.clone().add(model.frame.normal));camera.updateMatrixWorld();const behind=capture(model);
    const replacement=new ResolvedGalaxy({...data,galaxy:{...data.galaxy,id:-999}},'catalog');
    let reconstructed=false;try{view(1.1);reconstructed=capture(replacement).metrics.checksum===original.metrics.checksum}finally{replacement.dispose()}
    const dustDifference=difference(original.pixels,clear.pixels),repeatError=difference(original.pixels,repeat.pixels),smallOrbitDifference=difference(original.pixels,moved.pixels);
    return {name:data.name,views,inside:inside.metrics,behind:behind.metrics,dustDifference,repeatError,smallOrbitDifference,reconstructed,memoryBytes:model.memoryBytes,
     passed:views.every(v=>v.litPixels>300&&v.clippedPixels===0&&v.calls===limits.calls&&v.pickable)&&inside.metrics.litPixels>100&&inside.metrics.clippedPixels===0&&behind.metrics.litPixels===0&&(!dust||dustDifference>.1&&original.metrics.mean<clear.metrics.mean)&&repeatError===0&&smallOrbitDifference<2&&reconstructed&&model.memoryBytes<=limits.maxBytes};
   }finally{model.dispose()}
  });
  return {cases,passed:cases.length>0&&cases.every(c=>c.passed)&&new Set(cases.map(c=>c.views[0].checksum)).size===cases.length};
 }finally{target.dispose();renderer.setRenderTarget(previousTarget);renderer.setClearColor(clearColor,clearAlpha)}
}
