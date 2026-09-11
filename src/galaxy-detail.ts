import * as THREE from 'three';
import {cartesian} from './format';
import spiralProfile from './data/spiral-profile.json';
import type {Galaxy} from './types';
import {galaxyColors,type GalaxyColors} from './galaxy-colors';
import {galaxyVariant} from './galaxy-variants';

export type GalaxyFamily='spiral'|'barred'|'elliptical'|'lenticular'|'irregular';
export type GalaxyAppearance='spiral'|'catalog';
export type ModelDisplay='automatic'|'focused'|'points';
export const familyLabels:Record<GalaxyFamily,string>={spiral:'Spiral',barred:'Barred spiral',elliptical:'Elliptical',lenticular:'Lenticular',irregular:'Irregular'};

export interface GalaxyDetailData {
  version:1; catalogId:string; catalogSourceSha256:string; name:string; galaxy:Galaxy;
  shape:{radiusArcsec:number; e1:number; e2:number; sersic:number; profileType:string};
  gaussians:{sigmaRe:number; peak:number}[]; fitMaxRelativeError:number;
  spiral?:{arms:number; pitchDegrees:number; phaseRadians:number; seed:number; bar?:boolean; barRadiusRe?:number;innerStyle?:'ring'};
  model?:{family:GalaxyFamily;typeSource:'catalog'|'proxy';typeLabel:string;shapeMeasured:boolean;sourceName?:string;profileIndex:number};
  knotCount?:number;
}

/** Deterministic illustrative arm knots in galaxy coordinates, in units of R_e. */
export function spiralSamples(parameters:NonNullable<GalaxyDetailData['spiral']>,count=24000,palette?:GalaxyColors){
  let seed=parameters.seed>>>0;
  const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return (seed+.5)/4294967296};
  const normal=()=>Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random());
  const positions=new Float32Array(count*3),colors=new Float32Array(count*3),sizes=new Float32Array(count);
  const winding=1/Math.tan(THREE.MathUtils.degToRad(parameters.pitchDegrees));
  for(let i=0;i<count;i++){
    const barRadius=parameters.barRadiusRe??.95;
    const start=parameters.bar?(parameters.barRadiusRe===undefined?.85:barRadius*.9):.32;
    const r=start-Math.log(random()*random())/1.55;
    // Keep the faint outer skirt bounded; no structure outside the measured scale.
    if(r>4.5){i--;continue}
    const arm=i%parameters.arms;
    const phase=parameters.phaseRadians+arm*2*Math.PI/parameters.arms+winding*Math.log(r/start);
    let angle=random()<.2?random()*2*Math.PI:phase+normal()*(.2+.045*r)+.08*Math.sin(r*10+arm*3);
    // Variants move light around the disk, never toward the core or farther out.
    // Reuse existing angles: no extra samples, random draws, or concentrated bulge.
    // Keep half the samples on their spiral paths, balanced across both arms.
    if(parameters.innerStyle==='ring'&&i%4<2){
      const strength=THREE.MathUtils.smoothstep(r,.45,.8)*(1-THREE.MathUtils.smoothstep(r,1.25,1.65));
      const ringAngle=parameters.phaseRadians+i*2.399963229728653;
      angle+=Math.atan2(Math.sin(ringAngle-angle),Math.cos(ringAngle-angle))*strength;
    }
    positions.set([r*Math.cos(angle),r*Math.sin(angle),normal()*.035],i*3);
    if(parameters.bar&&random()<.27){
      const x=(random()*2-1)*barRadius,y=normal()*.09,c=Math.cos(parameters.phaseRadians),s=Math.sin(parameters.phaseRadians);
      positions.set([x*c-y*s,x*s+y*c,normal()*.045],i*3);
    }
    const young=random(),warm=1-THREE.MathUtils.smoothstep(Math.hypot(positions[i*3],positions[i*3+1]),.3,1.1);
    if(palette){for(let channel=0;channel<3;channel++)colors[i*3+channel]=young<palette.emissionFraction?palette.emission[channel]:palette.disk[channel]+(palette.core[channel]-palette.disk[channel])*warm}
    else{const color=young<.035?new THREE.Color(.95,.42,.58):new THREE.Color(.45+.45*warm,.68+.18*warm,1-.25*warm);colors.set([color.r,color.g,color.b],i*3)}
    sizes[i]=.04+random()*.05;
  }
  return {positions,colors,sizes};
}

/** Irregular light clumps, not individually measured stars or star-forming regions. */
export function irregularSamples(seed:number,count=12000,palette?:GalaxyColors){
  let state=seed>>>0;
  const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return (state+.5)/4294967296};
  const normal=()=>Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random());
  const centers=Array.from({length:7},()=>[normal()*.85,normal()*.7,normal()*.14]);
  const positions=new Float32Array(count*3),colors=new Float32Array(count*3),sizes=new Float32Array(count);
  for(let i=0;i<count;i++){
    const c=centers[i%centers.length],diffuse=random()<.22;
    const x=diffuse?normal()*1.2:c[0]+normal()*.24,y=diffuse?normal()*1.1:c[1]+normal()*.22,z=normal()*.16+(diffuse?0:c[2]);
    if(x*x+y*y+z*z>20.25){i--;continue}
    positions.set([x,y,z],i*3);const pink=random()<(palette?.emissionFraction??.06);
    colors.set(palette?(pink?palette.emission:palette.disk):pink?[.95,.43,.57]:[.53,.73,.98],i*3);sizes[i]=.065+random()*.08;
  }
  return {positions,colors,sizes};
}

export function galaxyFrame(ra:number,dec:number,e1:number,e2:number,thickness=.12){
  const radial=new THREE.Vector3().fromArray(cartesian(ra,dec,1));
  const a=THREE.MathUtils.degToRad(ra),d=THREE.MathUtils.degToRad(dec);
  const east=new THREE.Vector3(-Math.sin(a),Math.cos(a),0);
  const north=new THREE.Vector3(-Math.sin(d)*Math.cos(a),-Math.sin(d)*Math.sin(a),Math.cos(d));
  const e=Math.hypot(e1,e2),q=(1-e)/(1+e),theta=Math.atan2(e2,e1)/2;
  if(e>=1||thickness<=0||thickness>=q)throw new Error('Shape cannot be deprojected with this assumed thickness');
  // Tractor getRaDecBasis: major=(sin(theta),cos(theta)) in (east,north).
  // Do not interpret theta as a screen-space angle or reverse the RA axis.
  const major=north.clone().multiplyScalar(Math.cos(theta)).addScaledVector(east,Math.sin(theta));
  const skyMinor=east.clone().multiplyScalar(Math.cos(theta)).addScaledVector(north,-Math.sin(theta));
  const cosI=Math.sqrt((q*q-thickness*thickness)/(1-thickness*thickness)),sinI=Math.sqrt(1-cosI*cosI);
  const minor=skyMinor.clone().multiplyScalar(cosI).addScaledVector(radial,sinI);
  const normal=new THREE.Vector3().crossVectors(major,minor).normalize();
  return {major,minor,normal,radial,north,east,q,thickness,inclination:THREE.MathUtils.radToDeg(Math.acos(cosI)),positionAngle:(THREE.MathUtils.radToDeg(theta)+180)%180};
}

export function galaxyRadius(distanceMpc:number,radiusArcsec:number){
  // D_A * angular radius is physical size. Our world uses comoving size:
  // D_A * (1+z) * angle = D_C * angle for the atlas's flat Planck18 cosmology.
  return distanceMpc*radiusArcsec*Math.PI/(180*3600);
}

export function detailBlend(radiusPixels:number){
  const t=THREE.MathUtils.clamp((radiusPixels-.6)/4.4,0,1);
  return t*t*(3-2*t);
}

/** Visibility is a navigation cue; measured geometry is never resized. */
export function modelBlend(radiusPixels:number,shortSide:number,focused=false,display:ModelDisplay='automatic'){
  if(display==='points'||display==='focused'&&!focused)return 0;
  const resolved=detailBlend(radiusPixels);
  // Keep intentional fly-throughs intact. Incidental light (extending to 8 R_e)
  // returns to its catalog marker before its body occupies the whole viewport.
  return focused?resolved:resolved*(1-THREE.MathUtils.smoothstep(radiusPixels/Math.max(1,shortSide),.06,.16));
}

const vertex=`precision highp float;
in vec3 position;
uniform vec4 uBounds;
out vec2 vNdc;
void main(){vNdc=mix(uBounds.xy,uBounds.zw,position.xy*.5+.5);gl_Position=vec4(vNdc,0.,1.);}`;

const fragment=`precision highp float;
in vec2 vNdc;
uniform mat3 uToModel;
uniform vec3 uOrigin,uForward,uRight,uUp,uDiskColor,uCoreColor;
uniform vec2 uProjection;
uniform vec2 uGaussians[20];
uniform float uMix,uNormalization,uExposure,uPalette;
out vec4 fragColor;
// Analytic half-ray integral of an oblate Gaussian. Integrating only in front
// of the camera also allows flying through the volume without a billboard flip.
float erfcApprox(float x){
  float z=abs(x),t=1./(1.+.3275911*z);
  float p=(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t;
  float value=p*exp(-z*z);return x<0.?2.-value:value;
}
void main(){
  vec3 ray=uToModel*normalize(uForward+vNdc.x*uProjection.x*uRight+vNdc.y*uProjection.y*uUp);
  float a=dot(ray,ray),b=dot(uOrigin,ray);
  vec3 perpendicular=cross(uOrigin,ray);
  float r2=dot(perpendicular,perpendicular)/a;
  if(r2>64.)discard;
  float brightness=0.;
  for(int i=0;i<20;i++){
    vec2 g=uGaussians[i];
    brightness+=g.y*exp(-.5*r2/(g.x*g.x))*.5*erfcApprox(b/(sqrt(2.*a)*g.x));
  }
  brightness*=uNormalization/sqrt(a);
  float light=(1.-exp(-uExposure*brightness))*(1.-smoothstep(36.,64.,r2));
  if(light<.0001)discard;
  // Color is illustrative and independent of the source light profile.
  vec3 color=mix(uDiskColor,uCoreColor,smoothstep(uPalette == 1. ? .03 : .04,uPalette == 1. ? 1.5 : 1.6,brightness));
  fragColor=vec4(color*light,uMix);
}`;

export interface VolumeFrame {major:THREE.Vector3;minor:THREE.Vector3;normal:THREE.Vector3;thickness:number;q:number}
export interface GalaxyLight {family:GalaxyFamily;gaussians:GalaxyDetailData['gaussians'];spiral?:GalaxyDetailData['spiral'];seed:number;knotCount?:number;exposure?:number;colors?:GalaxyColors}

/** One shared exposure/profile/point budget for every illustrative disk variant. */
export function spiralLight(data:GalaxyDetailData):GalaxyLight {
  return {family:'spiral',colors:galaxyColors(data.galaxy.targetId),gaussians:spiralProfile.gaussians,
    spiral:galaxyVariant(data.galaxy.targetId).parameters,seed:data.galaxy.id,
    knotCount:data.knotCount??(data.spiral?24000:12000),exposure:.55};
}

/** Shared renderer; reference models need no invented catalog identity. */
export class GalaxyVolume<F extends VolumeFrame=VolumeFrame> {
  readonly scene=new THREE.Scene();
  readonly blend={value:0};
  private readonly material:THREE.RawShaderMaterial;
  private readonly mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.RawShaderMaterial>;
  private readonly toModel:THREE.Matrix3;
  private readonly relative=new THREE.Vector3();
  private readonly viewCenter=new THREE.Vector3();
  private readonly rotation=new THREE.Matrix3();
  private readonly raycaster=new THREE.Raycaster();
  private readonly rayOrigin=new THREE.Vector3();
  private readonly rayDirection=new THREE.Vector3();
  private arms:THREE.Points<THREE.BufferGeometry,THREE.RawShaderMaterial>|null=null;

  constructor(data:GalaxyLight,readonly frame:F,readonly radius:number,readonly center:THREE.Vector3){
    const family=data.family;
    const disk=data.colors?.disk??(family==='elliptical'?[.72,.58,.46]:family==='irregular'?[.42,.63,.86]:[.48,.68,.82]);
    const core=data.colors?.core??(family==='irregular'?[.86,.91,1]:family==='elliptical'?[1,.91,.75]:[1,.93,.76]);
    const {major:x,minor:y,normal:z,thickness,q}=this.frame;
    this.toModel=new THREE.Matrix3().set(x.x,x.y,x.z,y.x,y.y,y.z,z.x/thickness,z.y/thickness,z.z/thickness);
    const gaussians=Array.from({length:20},(_,i)=>new THREE.Vector2(data.gaussians[i]?.sigmaRe??1,data.gaussians[i]?.peak??0));
    this.material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:vertex,fragmentShader:fragment,
      uniforms:{uBounds:{value:new THREE.Vector4(-1,-1,1,1)},uToModel:{value:this.toModel},
        uOrigin:{value:new THREE.Vector3()},uForward:{value:new THREE.Vector3()},uRight:{value:new THREE.Vector3()},uUp:{value:new THREE.Vector3()},
        uDiskColor:{value:new THREE.Vector3().fromArray(disk)},uCoreColor:{value:new THREE.Vector3().fromArray(core)},
        uProjection:{value:new THREE.Vector2()},uGaussians:{value:gaussians},uMix:this.blend,uNormalization:{value:this.frame.q/this.frame.thickness},uExposure:{value:data.exposure??(family==='irregular'?.2:.55)},uPalette:{value:family==='elliptical'?1:family==='irregular'?2:0}},
      transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false,toneMapped:false});
    this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);this.mesh.frustumCulled=false;this.mesh.visible=false;this.scene.add(this.mesh);
    if(data.spiral||family==='irregular'){
      const samples=family==='irregular'?irregularSamples(data.seed,data.knotCount,data.colors):spiralSamples(data.spiral!,data.knotCount,data.colors),position=new THREE.Vector3();
      for(let i=0;i<samples.positions.length;i+=3){
        position.copy(x).multiplyScalar(samples.positions[i]).addScaledVector(y,samples.positions[i+1]).addScaledVector(z,samples.positions[i+2]).multiplyScalar(this.radius);
        samples.positions.set(position.toArray(),i);
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(samples.positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(samples.colors,3));geometry.setAttribute('size',new THREE.BufferAttribute(samples.sizes,1));
      const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,
        vertexShader:`precision highp float;uniform mat4 projectionMatrix,viewMatrix;uniform vec3 uOrigin;uniform float uScale;in vec3 position,color;in float size;out vec3 vColor;out float vWeight;
        void main(){vec3 view=mat3(viewMatrix)*(position+uOrigin);gl_Position=projectionMatrix*vec4(view,1.);float diameter=uScale*size/max(.000001,-view.z);gl_PointSize=clamp(diameter,1.,64.);vWeight=min(1.,pow(diameter/gl_PointSize,2.));vColor=color;}`,
        fragmentShader:`precision highp float;uniform float uMix;in vec3 vColor;in float vWeight;out vec4 fragColor;
        void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;float glow=exp(-18.*r*r)*(1.-smoothstep(.38,.5,r));fragColor=vec4(vColor,.055*glow*vWeight*uMix);}`,
        uniforms:{uOrigin:{value:new THREE.Vector3()},uScale:{value:1},uMix:this.blend},transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false,toneMapped:false});
      this.arms=new THREE.Points(geometry,material);this.arms.frustumCulled=false;this.arms.renderOrder=1;this.arms.visible=false;this.scene.add(this.arms);
    }
  }

  update(camera:THREE.PerspectiveCamera,height:number,pixelRatio=1,focused=false,display:ModelDisplay='automatic',presence=1){
    camera.updateMatrixWorld();
    this.relative.copy(this.center).sub(camera.position);
    const distance=this.relative.length(),tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    this.blend.value=modelBlend(this.radius*height/(2*tan*Math.max(distance,1e-10)),Math.min(height,height*camera.aspect),focused,display)*presence;
    this.mesh.visible=this.blend.value>0;
    if(this.arms)this.arms.visible=false;
    if(!this.mesh.visible)return;
    this.rotation.setFromMatrix4(camera.matrixWorldInverse);
    this.viewCenter.copy(this.relative).applyMatrix3(this.rotation);
    const z=-this.viewCenter.z,bound=8*this.radius,bounds=this.material.uniforms.uBounds.value as THREE.Vector4;
    if(z < -bound){this.mesh.visible=false;this.blend.value=0;return}
    if(z<=bound)bounds.set(-1,-1,1,1);
    else{
      // Conservative projected bounds: include the sphere's near and far depths,
      // including when its center is away from the optical axis.
      const edge=(v:number,aspect:number)=>{
        const values=[(v-bound)/(z-bound),(v-bound)/(z+bound),(v+bound)/(z-bound),(v+bound)/(z+bound)];
        return [Math.max(-1,Math.min(...values)/(tan*aspect)),Math.min(1,Math.max(...values)/(tan*aspect))];
      };
      const [left,right]=edge(this.viewCenter.x,camera.aspect),[bottom,top]=edge(this.viewCenter.y,1);
      if(left>=right||bottom>=top){this.mesh.visible=false;this.blend.value=0;return}
      bounds.set(left,bottom,right,top);
    }
    const uniforms=this.material.uniforms;
    uniforms.uOrigin.value.copy(this.relative).negate().divideScalar(this.radius).applyMatrix3(this.toModel);
    camera.getWorldDirection(uniforms.uForward.value);
    uniforms.uRight.value.setFromMatrixColumn(camera.matrixWorld,0);
    uniforms.uUp.value.setFromMatrixColumn(camera.matrixWorld,1);
    uniforms.uProjection.value.set(tan*camera.aspect,tan);
    if(this.arms){this.arms.visible=true;this.arms.material.uniforms.uOrigin.value.copy(this.relative);this.arms.material.uniforms.uScale.value=this.radius*height*pixelRatio/(2*tan)}
  }

  hitTest(ndc:THREE.Vector2,camera:THREE.PerspectiveCamera){
    if(!this.mesh.visible||this.blend.value<.1)return false;
    this.raycaster.setFromCamera(ndc,camera);
    this.rayOrigin.copy(this.raycaster.ray.origin).sub(this.center).divideScalar(this.radius).applyMatrix3(this.toModel);
    this.rayDirection.copy(this.raycaster.ray.direction).applyMatrix3(this.toModel).normalize();
    const along=-this.rayOrigin.dot(this.rayDirection);
    // Select the visible body (out to 4 R_e), including from inside the model.
    return this.rayOrigin.addScaledVector(this.rayDirection,Math.max(0,along)).lengthSq()<16;
  }

  get visible(){return this.mesh.visible}
  get memoryBytes(){return this.arms?this.arms.geometry.getAttribute('position').array.byteLength*2+this.arms.geometry.getAttribute('color').array.byteLength*2+this.arms.geometry.getAttribute('size').array.byteLength*2:0}
  dispose(){this.mesh.geometry.dispose();this.material.dispose();this.arms?.geometry.dispose();this.arms?.material.dispose()}
}

/** A measured catalog observation using the shared light renderer. */
export class ResolvedGalaxy extends GalaxyVolume<ReturnType<typeof galaxyFrame>> {
  constructor(readonly data:GalaxyDetailData,readonly appearance:GalaxyAppearance='catalog'){
    const {galaxy,shape}=data;
    const family=appearance==='spiral'?'spiral':data.model?.family??(data.spiral?'spiral':'lenticular');
    const q=(1-Math.hypot(shape.e1,shape.e2))/(1+Math.hypot(shape.e1,shape.e2));
    const intrinsic=Math.min(family==='elliptical'?.65:family==='irregular'?.3:.12,q*.95);
    super(appearance==='spiral'?spiralLight(data):{family,colors:galaxyColors(galaxy.targetId),gaussians:data.gaussians,spiral:data.spiral,seed:galaxy.id,knotCount:data.knotCount??(data.spiral?24000:12000)},
      galaxyFrame(galaxy.ra,galaxy.dec,shape.e1,shape.e2,intrinsic),galaxyRadius(galaxy.distance,shape.radiusArcsec),new THREE.Vector3().fromArray(galaxy.position));
  }
}
