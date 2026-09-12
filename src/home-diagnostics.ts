import * as THREE from 'three';
import type {MilkyWay} from './milky-way';

/** Real GPU checks for the home volume's view-dependent light and absorption. */
export function probeHomeAppearance(renderer:THREE.WebGLRenderer,model:MilkyWay){
  const size=256,target=new THREE.WebGLRenderTarget(size,size),camera=new THREE.PerspectiveCamera(50,1,1e-8,10);
  const previousTarget=renderer.getRenderTarget(),clearColor=renderer.getClearColor(new THREE.Color()),clearAlpha=renderer.getClearAlpha();
  const material=(model.scene.children[0] as THREE.Mesh<THREE.PlaneGeometry,THREE.RawShaderMaterial>).material;
  const dust=material.uniforms.uDustStrength,savedDust=dust.value;
  const view=(inclination:number,distance=.044,back=false)=>{
    camera.up.copy(model.frame.major);
    camera.position.copy(model.center).addScaledVector(model.frame.normal,Math.cos(inclination)*distance*(back?-1:1)).addScaledVector(model.frame.minor,Math.sin(inclination)*distance);
    camera.lookAt(model.center);camera.updateMatrixWorld();
  };
  const sample=()=>{
    model.update(camera,size,1,true);renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();
    const calls=renderer.info.render.calls;renderer.render(model.scene,camera);
    const pixels=new Uint8Array(size*size*4);renderer.readRenderTargetPixels(target,0,0,size,size,pixels);
    let lit=0,clipped=0,sum=0,peak=0;for(let i=0;i<pixels.length;i+=4){const max=Math.max(pixels[i],pixels[i+1],pixels[i+2]);if(max>12)lit++;if(max>=250)clipped++;peak=Math.max(peak,max);sum+=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722}
    return {pixels,metrics:{litPixels:lit,clippedPixels:clipped,peak,mean:sum/(size*size),drawCalls:renderer.info.render.calls-calls}};
  };
  const difference=(a:Uint8Array,b:Uint8Array)=>{let total=0;for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++)total+=Math.abs(a[i+c]-b[i+c]);return total/(size*size*3)};
  try{
    const views=[];for(const [name,tilt,back] of [['face',0,false],['inclined',1.1,false],['reverse',1.1,true],['edge',Math.PI/2,false]] as const){view(tilt,.044,back);views.push({name,...sample().metrics})}
    view(1.1);const withDust=sample();dust.value=0;const clear=sample();dust.value=savedDust;
    const repeat=sample(),repeatError=difference(withDust.pixels,repeat.pixels);
    view(1.101);const moved=sample(),smallOrbitDifference=difference(withDust.pixels,moved.pixels);
    view(0,.00001);const inside=sample().metrics;
    camera.position.set(0,0,0);camera.lookAt(model.center);camera.updateMatrixWorld();const sun=sample().metrics;
    const dustDifference=difference(withDust.pixels,clear.pixels);
    return {views,inside,sun,dustDifference,repeatError,smallOrbitDifference,memoryBytes:model.memoryBytes,
      passed:views.every(v=>v.litPixels>200&&v.clippedPixels===0&&v.drawCalls===1)&&inside.litPixels>100&&sun.litPixels>100&&dustDifference>.2&&withDust.metrics.mean<clear.metrics.mean&&repeatError===0&&smallOrbitDifference<2&&model.memoryBytes<3*1048576};
  }finally{dust.value=savedDust;target.dispose();renderer.setRenderTarget(previousTarget);renderer.setClearColor(clearColor,clearAlpha)}
}
