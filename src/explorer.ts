import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ChunkLoader } from './loader';
import { chooseFrontier, coveredFrontier } from './spatial';
import { decodeGalaxy, separation } from './format';
import {ResolvedGalaxy, detailBlend, type GalaxyDetailData, type ModelDisplay,type GalaxyAppearance} from './galaxy-detail';
import {ModelCatalog,MODEL_LIMIT,decodeModel,measuredShape} from './model-catalog';
import {MilkyWay} from './milky-way';
import {createNearbyGalaxies} from './nearby-galaxies';
import {LOCAL_REDSHIFT_GUARD_MPC,uncertainLocalDistance,uncertainLocalPosition} from './local-distances';
import type { Galaxy, Manifest, SpatialNode } from './types';

const vertex=`precision highp float;
precision highp int;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform vec3 uOrigin;
uniform float uSize;
uniform uint uNode;
uniform bool uDepthCues;
uniform bool uEnlargePoints;
uniform bool uLocalChunk,uHideUncertainLocal;
uniform vec3 uWorldOrigin;
uniform vec2 uFadeRange;
uniform vec3 uDetailOrigins[${MODEL_LIMIT}];
uniform float uDetailMix[${MODEL_LIMIT}];
uniform float uMinOpacity;
out float vDetail;
out float vVisibility;
out float vUncertainLocal;
in vec3 position;
in float detailSlot;
flat out uint vCode;
void main(){
  vec3 relative = position + uOrigin;
  vDetail = 0.0;
  if(detailSlot>0.0){int slot=int(detailSlot)-1;relative=uDetailOrigins[slot];vDetail=uDetailMix[slot];}
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * relative, 1.0);
  gl_PointSize = uSize;
  vVisibility = 1.0;
  vUncertainLocal = 0.0;
  if(uDepthCues || uEnlargePoints){
    float distanceToCamera = length(relative);
    if(uDepthCues) vVisibility = mix(1.0,uMinOpacity,smoothstep(uFadeRange.x, uFadeRange.y, distanceToCamera));
    // Screen markers grow by at most 65%, only within 150 Mpc of the camera.
    if(uEnlargePoints) gl_PointSize *= 1.0 + .65 * (1.0 - smoothstep(0.0, 150.0, distanceToCamera));
  }
  if(uLocalChunk){
    vec3 world = position + uWorldOrigin;
    if(dot(world,world) < ${(LOCAL_REDSHIFT_GUARD_MPC**2).toFixed(1)}){
      vUncertainLocal = 1.0;
      if(uHideUncertainLocal) vVisibility = 0.0;
    }
  }
  vCode = (uNode << 16u) | uint(gl_VertexID);
}`;
const pointFragment=`precision highp float;
in float vVisibility;
in float vDetail;
in float vUncertainLocal;
uniform bool uDepthCues;
out vec4 fragColor;
void main(){
  float r=length(gl_PointCoord-vec2(.5));
  if(r>.5||vVisibility<=0.0)discard;
  float alpha=(uDepthCues?vVisibility:.88)*(1.0-smoothstep(.25,.5,r));
  alpha *= 1.0 - vDetail;
  if(alpha<=0.0)discard;
  fragColor=vec4(mix(vec3(.73,.82,.9),vec3(1.,.61,.23),vUncertainLocal),alpha);
}`;
const pickFragment=`precision highp float;
precision highp int;
flat in uint vCode;
in float vVisibility;
out vec4 fragColor;
void main(){if(length(gl_PointCoord-vec2(.5))>.5||vVisibility<=0.0)discard;fragColor=vec4(float(vCode&255u),float((vCode>>8u)&255u),float((vCode>>16u)&255u),float((vCode>>24u)&255u))/255.0;}`;
const markerFragment=`precision highp float;
uniform vec3 uColor;
out vec4 fragColor;
void main(){float r=length(gl_PointCoord-vec2(.5));if(r>.49||r<.34)discard;fragColor=vec4(uColor,.9);}`;
const lineFragment=`precision highp float;out vec4 fragColor;void main(){fragColor=vec4(.4,.76,.85,.7);}`;

interface Resident {
  node: SpatialNode; buffer: ArrayBuffer; ids: Uint32Array; points: THREE.Points<THREE.BufferGeometry,THREE.RawShaderMaterial>;
  bytes: number; used: number; modelRows:number[];
}
export interface AtlasStats {
  drawn:number; loaded:number; represented:number; pending:number; failed:number; mode:'adaptive'|'full'; complete:boolean;
  fps:number; p95:number; calls:number; managedMiB:number; blocked:boolean; focusDistance:number; budget:number; models:number;
}
export class Explorer {
  readonly renderer:THREE.WebGLRenderer;
  readonly camera=new THREE.PerspectiveCamera(50,1,.0001,100000);
  readonly controls:OrbitControls;
  readonly canvas:HTMLCanvasElement;
  manifest!:Manifest;
  mode:'adaptive'|'full'='adaptive';
  units:'ly'|'Mpc'='ly';
  flight=false;
  autoFly=false;
  speed=1000;
  selected:Galaxy|null=null;
  readonly milkyWay=new MilkyWay();
  galaxyAppearance:GalaxyAppearance='spiral';
  readonly nearbyGalaxies=createNearbyGalaxies(this.galaxyAppearance);
  private get allModels(){return [...this.resolvedGalaxies,...this.nearbyGalaxies]}
  homeSelected=false;
  private homeFocused=false;
  get homeView(){return !this.homeFocused?null:this.controls.target.distanceToSquared(this.milkyWay.center)<1e-18?'galaxy':this.controls.target.lengthSq()<1e-18?'sun':null}
  onHomeSelection=(active:boolean)=>{};
  // Inspection and navigation focus are independent: Observer preserves details
  // while removing a previous galaxy's intentional close-up exemption.
  private focusedGalaxyId:number|null=null;
  private modelDisplay:ModelDisplay='automatic';
  resolvedGalaxies:ResolvedGalaxy[]=[];
  private modelPresence=new Map<number,{value:number;target:number}>();
  modelCatalog:ModelCatalog|null=null;
  get resolved(){return this.resolvedGalaxies.find(model=>model.data.galaxy.id===this.selected?.id)??this.resolvedGalaxies[0]??null}
  resolvedFor(id:number){return this.allModels.find(model=>model.data.galaxy.id===id)}
  catalogAsset(path:string){return new URL(`../${path}`,this.base).href}
  measurement:Galaxy[]=[];
  measuring=false;
  onStats=(stats:AtlasStats)=>{};
  onSelection=(galaxy:Galaxy|null)=>{};
  onMeasure=(galaxies:Galaxy[],enabled:boolean)=>{};
  onFlight=(active:boolean)=>{};
  onAutoFly=(active:boolean)=>{};
  onMessage=(message:string)=>{};
  onReady=()=>{};
  onError=(message:string)=>{};
  onOrigin=(x:number,y:number,visible:boolean)=>{};
  onHomeCenter=(x:number,y:number,visible:boolean)=>{};
  private scene=new THREE.Scene();
  private annotations=new THREE.Scene();
  private loader=new ChunkLoader();
  private nodes=new Map<string,SpatialNode>();
  private bounds=new Map<string,THREE.Box3>();
  private spheres=new Map<string,THREE.Sphere>();
  private parents=new Map<string,string>();
  private cache=new Map<string,Resident>();
  private metadata=new Map<string,ArrayBuffer>();
  private pending=new Set<string>();
  private failed=new Map<string,string>();
  private required=new Set<string>();
  private desired=new Set<string>();
  private drawn:string[]=[];
  private references=new Uint8Array(0);
  private loadedUnique=0;
  private root='0';
  private base='';
  private frame=0;
  private lastTime=0;
  private lastLOD=0;
  private lastStats=0;
  private dirty=true;
  private ready=false;
  private contextLost=false;
  private disposed=false;
  private blocked=false;
  private sampleBudget=1_000_000;
  private timings:number[]=[];
  private adaptationFrames=0;
  private wasContinuous=false;
  private overviewPosition=new THREE.Vector3();
  private overviewTarget=new THREE.Vector3();
  private overviewRadius=1;
  private keys=new Set<string>();
  private focusDistance=1;
  private pixelRatio=1;
  private selectionSerial=0;
  private picking=false;
  private depthCueUniform={value:true};
  private enlargePointsUniform={value:false};
  private hideUncertainLocalUniform={value:true};
  get showUncertainLocal(){return !this.hideUncertainLocalUniform.value}
  private fadeRangeUniform={value:new THREE.Vector2(100,1000)};
  private detailBlendUniform={value:new Float32Array(MODEL_LIMIT)};
  private detailOriginsUniform={value:Array.from({length:MODEL_LIMIT},()=>new THREE.Vector3())};
  private modelRequests=new Map<number,Promise<ResolvedGalaxy>>();
  private pinnedModels=new Set<number>();
  private modelLocations=new Map<number,{node:string;row:number}>();
  private wantedModels=new Set<number>();
  private lastModelScan=0;
  private modelScanNeeded=true;
  private minOpacityUniform={value:0};
  private pickTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.UnsignedByteType,format:THREE.RGBAFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true,stencilBuffer:false});
  private pickMaterial=this.material(pickFragment,9,false,true);
  private originMarker=this.marker(0x7299ad,7);
  private homeCenterMarker=this.marker(0xd4bd96,7);
  private selectionMarker=this.marker(0xb6f1fa,15);
  private measureMarkers=[this.marker(0x9ee4f1,13),this.marker(0x9ee4f1,13)];
  private measureLine=new THREE.Line(new THREE.BufferGeometry(),this.material(lineFragment,1,true));
  private nearbyScene=new THREE.Scene();
  private nearbyPicker=this.material(pickFragment,9,false,true);
  private nearbyPoints=this.createNearbyPoints();
  private frustum=new THREE.Frustum();
  private clipMatrix=new THREE.Matrix4();
  private scratch=new THREE.Vector3();
  private lifecycle=new AbortController();

  constructor(viewport:HTMLElement){
    this.renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance',alpha:false,reversedDepthBuffer:true});
    this.renderer.setClearColor(0x06090d,1);this.renderer.info.autoReset=false;
    this.canvas=this.renderer.domElement;this.canvas.tabIndex=0;this.canvas.setAttribute('aria-label','Galaxy map. Drag to orbit, scroll to zoom, click a point to inspect.');
    viewport.append(this.canvas);this.camera.up.set(0,0,1);
    this.controls=new OrbitControls(this.camera,this.canvas);this.controls.enableDamping=true;this.controls.dampingFactor=.09;this.controls.minDistance=.00001;this.controls.zoomSpeed=.9;
    this.controls.addEventListener('change',()=>{this.dirty=true;this.invalidate()});
    this.loader.onChange=()=>{this.dirty=true;this.invalidate()};
    this.pickMaterial.blending=THREE.NoBlending;this.pickMaterial.depthWrite=true;
    this.nearbyPicker.blending=THREE.NoBlending;this.nearbyPicker.depthWrite=true;this.nearbyScene.add(this.nearbyPoints);
    this.selectionMarker.visible=false;this.measureMarkers.forEach(m=>m.visible=false);this.measureLine.visible=false;
    this.homeCenterMarker.userData.world.copy(this.milkyWay.center);this.homeCenterMarker.visible=false;
    this.annotations.add(this.originMarker,this.homeCenterMarker,this.selectionMarker,...this.measureMarkers,this.measureLine);
    this.measureLine.frustumCulled=false;
    const signal=this.lifecycle.signal;
    addEventListener('resize',()=>this.resize(),{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.setAutoFly(false);cancelAnimationFrame(this.frame);this.frame=0;this.keys.clear();this.lastTime=0}else this.invalidate()},{signal});
    this.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.contextLost=true;this.onError('The graphics connection was interrupted. Waiting for it to recover…')},{signal});
    this.canvas.addEventListener('webglcontextrestored',()=>{this.contextLost=false;this.onReady();this.onMessage('Graphics restored');this.dirty=true;this.invalidate()},{signal});
    document.addEventListener('pointerlockchange',()=>{
      const enabled=document.pointerLockElement===this.canvas;
      this.flight=enabled;if(enabled)this.setAutoFly(false);this.controls.enabled=!enabled&&!this.autoFly;
      if(!enabled){this.keys.clear();this.controls.target.copy(this.camera.position).addScaledVector(this.camera.getWorldDirection(this.scratch),this.focusDistance);this.controls.update()}
      this.onFlight(enabled);this.invalidate();
    },{signal});
    document.addEventListener('pointerlockerror',()=>this.onMessage('Flight could not capture the pointer. Click Start flying to try again.'),{signal});
    document.addEventListener('mousemove',event=>this.look(event),{signal});
    window.addEventListener('keydown',event=>{
      if(event.code==='Escape'&&this.autoFly)this.setAutoFly(false);
      if((event.target as HTMLElement)?.matches('input,select,textarea')||document.querySelector('dialog[open]'))return;
      if(this.flight&&['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight'].includes(event.code)){event.preventDefault();this.keys.add(event.code);this.invalidate()}
      if(event.code==='KeyR'&&!event.metaKey&&!event.ctrlKey)this.reset();
      if(event.code==='KeyF'&&!event.metaKey&&!event.ctrlKey)this.focusSelected();
    },{signal});
    window.addEventListener('keyup',event=>this.keys.delete(event.code),{signal});
    addEventListener('blur',()=>this.keys.clear(),{signal});
    this.canvas.addEventListener('wheel',event=>{if(this.flight){event.preventDefault();this.speed=THREE.MathUtils.clamp(this.speed*Math.exp(-event.deltaY*.002),.000001,10000);this.invalidate()}},{passive:false,signal});
    let down=[0,0];
    this.canvas.addEventListener('pointerdown',event=>{down=[event.clientX,event.clientY]},{signal});
    this.canvas.addEventListener('pointerup',event=>{if(event.button===0&&!this.flight&&Math.hypot(event.clientX-down[0],event.clientY-down[1])<5)void this.pick(event.clientX,event.clientY)},{signal});
    this.resize();
  }
  private createNearbyPoints(){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(this.nearbyGalaxies.flatMap(model=>model.center.toArray())),3));
    geometry.setAttribute('detailSlot',new THREE.BufferAttribute(new Float32Array(this.nearbyGalaxies.map((_,i)=>i+1)),1));
    const material=this.material(pointFragment,1.6,true,true),mix={value:new Float32Array(MODEL_LIMIT)},origins={value:Array.from({length:MODEL_LIMIT},()=>new THREE.Vector3())};
    for(const m of [material,this.nearbyPicker]){m.uniforms.uDetailMix=mix;m.uniforms.uDetailOrigins=origins}
    const points=new THREE.Points(geometry,material);points.frustumCulled=false;
    points.onBeforeRender=(_renderer,_scene,camera,_geometry,usedMaterial)=>{
      const m=usedMaterial as THREE.RawShaderMaterial;
      m.uniforms.uOrigin.value.copy(camera.position).negate();m.uniforms.uNode.value=65535;m.uniforms.uLocalChunk.value=false;
      m.uniforms.uSize.value=(usedMaterial===this.nearbyPicker?7:1.6)*this.pixelRatio;
      this.nearbyGalaxies.forEach((model,i)=>{mix.value[i]=model.blend.value;origins.value[i].copy(model.center).sub(camera.position)});m.uniformsNeedUpdate=true;
    };
    return points;
  }
  private material(fragment:string,size:number,transparent:boolean,depthCues=false){
    const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:vertex,fragmentShader:fragment,
      uniforms:{uOrigin:{value:new THREE.Vector3()},uSize:{value:size},uNode:{value:0},uColor:{value:new THREE.Color(0x9fe5f1)},uDepthCues:depthCues?this.depthCueUniform:{value:false},uEnlargePoints:depthCues?this.enlargePointsUniform:{value:false},uFadeRange:this.fadeRangeUniform,
        uLocalChunk:{value:false},uWorldOrigin:{value:new THREE.Vector3()},uHideUncertainLocal:this.hideUncertainLocalUniform,
        uDetailOrigins:this.detailOriginsUniform,uDetailMix:this.detailBlendUniform,uMinOpacity:this.minOpacityUniform},
      transparent,depthTest:true,depthWrite:!transparent,toneMapped:false});
    (material.defaultAttributeValues as Record<string,number[]>).detailSlot=[0];return material;
  }
  private marker(color:number,size:number){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(3),3));
    const material=this.material(markerFragment,size,true);material.depthTest=false;material.uniforms.uColor.value.setHex(color);
    const marker=new THREE.Points(geometry,material);marker.frustumCulled=false;marker.userData.world=new THREE.Vector3();marker.userData.size=size;
    return marker;
  }
  async load(manifestUrl:string){
    const response=await fetch(manifestUrl,{signal:this.lifecycle.signal});if(!response.ok)throw new Error(`The galaxy catalog could not be opened (${response.status}).`);
    const manifest:Manifest=await response.json();
    if(manifest.version!==1||!Number.isSafeInteger(manifest.count)||manifest.count<1||manifest.count>0xffff_fffe||!Array.isArray(manifest.nodes)||manifest.nodes.length>65534)throw new Error('Unsupported catalog manifest');
    this.manifest=manifest;this.root=manifest.root;this.base=new URL('.',new URL(manifestUrl,location.href)).href;
    this.references=new Uint8Array(manifest.count);
    for(const node of manifest.nodes){
      if(!Number.isInteger(node.storedCount)||node.storedCount<1||node.storedCount>65536)throw new Error('Invalid spatial chunk');
      this.nodes.set(node.id,node);
      const box=new THREE.Box3(new THREE.Vector3().fromArray(node.min),new THREE.Vector3().fromArray(node.max));
      this.bounds.set(node.id,box);this.spheres.set(node.id,box.getBoundingSphere(new THREE.Sphere()));
      for(const child of node.children)this.parents.set(child,node.id);
    }
    const root=this.nodes.get(this.root);if(!root)throw new Error('Catalog root is missing');
    const box=this.bounds.get(this.root)!;
    box.getCenter(this.overviewTarget);this.overviewRadius=box.getSize(new THREE.Vector3()).length()/2;
    this.overviewPosition.copy(this.overviewTarget).add(new THREE.Vector3(.85,-1,.58).normalize().multiplyScalar(this.overviewRadius*2.1));
    this.controls.maxDistance=this.overviewRadius*10;this.camera.far=this.overviewRadius*30;
    this.camera.updateProjectionMatrix();this.reset();this.invalidate();
    if(manifest.id==='dr1'&&!manifest.subset){
      try{
        const results=await Promise.allSettled(['galaxy-detail.json','galaxy-spiral.json'].map(async path=>{
        const response=await fetch(this.catalogAsset(path),{signal:this.lifecycle.signal});
        if(!response.ok)throw new Error('Profile unavailable');
        const data:GalaxyDetailData=await response.json();
        if(data.version!==1||data.catalogId!==manifest.id||data.catalogSourceSha256!==manifest.source.sha256||
          !Number.isInteger(data.galaxy.id)||data.galaxy.id<0||data.galaxy.id>=manifest.count||
          !Number.isFinite(data.shape.radiusArcsec)||data.shape.radiusArcsec<=0||
          !Number.isFinite(data.shape.e1+data.shape.e2+data.galaxy.distance)||data.galaxy.distance<=0||
          !data.gaussians.length||data.gaussians.length>20||data.gaussians.some(g=>!Number.isFinite(g.sigmaRe+g.peak)||g.sigmaRe<=0||g.peak<0))throw new Error('Invalid galaxy profile');
        return new ResolvedGalaxy(data,this.galaxyAppearance);
        }));
        this.resolvedGalaxies=results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
        this.pinnedModels=new Set(this.resolvedGalaxies.map(model=>model.data.galaxy.id));
        if(results.some(result=>result.status==='rejected'))this.onMessage('Some galaxy previews could not load. You can still browse the point atlas.');
        this.bindModels();
        this.invalidate();
      }catch(error){if(!this.lifecycle.signal.aborted)this.onMessage('The close-up galaxy preview could not load. The point atlas is still available.')}
      try{this.modelCatalog=await ModelCatalog.open(manifest,this.catalogAsset('models/manifest.json'),this.lifecycle.signal,()=>{this.modelScanNeeded=true;this.invalidate()});this.modelScanNeeded=true;this.invalidate()}
      catch(error){if(!this.lifecycle.signal.aborted)this.onMessage('Galaxy models could not load. The point atlas is still available.');}
    }
  }
  private resize(){
    // Keep the canvas crisp without multiplying a Retina screen's fill cost by four.
    this.pixelRatio=Math.min(devicePixelRatio,1.5);
    const width=this.canvas.parentElement?.clientWidth??innerWidth,height=this.canvas.parentElement?.clientHeight??innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);this.renderer.setSize(width,height);
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
    this.pickTarget.setSize(this.canvas.width,this.canvas.height);
    for(const item of this.cache.values())item.points.material.uniforms.uSize.value=1.6*this.pixelRatio;
    this.dirty=true;this.invalidate();
  }
  setResolution(width:number,height:number){
    // Deterministic benchmark drawing size; CSS layout remains the normal viewport.
    this.pixelRatio=width/(this.canvas.parentElement?.clientWidth??innerWidth);
    this.renderer.setPixelRatio(1);this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.pickTarget.setSize(width,height);this.dirty=true;this.invalidate();
    for(const item of this.cache.values())item.points.material.uniforms.uSize.value=1.6*this.pixelRatio;
  }
  reset(){
    this.selectionSerial++;this.focusedGalaxyId=null;this.homeFocused=false;
    this.exitFlight();this.controls.enabled=true;
    const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();
    this.camera.position.copy(this.overviewPosition);this.controls.target.copy(this.overviewTarget);
    this.camera.up.set(0,0,1);this.controls.update();this.controls.enableDamping=damping;this.focusDistance=this.camera.position.distanceTo(this.controls.target);
    this.dirty=true;this.invalidate();
  }
  setMode(mode:'adaptive'|'full'){this.mode=mode;this.blocked=false;this.dirty=true;this.invalidate()}
  setDepthCues(enabled:boolean){this.depthCueUniform.value=enabled;this.dirty=true;this.invalidate()}
  setEnlargePoints(enabled:boolean){this.enlargePointsUniform.value=enabled;this.invalidate()}
  setShowUncertainLocal(show:boolean){
    this.hideUncertainLocalUniform.value=!show;this.selectionSerial++;this.modelScanNeeded=true;
    this.allModels.forEach(model=>this.updateModel(model));this.updateAnnotations();this.onSelection(this.selected);this.onMeasure(this.measurement,this.measuring);this.invalidate();
  }
  private catalogPositionVisible(galaxy:Galaxy){return this.showUncertainLocal||!uncertainLocalPosition(galaxy)}
  setMinimumOpacity(value:number){if(!Number.isFinite(value))return;this.minOpacityUniform.value=THREE.MathUtils.clamp(value,0,1);this.dirty=true;this.invalidate()}
  setGalaxyAppearance(appearance:GalaxyAppearance){
    if(appearance===this.galaxyAppearance)return;
    this.galaxyAppearance=appearance;
    const replace=(old:ResolvedGalaxy)=>{const model=new ResolvedGalaxy(old.data,appearance);old.dispose();this.updateModel(model);return model};
    this.resolvedGalaxies=this.resolvedGalaxies.map(replace);
    const nearby=this.nearbyGalaxies.map(replace);this.nearbyGalaxies.splice(0,this.nearbyGalaxies.length,...nearby);
    this.bindModels();this.onSelection(this.selected);this.invalidate();
  }
  setModelDisplay(display:ModelDisplay){this.modelDisplay=display;this.modelScanNeeded=true;this.dirty=true;this.invalidate()}
  private updateModel(model:ResolvedGalaxy){model.update(this.camera,this.canvas.clientHeight||innerHeight,this.pixelRatio,model.data.galaxy.id===this.focusedGalaxyId,uncertainLocalPosition(model.data.galaxy)?'points':this.modelDisplay,this.modelPresence.get(model.data.galaxy.id)?.value??1)}
  private updateDepthCues(){
    // Expand the fade horizon smoothly outside the survey; use a neighborhood
    // range inside it. This works in both orbit and flight without mode changes.
    const outside=this.camera.position.distanceTo(this.overviewTarget)-this.overviewRadius;
    let far=Math.max(1500,this.overviewRadius*.4+Math.max(0,outside)*3);
    // A display-mode switch must not brighten the distant background around an
    // intentionally focused galaxy. Base this cue on its angular scale even
    // when the user chooses its point representation.
    const focused=this.homeFocused?this.milkyWay:this.focusedGalaxyId===null?null:this.resolvedFor(this.focusedGalaxyId);
    if(focused){
      const distance=this.camera.position.distanceTo(focused.center),scale=(this.canvas.clientHeight||innerHeight)/(2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)));
      far=THREE.MathUtils.lerp(far,Math.max(1,distance*30),detailBlend(focused.radius*scale/Math.max(distance,1e-10)));
    }
    // Resolve a galaxy against its local neighborhood rather than a wall of
    // distant screen markers. The same reversible distance-cue setting applies.
    for(const model of [...this.allModels,this.milkyWay]){const localHorizon=Math.max(1,this.camera.position.distanceTo(model.center)*30);far=Math.min(far,THREE.MathUtils.lerp(far,localHorizon,model.blend.value))}
    this.fadeRangeUniform.value.set(far*.08,far);
  }
  enterFlight(){if(!this.ready)return;this.setAutoFly(false);this.focusDistance=this.camera.position.distanceTo(this.controls.target);void this.canvas.requestPointerLock()?.catch(()=>this.onMessage('Click Start flying again to enter flight.'))}
  exitFlight(){this.setAutoFly(false);if(document.pointerLockElement===this.canvas)document.exitPointerLock()}
  setAutoFly(enabled:boolean){
    if(enabled&&!this.ready||this.autoFly===enabled)return;
    if(enabled){
      this.exitFlight();
      // Finish any residual pan/zoom damping before starting a straight pass.
      const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();this.controls.enableDamping=damping;
    }
    this.autoFly=enabled;this.controls.enabled=!this.flight&&!enabled;
    this.lastTime=0;this.onAutoFly(enabled);this.invalidate();
  }
  private look(event:MouseEvent){
    if(!this.flight)return;
    const yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-event.movementX*.002);
    this.camera.quaternion.premultiply(yaw);
    const previous=this.camera.quaternion.clone();
    this.camera.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-event.movementY*.002));
    if(Math.abs(this.camera.getWorldDirection(this.scratch).z)>.995)this.camera.quaternion.copy(previous);
    this.dirty=true;this.invalidate();
  }
  private move(dt:number){
    if(this.autoFly){
      const forward=this.camera.getWorldDirection(this.scratch),distance=this.speed*dt;
      // Translate both camera and orbit target so stopping preserves the view.
      this.camera.position.addScaledVector(forward,distance);this.controls.target.addScaledVector(forward,distance);
      this.dirty=true;return true;
    }
    if(!this.flight||!this.keys.size)return false;
    const forward=this.camera.getWorldDirection(new THREE.Vector3()),right=new THREE.Vector3(1,0,0).applyQuaternion(this.camera.quaternion),movement=new THREE.Vector3();
    if(this.keys.has('KeyW'))movement.add(forward);if(this.keys.has('KeyS'))movement.sub(forward);
    if(this.keys.has('KeyD'))movement.add(right);if(this.keys.has('KeyA'))movement.sub(right);
    if(this.keys.has('KeyE'))movement.z+=1;if(this.keys.has('KeyQ'))movement.z-=1;
    const boost=this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')?5:1;
    this.camera.position.addScaledVector(movement.normalize(),this.speed*dt*boost);
    this.controls.target.copy(this.camera.position).addScaledVector(forward,this.focusDistance);
    this.dirty=true;return movement.lengthSq()>0;
  }
  setMeasuring(enabled:boolean){this.measuring=enabled;this.measurement=[];this.updateAnnotations();this.onMeasure(this.measurement,enabled);this.invalidate()}
  clearSelection(){this.clearHomeSelection();this.selectionSerial++;this.selected=null;this.selectionMarker.visible=false;this.onSelection(null);this.invalidate()}
  private bindModels(only?:Resident){
    this.detailBlendUniform.value.fill(0);
    this.resolvedGalaxies.forEach((model,i)=>this.detailBlendUniform.value[i]=model.blend.value);
    for(const item of only?[only]:this.cache.values()){
      const slots=item.points.geometry.getAttribute('detailSlot') as THREE.BufferAttribute;
      const previous=item.modelRows;item.modelRows=[];slots.clearUpdateRanges();
      for(const row of previous){slots.setX(row,0);slots.addUpdateRange(row,1)}
      this.resolvedGalaxies.forEach((model,i)=>{
        const row=item.ids.indexOf(model.data.galaxy.id);if(row<0)return;
        slots.setX(row,i+1);slots.addUpdateRange(row,1);item.modelRows.push(row);
      });
      if(previous.length||item.modelRows.length)slots.needsUpdate=true;
    }
  }
  private removeModel(model:ResolvedGalaxy){
    const id=model.data.galaxy.id;model.dispose();this.modelLocations.delete(id);this.modelPresence.delete(id);
    this.resolvedGalaxies=this.resolvedGalaxies.filter(item=>item!==model);
  }
  private ensureModel(galaxy:Galaxy,node:SpatialNode,row:number,priority=false):Promise<ResolvedGalaxy>{
    if(uncertainLocalPosition(galaxy))return Promise.reject(new Error('Uncertain local distance: physical galaxy model withheld.'));
    const existing=this.resolvedFor(galaxy.id);if(existing){if(priority)this.modelPresence.set(galaxy.id,{value:1,target:1});return Promise.resolve(existing)}
    const pending=this.modelRequests.get(galaxy.id);if(pending)return pending;
    if(!this.modelCatalog)return Promise.reject(new Error('The model catalog is unavailable'));
    const catalog=this.modelCatalog;
    const promise=catalog.read(node).then(chunk=>{
      if(this.disposed||(!priority&&!this.wantedModels.has(galaxy.id)))throw new DOMException('Model no longer nearby','AbortError');
      const existing=this.resolvedFor(galaxy.id);if(existing)return existing;
      if(this.resolvedGalaxies.length>=MODEL_LIMIT){
        const removable=this.resolvedGalaxies.filter(model=>!this.pinnedModels.has(model.data.galaxy.id)&&model.data.galaxy.id!==this.selected?.id&&model.data.galaxy.id!==this.focusedGalaxyId&&(priority||model.blend.value===0))
          .sort((a,b)=>b.center.distanceToSquared(this.camera.position)/b.radius**2-a.center.distanceToSquared(this.camera.position)/a.radius**2)[0];
        if(!removable)throw new DOMException('Waiting for a model to fade out','AbortError');
        this.removeModel(removable);
      }
      const model=new ResolvedGalaxy(decodeModel(catalog.manifest,chunk,row,galaxy),this.galaxyAppearance);
      this.modelPresence.set(galaxy.id,{value:priority?1:0,target:1});this.updateModel(model);
      this.resolvedGalaxies.push(model);this.modelLocations.set(galaxy.id,{node:node.id,row});this.bindModels();
      if(this.selected?.id===galaxy.id)this.onSelection(this.selected);
      this.invalidate();return model;
    }).finally(()=>this.modelRequests.delete(galaxy.id));
    this.modelRequests.set(galaxy.id,promise);return promise;
  }
  private updateModels(){
    const catalog=this.modelCatalog;if(!catalog||this.modelDisplay!=='automatic')return;
    const scale=(this.canvas.clientHeight||innerHeight)/(2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)));
    const camera=this.camera.position,forward=this.camera.getWorldDirection(this.scratch);
    const candidates:{id:number;node:SpatialNode;row:number;score:number}[]=[];
    const protectedIds=new Set(this.pinnedModels);if(this.selected&&this.selected.id>=0)protectedIds.add(this.selected.id);if(this.focusedGalaxyId!==null&&this.focusedGalaxyId>=0)protectedIds.add(this.focusedGalaxyId);
    const available=Math.max(0,MODEL_LIMIT-protectedIds.size);
    const consider=(id:number,node:SpatialNode,row:number,score:number)=>{
      if(!available||candidates.some(c=>c.id===id)||candidates.length>=available&&score<=candidates[candidates.length-1].score)return;
      const index=candidates.findIndex(other=>score>other.score);candidates.splice(index<0?candidates.length:index,0,{id,node,row,score});if(candidates.length>available)candidates.pop();
    };
    // Resident models keep their exact center/shape when the point frontier changes.
    // A 30% ranking margin prevents near-equal candidates repeatedly trading places.
    for(const model of this.resolvedGalaxies){
      const id=model.data.galaxy.id,location=this.modelLocations.get(id);if(protectedIds.has(id)||!location)continue;
      const relative=model.center.clone().sub(camera),score=model.radius**2*scale**2/Math.max(relative.lengthSq(),1e-20);
      if(score<.25**2||relative.dot(forward)<-8*model.radius)continue;
      consider(id,this.nodes.get(location.node)!,location.row,score*1.3);
    }
    let requests=0;
    for(const nodeId of this.drawn){
      const item=this.cache.get(nodeId)!,asset=catalog.manifest.nodes[nodeId];if(!asset)continue;
      if(this.bounds.get(nodeId)!.distanceToPoint(camera)>asset.maxRadiusMpc*scale/.35)continue;
      const chunk=catalog.get(nodeId);
      if(!chunk){
        if(!catalog.failed.has(nodeId)&&catalog.pendingCount<4&&requests++<4)void catalog.read(item.node).catch(()=>this.onMessage('Some galaxy shapes could not load. Retry missing detail to try again.'));
        continue;
      }
      const positions=item.points.geometry.getAttribute('position').array as Float32Array;
      const cx=item.node.center[0],cy=item.node.center[1],cz=item.node.center[2];
      for(let row=0;row<item.ids.length;row++){
        const id=item.ids[row];if(protectedIds.has(id))continue;
        const x=positions[row*3]+cx,y=positions[row*3+1]+cy,z=positions[row*3+2]+cz;
        if(x*x+y*y+z*z<LOCAL_REDSHIFT_GUARD_MPC**2)continue;
        const dx=x-camera.x,dy=y-camera.y,dz=z-camera.z,distanceSq=dx*dx+dy*dy+dz*dz;
        const radius=measuredShape(chunk,row)?chunk.values[row*5]*Math.sqrt(x*x+y*y+z*z)*Math.PI/(180*3600):catalog.manifest.fallbackRadiusMpc;
        if(dx*forward.x+dy*forward.y+dz*forward.z < -8*radius)continue;
        const score=radius*radius*scale*scale/Math.max(distanceSq,1e-20);
        if(score>=.35*.35)consider(id,item.node,row,score);
      }
    }
    this.wantedModels=new Set(candidates.map(item=>item.id));
    let changed=false;
    for(const model of [...this.resolvedGalaxies]){
      const id=model.data.galaxy.id;
      const wanted=protectedIds.has(id)||this.wantedModels.has(id),presence=this.modelPresence.get(id);
      if(presence)presence.target=Number(wanted);
      if(!wanted&&!this.modelRequests.has(id)&&(!presence||presence.value===0||model.blend.value===0)){this.removeModel(model);changed=true}
    }
    if(changed)this.bindModels();
    for(const candidate of candidates){
      if(this.resolvedFor(candidate.id)||this.modelRequests.has(candidate.id)||this.modelRequests.size>=4||this.resolvedGalaxies.length+this.modelRequests.size>=MODEL_LIMIT)continue;
      const {node,row,id}=candidate;
      // Metadata supplies the exact float64 center and target identity only for
      // the small nearby set. The candidate scan uses existing packed positions.
      const pending=(async()=>{
        let metadata=this.metadata.get(node.id);
        if(!metadata){metadata=await this.loader.load(`m:${node.id}`,new URL(node.metadata.url,this.base).href,node.metadata,'metadata',node.storedCount,true);this.metadata.set(node.id,metadata)}
        this.modelRequests.delete(id);
        if(this.disposed||!this.wantedModels.has(id))throw new DOMException('Model no longer nearby','AbortError');
        return this.ensureModel(decodeGalaxy(metadata,row,id),node,row);
      })();
      this.modelRequests.set(id,pending);
      void pending.catch(error=>{if(error.name!=='AbortError')this.onMessage('A close-up model could not load; its catalog point is still available.')}).finally(()=>{if(this.modelRequests.get(id)===pending)this.modelRequests.delete(id);this.invalidate()});
    }
  }
  focusSelected(){
    if(this.homeSelected){this.visitMilkyWay();return}
    if(!this.selected)return;
    if(!this.catalogPositionVisible(this.selected)){this.onMessage('This uncertain local position is hidden. Show uncertain local positions in Settings to inspect it.');return}
    this.focusAt(new THREE.Vector3().fromArray(this.selected.position),this.resolvedFor(this.selected.id)?this.resolvedFor(this.selected.id)!.radius*12:25,undefined,this.selected.id);
  }
  visitGalaxy(id=this.resolved?.data.galaxy.id){
    const model=id===undefined?null:this.resolvedFor(id);
    if(!this.ready||!model)return;
    this.selectionSerial++;this.selectGalaxy(model.data.galaxy);
    this.focusAt(model.center,model.radius*12,model.frame.radial.clone().negate(),id);
    this.onMessage(`${model.data.name} · observer-facing view. Drag to explore its inferred 3D shape.`);
  }
  visitNearby(id:number){
    if(!this.nearbyGalaxies.some(model=>model.data.galaxy.id===id))throw new Error('Unknown nearby galaxy');
    this.visitGalaxy(id);
  }
  async visitCatalog(entry:{id:number;node:string;row:number;targetId:string},canNavigate:()=>boolean=()=>true){
    if(!canNavigate())return;
    const node=this.nodes.get(entry.node),serial=++this.selectionSerial;
    if(!node||!Number.isInteger(entry.row)||entry.row<0||entry.row>=node.storedCount)throw new Error('This named observation is unavailable.');
    const metadata=await this.loader.load(`m:${node.id}`,new URL(node.metadata.url,this.base).href,node.metadata,'metadata',node.storedCount,true);
    if(!canNavigate()||serial!==this.selectionSerial)return;
    const galaxy=decodeGalaxy(metadata,entry.row,entry.id);
    if(galaxy.targetId!==entry.targetId)throw new Error('The name index does not match this catalog.');
    if(!this.catalogPositionVisible(galaxy))throw new Error('This name has an uncertain local position. Enable Show uncertain local positions in Settings to inspect the record.');
    if(this.modelCatalog&&!uncertainLocalPosition(galaxy))try{await this.ensureModel(galaxy,node,entry.row,true)}catch{if(canNavigate()&&serial===this.selectionSerial)this.onMessage('The shape could not load; showing the catalog position. Retry missing detail to try again.')}
    if(!canNavigate()||serial!==this.selectionSerial)return;
    if(this.resolvedFor(galaxy.id)){this.visitGalaxy(galaxy.id);return}
    this.selectGalaxy(galaxy);this.focusSelected();
  }
  focusObserver(){
    if(!this.ready)return;
    this.focusAt(new THREE.Vector3(0,0,0),.06,this.milkyWay.approachDirection,null,true);
    this.inspectHome();this.onMessage('Sun / Observer · zoom and orbit around our position in the disk.');
  }
  visitMilkyWay(){
    if(!this.ready)return;
    this.focusAt(this.milkyWay.center,.06,this.milkyWay.approachDirection,null,true);this.inspectHome();
    this.onMessage(this.modelDisplay==='points'?'Milky Way · points-only display is on. Enable models in Settings to see its shape.':'Milky Way · zoom and orbit around the Galactic core.');
  }
  private inspectHome(){this.selectionSerial++;this.homeSelected=true;this.onHomeSelection(true);this.invalidate()}
  clearHomeSelection(){this.homeSelected=false;this.onHomeSelection(false)}
  private focusAt(target:THREE.Vector3,distance=25,direction=this.camera.getWorldDirection(new THREE.Vector3()).negate(),galaxyId:number|null=null,home=false){
    this.selectionSerial++;this.focusedGalaxyId=galaxyId;this.homeFocused=home;
    if(galaxyId!==null&&this.modelPresence.has(galaxyId))this.modelPresence.set(galaxyId,{value:1,target:1});
    this.exitFlight();this.controls.enabled=true;
    // Consume any remaining orbit/pan damping before setting the exact focus.
    const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();
    this.controls.target.copy(target);this.camera.position.copy(target).addScaledVector(direction,distance);
    this.controls.update();this.controls.enableDamping=damping;this.focusDistance=distance;
    this.dirty=true;this.invalidate();
  }
  private get memoryBytes(){
    let bytes=this.references.byteLength+this.pickTarget.width*this.pickTarget.height*8+this.milkyWay.memoryBytes+this.allModels.reduce((sum,model)=>sum+model.memoryBytes,0)+(this.modelCatalog?.memoryBytes??0);
    for(const item of this.cache.values())bytes+=item.bytes;
    for(const buffer of this.metadata.values())bytes+=buffer.byteLength;
    return bytes+this.loader.reservedBytes;
  }
  private get memoryLimit(){return (this.mode==='full'?1536:768)*1048576}
  private evict(requiredBytes=0){
    const removable=[...this.cache.values()].filter(item=>item.node.id!==this.root&&!this.required.has(item.node.id)&&!this.drawn.includes(item.node.id)).sort((a,b)=>a.used-b.used);
    for(const item of removable){
      if(this.memoryBytes+requiredBytes<this.memoryLimit*.9)break;
      this.scene.remove(item.points);item.points.geometry.dispose();item.points.material.dispose();this.cache.delete(item.node.id);
      for(const id of item.ids)if(--this.references[id]===0)this.loadedUnique--;
    }
    // Metadata is needed only during an inspection. Selected values have already been copied.
    while(this.metadata.size>4){this.metadata.delete(this.metadata.keys().next().value!)}
  }
  private request(node:SpatialNode){
    if(this.cache.has(node.id)||this.pending.has(node.id)||this.failed.has(node.id))return;
    const reservation=node.points.decodedBytes*3+node.points.bytes*2;
    this.evict(reservation);
    if(this.memoryBytes+reservation>this.memoryLimit){this.blocked=true;return}
    this.pending.add(node.id);
    void this.loader.load(`p:${node.id}`,new URL(node.points.url,this.base).href,node.points,'points',node.storedCount).then(buffer=>{
      if(this.disposed)throw new DOMException('Disposed','AbortError');
      const positions=new Float32Array(buffer,16,node.storedCount*3),ids=new Uint32Array(buffer,16+node.storedCount*12,node.storedCount);
      for(const id of ids)if(id>=this.manifest.count)throw new Error('Invalid catalog object reference');
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
      geometry.setAttribute('detailSlot',new THREE.BufferAttribute(new Float32Array(node.storedCount),1).setUsage(THREE.DynamicDrawUsage));
      const material=this.material(pointFragment,1.6*this.pixelRatio,true,true);
      const points=new THREE.Points(geometry,material);points.frustumCulled=false;points.visible=false;
      // Most chunks never intersect the local guard, so their shader skips its math.
      const localChunk=this.bounds.get(node.id)!.distanceToPoint(new THREE.Vector3())<LOCAL_REDSHIFT_GUARD_MPC;
      points.onBeforeRender=(_renderer,_scene,camera,_geometry,usedMaterial)=>{
        const m=usedMaterial as THREE.RawShaderMaterial;
        m.uniforms.uOrigin.value.set(node.center[0]-camera.position.x,node.center[1]-camera.position.y,node.center[2]-camera.position.z);
        m.uniforms.uNode.value=Number(node.id)+1;m.uniformsNeedUpdate=true;
        m.uniforms.uLocalChunk.value=localChunk;m.uniforms.uWorldOrigin.value.fromArray(node.center);
        this.resolvedGalaxies.forEach((model,i)=>m.uniforms.uDetailOrigins.value[i].copy(model.center).sub(camera.position));
      };
      const resident={node,buffer,ids,points,bytes:buffer.byteLength+positions.byteLength+node.storedCount*8,used:performance.now(),modelRows:[]};
      this.cache.set(node.id,resident);this.bindModels(resident);this.modelScanNeeded=true;
      for(const id of ids)if(this.references[id]++===0)this.loadedUnique++;
      this.scene.add(points);
      if(!this.ready){this.ready=true;this.onReady()}
    }).catch(error=>{if(error.name!=='AbortError'){this.failed.set(node.id,error.message);if(node.id===this.root&&!this.ready)this.onError('The first galaxy data could not load. Use Retry missing detail below.');this.onMessage(`Some detail could not load: ${error.message}`)}}).finally(()=>{this.pending.delete(node.id);this.dirty=true;this.invalidate()});
  }
  retry(){this.failed.clear();this.modelCatalog?.retry();this.blocked=false;this.dirty=true;this.modelScanNeeded=true;this.invalidate()}
  private updateLOD(){
    if(!this.manifest)return;
    this.camera.updateMatrixWorld();this.clipMatrix.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.clipMatrix,this.camera.coordinateSystem,this.camera.reversedDepth);
    const height=this.canvas.clientHeight||innerHeight;
    const wanted=chooseFrontier({root:this.root,nodes:this.nodes,mode:this.mode,budget:this.sampleBudget,
      visible:node=>{const box=this.bounds.get(node.id)!;return this.frustum.intersectsBox(box)&&(!this.depthCueUniform.value||this.minOpacityUniform.value>0||box.distanceToPoint(this.camera.position)<=this.fadeRangeUniform.value.y)},
      projectedSize:node=>{const sphere=this.spheres.get(node.id)!;const distance=Math.max(.0001,this.camera.position.distanceTo(sphere.center)-sphere.radius);return sphere.radius/distance*height/Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))}});
    this.desired=new Set(wanted);this.required=new Set(wanted);
    for(const id of wanted){let parent=this.parents.get(id);while(parent!==undefined){this.required.add(parent);parent=this.parents.get(parent)}}
    const retain=new Set([...this.required].map(id=>`p:${id}`));retain.add(`p:${this.root}`);this.loader.retain(retain);
    // Root first, followed by breadth-first coverage; never queue the entire catalog.
    const queue=[this.root];
    while(queue.length&&this.loader.pending<12){const id=queue.shift()!;const node=this.nodes.get(id)!;if(this.required.has(id)||id===this.root){this.request(node);queue.push(...node.children.filter(c=>this.required.has(c)))}}
    this.drawn=coveredFrontier(this.root,this.nodes,this.desired,this.required,id=>this.cache.has(id));
    for(const item of this.cache.values())item.points.visible=false;
    for(const id of this.drawn){const item=this.cache.get(id)!;item.points.visible=true;item.used=performance.now()}
    this.evict();
  }
  private updateAnnotations(){
    this.selectionMarker.visible=!!this.selected&&this.catalogPositionVisible(this.selected);
    if(this.selected)this.selectionMarker.userData.world.fromArray(this.selected.position);
    this.measureMarkers.forEach((marker,i)=>{marker.visible=!!this.measurement[i]&&this.catalogPositionVisible(this.measurement[i]);if(this.measurement[i])marker.userData.world.fromArray(this.measurement[i].position)});
    this.measureLine.visible=this.measurement.length===2&&this.measurement.every(galaxy=>this.catalogPositionVisible(galaxy));
    if(this.measurement.length===2){const [a,b]=this.measurement;this.measureLine.userData.world=new THREE.Vector3().fromArray(a.position);this.measureLine.geometry.dispose();this.measureLine.geometry=new THREE.BufferGeometry();this.measureLine.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array([0,0,0,b.position[0]-a.position[0],b.position[1]-a.position[1],b.position[2]-a.position[2]]),3))}
  }
  private positionAnnotations(){
    this.homeCenterMarker.visible=this.homeFocused&&this.milkyWay.blend.value>.1;
    for(const marker of [this.originMarker,this.homeCenterMarker,this.selectionMarker,...this.measureMarkers]){
      marker.material.uniforms.uOrigin.value.copy(marker.userData.world).sub(this.camera.position);
      marker.material.uniforms.uSize.value=marker.userData.size*this.pixelRatio;
    }
    if(this.measureLine.visible)this.measureLine.material.uniforms.uOrigin.value.copy(this.measureLine.userData.world).sub(this.camera.position);
    const origin=new THREE.Vector3().project(this.camera);
    const observerInFront=this.camera.getWorldDirection(this.scratch).dot(this.camera.position)<0;
    this.onOrigin((origin.x*.5+.5)*this.canvas.clientWidth,(.5-origin.y*.5)*this.canvas.clientHeight,observerInFront&&origin.z>-1&&origin.z<1&&Math.abs(origin.x)<.95&&Math.abs(origin.y)<.9);
    const center=this.milkyWay.center.clone().project(this.camera);
    const centerInFront=this.camera.getWorldDirection(this.scratch).dot(this.milkyWay.center.clone().sub(this.camera.position))>0;
    const separated=Math.hypot((center.x-origin.x)*this.canvas.clientWidth/2,(center.y-origin.y)*this.canvas.clientHeight/2)>90;
    this.onHomeCenter((center.x*.5+.5)*this.canvas.clientWidth,(.5-center.y*.5)*this.canvas.clientHeight,this.homeCenterMarker.visible&&centerInFront&&center.z>-1&&center.z<1&&Math.abs(center.x)<.95&&Math.abs(center.y)<.9&&separated);
  }
  private async pick(clientX:number,clientY:number){
    if(this.picking||!this.ready||this.contextLost)return;
    const bounds=this.canvas.getBoundingClientRect();
    const body=this.allModels.filter(model=>model.hitTest(new THREE.Vector2((clientX-bounds.left)/bounds.width*2-1,1-(clientY-bounds.top)/bounds.height*2),this.camera)).sort((a,b)=>a.center.distanceToSquared(this.camera.position)-b.center.distanceToSquared(this.camera.position))[0];
    const homeHit=!this.measuring&&this.milkyWay.hitTest(new THREE.Vector2((clientX-bounds.left)/bounds.width*2-1,1-(clientY-bounds.top)/bounds.height*2),this.camera);
    if(homeHit&&(!body||this.milkyWay.center.distanceToSquared(this.camera.position)<body.center.distanceToSquared(this.camera.position))){this.inspectHome();return}
    if(body){this.selectionSerial++;this.selectGalaxy(body.data.galaxy);return}
    this.picking=true;const serial=++this.selectionSerial;
    const rect=this.canvas.getBoundingClientRect(),width=this.pickTarget.width,height=this.pickTarget.height;
    const x=Math.floor((clientX-rect.left)*width/rect.width),y=Math.floor((rect.bottom-clientY)*height/rect.height);
    const left=Math.max(0,x-4),bottom=Math.max(0,y-4),w=Math.min(9,width-left),h=Math.min(9,height-bottom);
    try{
      this.updateDepthCues();
      this.pickMaterial.uniforms.uSize.value=7*this.pixelRatio;
      // Render-target scissor coordinates are physical pixels. Renderer.setScissor
      // multiplies by its DPR and would move the pick region on Retina displays.
      this.pickTarget.scissor.set(left,bottom,w,h);this.pickTarget.scissorTest=true;
      this.renderer.setRenderTarget(this.pickTarget);this.renderer.setClearColor(0,0);this.renderer.clear();
      this.scene.overrideMaterial=this.pickMaterial;this.renderer.render(this.scene,this.camera);this.scene.overrideMaterial=null;
      const autoClear=this.renderer.autoClear;this.renderer.autoClear=false;this.nearbyScene.overrideMaterial=this.nearbyPicker;
      this.renderer.render(this.nearbyScene,this.camera);this.nearbyScene.overrideMaterial=null;this.renderer.autoClear=autoClear;
      const readback=this.renderer.readRenderTargetPixelsAsync(this.pickTarget,left,bottom,w,h,new Uint8Array(w*h*4));
      this.renderer.setRenderTarget(null);this.renderer.setScissorTest(false);this.renderer.setClearColor(0x06090d,1);
      const pixels=await readback as Uint8Array;
      let code=0,best=Infinity;
      for(let i=0;i<w*h;i++){
        const value=(pixels[i*4]|pixels[i*4+1]<<8|pixels[i*4+2]<<16|pixels[i*4+3]<<24)>>>0;
        const distance=(left+i%w-x)**2+(bottom+Math.floor(i/w)-y)**2;
        if(value&&distance<best){code=value;best=distance}
      }
      if(!code){if(!this.measuring)this.clearSelection();return}
      if(serial!==this.selectionSerial)return;
      if((code>>>16)===65535){const model=this.nearbyGalaxies[code&65535];if(model)this.selectGalaxy(model.data.galaxy);return}
      const nodeId=String((code>>>16)-1),row=code&65535;
      const item=this.cache.get(nodeId);if(!item||row>=item.node.storedCount)return;
      const id=item.ids[row],node=item.node;
      let metadata=this.metadata.get(nodeId);
      if(!metadata){
        this.onMessage('Reading galaxy measurements…');
        metadata=await this.loader.load(`m:${nodeId}`,new URL(node.metadata.url,this.base).href,node.metadata,'metadata',node.storedCount,true);
        this.metadata.set(nodeId,metadata);
      }
      if(serial!==this.selectionSerial)return;
      const galaxy=decodeGalaxy(metadata,row,id);
      if(!this.catalogPositionVisible(galaxy))return;
      if(this.modelCatalog&&!uncertainLocalPosition(galaxy))try{await this.ensureModel(galaxy,node,row,true)}catch{this.onMessage('The shape could not load; the catalog measurements are still available.')}
      if(serial!==this.selectionSerial)return;
      this.selectGalaxy(galaxy);
    }catch(error){this.onMessage(`Could not inspect this point. ${error instanceof Error?error.message:'Try again.'}`)}
    finally{this.scene.overrideMaterial=null;this.renderer.setRenderTarget(null);this.renderer.setScissorTest(false);this.renderer.setClearColor(0x06090d,1);this.picking=false;this.invalidate()}
  }
  private selectGalaxy(galaxy:Galaxy){
    this.clearHomeSelection();
    this.selected=galaxy;this.onSelection(galaxy);
    if(this.measuring){if(this.measurement.length===2)this.measurement=[];if(!this.measurement.length||this.measurement[0].id!==galaxy.id)this.measurement.push(galaxy);this.onMeasure(this.measurement,true)}
    this.updateAnnotations();this.invalidate();
  }
  get stats():AtlasStats{
    const sorted=[...this.timings].sort((a,b)=>a-b),mean=this.timings.reduce((a,b)=>a+b,0)/(this.timings.length||1);
    return {drawn:this.drawn.reduce((n,id)=>n+this.nodes.get(id)!.storedCount,0),loaded:this.loadedUnique,represented:this.drawn.reduce((n,id)=>n+this.nodes.get(id)!.count,0),pending:this.loader.pending+(this.modelCatalog?.pendingCount??0),failed:this.failed.size+(this.modelCatalog?.failed.size??0),mode:this.mode,
      complete:this.ready&&this.drawn.length>0&&this.desired.size===this.drawn.length&&this.drawn.every(id=>this.desired.has(id))&&this.drawn.every(id=>!this.nodes.get(id)!.children.length),
      fps:mean?1000/mean:0,p95:sorted[Math.floor(sorted.length*.95)]??0,calls:this.renderer.info.render.calls,managedMiB:this.memoryBytes/1048576,blocked:this.blocked,
      focusDistance:this.camera.position.distanceTo(this.controls.target),budget:this.sampleBudget,models:this.allModels.filter(model=>model.visible).length+Number(this.milkyWay.visible)};
  }
  invalidate(){if(!this.frame&&!document.hidden&&!this.contextLost&&!this.disposed)this.frame=requestAnimationFrame(time=>this.tick(time))}
  private tick(time:number){
    this.frame=0;if(this.contextLost)return;
    const elapsed=this.lastTime?time-this.lastTime:16.67;this.lastTime=time;
    const moved=this.move(Math.min(elapsed/1000,.05));
    const orbitMoved=!this.flight&&!this.autoFly&&this.controls.update();
    const automaticOrbit=!this.flight&&!this.autoFly&&this.controls.autoRotate;
    const near=Math.min(.0001,Math.max(1e-8,this.camera.position.distanceTo(this.controls.target)*.01));
    if(this.camera.near!==near){this.camera.near=near;this.camera.updateProjectionMatrix()}
    if((moved||orbitMoved||automaticOrbit)&&this.wasContinuous){this.timings.push(elapsed);if(this.timings.length>240)this.timings.shift()}
    for(const presence of this.modelPresence.values()){
      const delta=Math.min(elapsed/1000,.05)/.6;
      presence.value=presence.target>presence.value?Math.min(presence.target,presence.value+delta):Math.max(presence.target,presence.value-delta);
      if(presence.value===0&&presence.target===0)this.modelScanNeeded=true;
    }
    this.resolvedGalaxies.forEach((model,i)=>{this.updateModel(model);this.detailBlendUniform.value[i]=model.blend.value});
    this.nearbyGalaxies.forEach(model=>this.updateModel(model));
    this.milkyWay.update(this.camera,this.canvas.clientHeight||innerHeight,this.pixelRatio,this.homeFocused,this.modelDisplay);
    this.updateDepthCues();
    if(this.dirty||time-this.lastLOD>200){this.updateLOD();this.lastLOD=time;this.dirty=false}
    if(this.modelScanNeeded||time-this.lastModelScan>250){this.updateModels();this.lastModelScan=time;this.modelScanNeeded=false}
    this.positionAnnotations();this.renderer.info.reset();this.renderer.autoClear=true;this.renderer.render(this.scene,this.camera);this.renderer.autoClear=false;
    this.renderer.render(this.nearbyScene,this.camera);
    for(const model of this.allModels)if(model.visible)this.renderer.render(model.scene,this.camera);
    if(this.milkyWay.visible)this.renderer.render(this.milkyWay.scene,this.camera);
    this.renderer.render(this.annotations,this.camera);this.renderer.autoClear=true;
    if(time-this.lastStats>250||!(moved||orbitMoved)){this.onStats(this.stats);this.lastStats=time}
    if(this.mode==='adaptive'&&(moved||orbitMoved)&&!this.loader.pending&&++this.adaptationFrames>120){
      const p95=this.stats.p95;
      if(p95>22)this.sampleBudget=Math.max(250000,Math.floor(this.sampleBudget*.8));
      else if(p95>0&&p95<17)this.sampleBudget=Math.min(2000000,Math.floor(this.sampleBudget*1.1));
      this.adaptationFrames=0;this.dirty=true;
    }
    this.wasContinuous=!!(moved||orbitMoved||automaticOrbit||this.dirty||[...this.modelPresence.values()].some(presence=>presence.value!==presence.target));
    if(this.wasContinuous)this.invalidate();
  }
  get measurementDistance(){return this.measurement.length===2?separation(this.measurement[0].position,this.measurement[1].position):null}
  async probeGalaxyAppearance(){
    const input=document.getElementById('galaxy-appearance') as HTMLSelectElement,saved=input.value as GalaxyAppearance,stored=localStorage.getItem('atlas-galaxy-appearance');
    const change=(value:GalaxyAppearance)=>{input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}))};
    const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    this.visitNearby(-1);const selected=this.selected,count=this.manifest.count;
    const source=JSON.stringify(this.nearbyGalaxies.map(model=>model.data)),center=this.resolvedFor(-1)!.center.clone();
    try{
      change('catalog');await frame();
      const catalog=this.allModels.every(model=>model.appearance==='catalog'),catalogHidden=document.getElementById('profile-appearance')!.hidden;
      change('spiral');await frame();
      const spiral=this.allModels.every(model=>model.appearance==='spiral'),disclosed=!document.getElementById('profile-appearance')!.hidden,savedSpiral=localStorage.getItem('atlas-galaxy-appearance')==='spiral';
      const body=await this.probeResolvedPicking(-1),nearbyBytes=this.nearbyGalaxies.reduce((bytes,m)=>bytes+m.memoryBytes,0);
      const unchanged=this.selected===selected&&this.manifest.count===count&&JSON.stringify(this.nearbyGalaxies.map(model=>model.data))===source&&this.resolvedFor(-1)!.center.equals(center);
      return {catalog,catalogHidden,spiral,disclosed,savedSpiral,unchanged,body,nearbyBytes,passed:catalog&&catalogHidden&&spiral&&disclosed&&savedSpiral&&unchanged&&body.passed&&nearbyBytes<4*1048576};
    }finally{change(saved);if(stored===null)localStorage.removeItem('atlas-galaxy-appearance');else localStorage.setItem('atlas-galaxy-appearance',stored)}
  }
  /** Replay two Andromeda orbits through the real streaming/render path. */
  async probeModelContinuity(){
    if(!this.modelCatalog)return {available:false};
    const display=this.modelDisplay;this.setModelDisplay('automatic');this.visitNearby(-1);
    const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
    const model=this.resolvedFor(-1)!,offset=this.camera.position.clone().sub(model.center),axis=model.frame.normal;
    const snapshot=()=>new Map(this.resolvedGalaxies.map(m=>{const p=m.center.clone().project(this.camera);return [m.data.galaxy.id,{blend:m.blend.value,onScreen:p.z>-1&&p.z<1&&Math.abs(p.x)<.85&&Math.abs(p.y)<.85,name:m.data.name}]}));
    const events:{step:number;id:number;kind:string;before:number;after:number;name:string}[]=[];
    const removed:{id:number;blend:number;sourceDrawn:boolean;sourceProfileLoaded:boolean;wanted:boolean}[]=[];
    const remove=this.removeModel;
    this.removeModel=(m)=>{const source=this.modelLocations.get(m.data.galaxy.id)?.node;removed.push({id:m.data.galaxy.id,blend:m.blend.value,sourceDrawn:!!source&&this.drawn.includes(source),sourceProfileLoaded:!!source&&!!this.modelCatalog?.get(source),wanted:this.wantedModels.has(m.data.galaxy.id)});remove.call(this,m)};
    let previous=snapshot(),maxResident=0,peakJump=0;
    try{
      await sleep(1500);previous=snapshot();
      for(let step=0;step<360;step++){
        this.camera.position.copy(offset).applyAxisAngle(axis,step*Math.PI/90).add(model.center);this.camera.lookAt(model.center);this.controls.target.copy(model.center);this.dirty=true;this.invalidate();await sleep(40);
        const current=snapshot();maxResident=Math.max(maxResident,current.size);
        for(const id of new Set([...previous.keys(),...current.keys()])){
          const a=previous.get(id),b=current.get(id),before=a?.blend??0,after=b?.blend??0;
          if(!(a?.onScreen&&b?.onScreen||a?.onScreen&&!b||!a&&b?.onScreen))continue;
          const jump=Math.abs(after-before);peakJump=Math.max(peakJump,jump);
          if(jump>.35)events.push({step,id,kind:!a?'arrival':!b?'eviction':'visibility',before,after,name:(b??a)!.name});
        }
        previous=current;
      }
      await sleep(1200);
      const idleTransitionsComplete=[...this.modelPresence.values()].every(presence=>presence.value===presence.target);
      return {available:true,events,removed,peakJump,maxResident,idleTransitionsComplete,stats:this.stats,passed:events.length===0&&maxResident<=MODEL_LIMIT&&idleTransitionsComplete};
    }finally{this.removeModel=remove;this.setModelDisplay(display);this.visitNearby(-1)}
  }
  async probeNearbyGalaxies(){
    const display=this.modelDisplay,raw=this.showUncertainLocal,count=this.manifest.count;
    const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    const cases=[];
    try{
      this.setShowUncertainLocal(false);this.setModelDisplay('automatic');
      for(const model of this.nearbyGalaxies){
        const id=model.data.galaxy.id;this.visitNearby(id);await frame();
        const arrived={visible:model.visible,centerErrorMpc:this.controls.target.distanceTo(model.center),sourceShown:!document.getElementById('nearby-provenance')!.hidden,redshiftHidden:document.getElementById('redshift-row')!.hidden};
        const body=await this.probeResolvedPicking(id),profile=this.probeGalaxyProfile(id);
        this.setModelDisplay('points');await frame();
        const rect=this.canvas.getBoundingClientRect(),p=model.center.clone().project(this.camera);
        this.clearSelection();await this.pick(rect.left+(p.x*.5+.5)*rect.width,rect.top+(.5-p.y*.5)*rect.height);
        const pointPicked=this.selected?.targetId===model.data.galaxy.targetId;
        this.setModelDisplay('automatic');await frame();
        cases.push({name:model.data.name,id,arrived,body,profile,pointPicked,passed:arrived.visible&&arrived.centerErrorMpc<1e-12&&arrived.sourceShown&&arrived.redshiftHidden&&body.passed&&profile.passed&&pointPicked});
      }
      this.setMeasuring(true);this.visitNearby(-1);this.visitNearby(-2);
      const measured=this.measurementDistance,expected=this.nearbyGalaxies[0].center.distanceTo(this.nearbyGalaxies[1].center);
      this.setShowUncertainLocal(true);this.setShowUncertainLocal(false);
      const measurement={distanceMpc:measured,expectedMpc:expected,preserved:this.measurementDistance===measured,markersVisible:this.measureMarkers.every(marker=>marker.visible)&&this.measureLine.visible,localCaption:document.getElementById('measurement-hint')!.textContent!.includes('local separation')};
      return {cases,measurement,countUnchanged:this.manifest.count===count,modelCount:this.nearbyGalaxies.length,geometryBytes:this.nearbyGalaxies.reduce((n,m)=>n+m.memoryBytes,0),passed:cases.every(c=>c.passed)&&measured!==null&&Math.abs(measured-expected)<1e-12&&measurement.preserved&&measurement.markersVisible&&measurement.localCaption&&this.manifest.count===count};
    }finally{this.setMeasuring(false);this.clearSelection();this.setShowUncertainLocal(raw);this.setModelDisplay(display);this.visitMilkyWay();await frame()}
  }
  async probeLocalPositions(){
    if(this.manifest.subset)return {available:false,reason:"The embedded-position audit requires the full catalog."};
    const center=this.milkyWay.center,radius=this.milkyWay.radius*8;
    const nodes=[...this.nodes.values()].filter(node=>!node.children.length&&this.bounds.get(node.id)!.distanceToPoint(center)<=radius);
    const near:THREE.Vector3[]=[];let far:THREE.Vector3|null=null;let example:Galaxy|null=null;
    for(const node of nodes){
      const buffer=await this.loader.load(`m:${node.id}`,new URL(node.metadata.url,this.base).href,node.metadata,'metadata',node.storedCount,true);
      for(let row=0;row<node.storedCount;row++){
        const galaxy=decodeGalaxy(buffer,row,0),point=new THREE.Vector3().fromArray(galaxy.position);
        if(point.distanceTo(center)<=radius){near.push(point);example??=galaxy}
        else if(!far&&galaxy.distance>1.1)far=point;
      }
    }
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1,.000001,100000);
    camera.up.set(0,0,1);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(near.flatMap(p=>p.toArray())),3));
    const controlGeometry=new THREE.BufferGeometry();controlGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array((far??new THREE.Vector3(2,0,0)).toArray()),3));
    const visual=this.material(pointFragment,5,true,true),picker=this.material(pickFragment,5,false,true);
    // Clone shared uniforms so this isolated probe cannot change user preferences.
    visual.uniforms=THREE.UniformsUtils.clone(visual.uniforms);picker.uniforms=THREE.UniformsUtils.clone(picker.uniforms);
    const points=new THREE.Points(geometry,visual);points.frustumCulled=false;scene.add(points);
    const target=new THREE.WebGLRenderTarget(256,256),pixels=new Uint8Array(256*256*4);
    const sample=(hide:boolean,pick=false,depth=true)=>{
      const material=pick?picker:visual;points.material=material;
      material.uniforms.uOrigin.value.copy(camera.position).negate();material.uniforms.uNode.value=1;
      material.uniforms.uDepthCues.value=depth;material.uniforms.uMinOpacity.value=1;
      if(material.uniforms.uLocalChunk)material.uniforms.uLocalChunk.value=true;
      if(material.uniforms.uHideUncertainLocal)material.uniforms.uHideUncertainLocal.value=hide;
      this.renderer.setRenderTarget(target);this.renderer.setClearColor(0,0);this.renderer.clear();this.renderer.render(scene,camera);
      this.renderer.readRenderTargetPixels(target,0,0,256,256,pixels);
      let covered=0,amber=0;
      for(let i=0;i<pixels.length;i+=4)if(pixels[i]||pixels[i+1]||pixels[i+2]){covered++;if(pixels[i]>pixels[i+2]*1.2)amber++}
      return {covered,amber};
    };
    const rotations=[];
    try{
      for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
        const direction=this.milkyWay.approachDirection.applyAxisAngle(this.milkyWay.frame.normal,angle);
        camera.position.copy(center).addScaledVector(direction,.06);camera.lookAt(center);camera.updateMatrixWorld();
        rotations.push({angle,hidden:sample(true),raw:sample(false),hiddenPick:sample(true,true),rawPick:sample(false,true),withoutFading:sample(true,false,false)});
      }
      points.geometry=controlGeometry;const control=far??new THREE.Vector3(2,0,0);
      camera.position.copy(control).add(new THREE.Vector3(0,0,.06));camera.lookAt(control);camera.updateMatrixWorld();
      const outsideGuard=sample(true),outsideGuardPick=sample(true,true);
      return {candidateCount:near.length,exampleTargetId:example?.targetId,rotations,outsideGuard,outsideGuardPick,
        passed:near.length>0&&rotations.every(r=>r.hidden.covered===0&&r.hiddenPick.covered===0&&r.withoutFading.covered===0&&r.raw.covered>0&&r.raw.amber>0&&r.rawPick.covered>0)&&outsideGuard.covered>0&&outsideGuardPick.covered>0};
    }finally{target.dispose();geometry.dispose();controlGeometry.dispose();visual.dispose();picker.dispose();this.renderer.setRenderTarget(null);this.renderer.setClearColor(0x06090d,1);this.invalidate()}
  }
  /** Real chunk offsets, shared settings uniforms, visit guards and annotation lifecycle. */
  async probeLocalInteraction(){
    if(this.manifest.subset)return {available:false,reason:'Requires the full catalog.'};
    const input=document.getElementById('show-uncertain-local') as HTMLInputElement;
    const saved=input.checked,stored=localStorage.getItem('atlas-show-uncertain-local'),count=this.manifest.count;
    const change=(show:boolean)=>{input.checked=show;input.dispatchEvent(new Event('change',{bubbles:true}))};
    this.visitMilkyWay();
    const node=[...this.nodes.values()].find(node=>!node.children.length&&this.bounds.get(node.id)!.distanceToPoint(this.milkyWay.center)<this.milkyWay.radius*8)!;
    const deadline=performance.now()+15000;
    while(!this.cache.has(node.id)){this.request(node);if(performance.now()>deadline)throw new Error('Local chunk check timed out');await new Promise(resolve=>setTimeout(resolve,50))}
    const item=this.cache.get(node.id)!;
    const buffer=await this.loader.load(`m:${node.id}`,new URL(node.metadata.url,this.base).href,node.metadata,'metadata',node.storedCount,true);
    let row=0;while(row<node.storedCount&&!uncertainLocalDistance(decodeGalaxy(buffer,row,item.ids[row]).distance))row++;
    if(row===node.storedCount)throw new Error('No uncertain local fixture');
    const galaxy=decodeGalaxy(buffer,row,item.ids[row]),entry={id:galaxy.id,node:node.id,row,targetId:galaxy.targetId};
    const geometry=item.points.geometry,range={...geometry.drawRange};geometry.setDrawRange(row,1);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1,.000001,100000);
    const point=new THREE.Vector3().fromArray(galaxy.position);camera.position.copy(point).add(new THREE.Vector3(0,0,.06));camera.lookAt(point);camera.updateMatrixWorld();
    const points=new THREE.Points(geometry,item.points.material);points.frustumCulled=false;points.onBeforeRender=item.points.onBeforeRender;scene.add(points);
    const target=new THREE.WebGLRenderTarget(256,256),pixels=new Uint8Array(256*256*4);
    const sample=(pick=false)=>{
      scene.overrideMaterial=pick?this.pickMaterial:null;
      this.renderer.setRenderTarget(target);this.renderer.setClearColor(0,0);this.renderer.clear();this.renderer.render(scene,camera);
      this.renderer.readRenderTargetPixels(target,0,0,256,256,pixels);
      let covered=0,amber=0,code=0;
      for(let i=0;i<pixels.length;i+=4)if(pixels[i]||pixels[i+1]||pixels[i+2]){covered++;if(pixels[i]>pixels[i+2]*1.2)amber++;code=(pixels[i]|pixels[i+1]<<8|pixels[i+2]<<16|pixels[i+3]<<24)>>>0}
      return {covered,amber,code};
    };
    try{
      change(false);const hidden=sample(),hiddenPick=sample(true);let visitRejected=false,modelWithheld=false;
      try{await this.visitCatalog(entry)}catch(error){visitRejected=error instanceof Error&&/uncertain local/.test(error.message)}
      change(true);const raw=sample(),rawPick=sample(true),persistedOn=localStorage.getItem('atlas-show-uncertain-local')==='true';
      try{await this.ensureModel(galaxy,node,row,true)}catch(error){modelWithheld=error instanceof Error&&/physical galaxy model withheld/.test(error.message)}
      this.setMeasuring(true);await this.visitCatalog(entry);
      const rawVisitable=this.selected?.targetId===galaxy.targetId&&!this.resolvedFor(galaxy.id);
      const rawAnnotated=this.selectionMarker.visible&&this.measureMarkers[0].visible;
      change(false);
      const hiddenAnnotated=!this.selectionMarker.visible&&!this.measureMarkers[0].visible&&!this.measureLine.visible;
      const recordPreserved=this.selected?.targetId===galaxy.targetId&&this.measurement[0]?.targetId===galaxy.targetId&&this.manifest.count===count;
      const warning=!document.getElementById('local-distance-warning')!.hidden&&document.getElementById('measurement-hint')!.textContent!.includes('Unreliable');
      const persistedOff=localStorage.getItem('atlas-show-uncertain-local')==='false';
      const expectedCode=(((Number(node.id)+1)<<16)|row)>>>0;
      return {node:node.id,nodeCenter:node.center,targetId:galaxy.targetId,hidden,hiddenPick,raw,rawPick,expectedCode,visitRejected,modelWithheld,rawVisitable,rawAnnotated,hiddenAnnotated,recordPreserved,warning,persistedOn,persistedOff,
        passed:hidden.covered===0&&hiddenPick.covered===0&&raw.covered>0&&raw.amber>0&&rawPick.code===expectedCode&&visitRejected&&modelWithheld&&rawVisitable&&rawAnnotated&&hiddenAnnotated&&recordPreserved&&warning&&persistedOn&&persistedOff};
    }finally{
      geometry.setDrawRange(range.start,range.count);target.dispose();this.renderer.setRenderTarget(null);this.renderer.setClearColor(0x06090d,1);
      this.setMeasuring(false);this.clearSelection();change(saved);if(stored===null)localStorage.removeItem('atlas-show-uncertain-local');else localStorage.setItem('atlas-show-uncertain-local',stored);this.visitMilkyWay();
    }
  }
  async probeModelCatalog(){
    const catalog=this.modelCatalog;if(!catalog)return {available:false};
    const cases=[];
    for(const name of ['NGC 3982','NGC 5107','NGC 4026','NGC 4121','NGC 3738']){
      const match=Object.entries(catalog.manifest.namedTypes).find(([,entry])=>entry.name===name)!;
      const id=Number(match[0]),entry=match[1];await this.visitCatalog({id,...entry});
      const model=this.resolvedFor(id)!;
      cases.push({name,family:model.data.model?.family??(model.data.spiral?'spiral':'lenticular'),expectedFamily:entry.family,
        picking:await this.probeResolvedPicking(id),profile:this.probeGalaxyProfile(id),residentModels:this.resolvedGalaxies.length});
    }
    await this.visitCatalog(catalog.manifest.unresolvedExample);
    const fallback=this.resolvedFor(catalog.manifest.unresolvedExample.id)!;
    const unresolved={id:fallback.data.galaxy.targetId,radiusMpc:fallback.radius,shapeMeasured:fallback.data.model!.shapeMeasured,typeSource:fallback.data.model!.typeSource,picking:await this.probeResolvedPicking(fallback.data.galaxy.id)};
    const irregular=Object.entries(catalog.manifest.namedTypes).find(([,entry])=>entry.name==='NGC 3738')!;
    await this.visitCatalog({id:Number(irregular[0]),...irregular[1]});
    const model=this.resolvedFor(Number(irregular[0]))!,galaxy=model.data.galaxy,radius=model.radius;
    this.clearSelection();this.removeModel(model);this.bindModels();
    this.focusAt(new THREE.Vector3().fromArray(galaxy.position),radius*12);this.modelScanNeeded=true;
    const deadline=performance.now()+8000;
    while(!this.resolvedFor(galaxy.id)&&performance.now()<deadline){this.invalidate();await new Promise(resolve=>setTimeout(resolve,100))}
    const automatic={loadedWithoutSelection:!!this.resolvedFor(galaxy.id),selectionEmpty:this.selected===null,residentModels:this.resolvedGalaxies.length};
    if(this.resolvedFor(galaxy.id))this.visitGalaxy(galaxy.id);
    // Saturate the model pool with real root-sample identities in one batch.
    // All calls use the normal checksum/decoding/construction/eviction path.
    const root=this.cache.get(this.root)!;
    const metadata=await this.loader.load(`m:${this.root}`,new URL(root.node.metadata.url,this.base).href,root.node.metadata,'metadata',root.node.storedCount,true);
    await catalog.read(root.node);
    const counts:number[]=[];
    await Promise.all(Array.from({length:24},async(_,row)=>{await this.ensureModel(decodeGalaxy(metadata,row,root.ids[row]),root.node,row,true);counts.push(this.resolvedGalaxies.length)}));
    const saturation={requested:24,peakResidentModels:Math.max(...counts),limit:MODEL_LIMIT};
    this.modelScanNeeded=true;this.invalidate();
    const bounded=cases.every(item=>item.residentModels<=MODEL_LIMIT)&&automatic.residentModels<=MODEL_LIMIT&&saturation.peakResidentModels===MODEL_LIMIT;
    return {available:true,coverage:{count:catalog.manifest.count,measured:catalog.manifest.measuredShapes,assumed:catalog.manifest.assumedShapes,visualTypes:catalog.manifest.visualTypes},cases,unresolved,automatic,saturation,bounded,
      passed:cases.every(item=>item.family===item.expectedFamily&&item.picking.passed&&item.profile.passed)&&!unresolved.shapeMeasured&&Math.abs(unresolved.radiusMpc-.005)<1e-12&&unresolved.picking.passed&&automatic.loadedWithoutSelection&&automatic.selectionEmpty&&bounded};
  }
  async probeMilkyWay(){
    const model=this.milkyWay,previousDisplay=this.modelDisplay,selected=this.selected,measured=this.measurementDistance,count=this.manifest.count;
    const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    this.setModelDisplay('automatic');this.focusObserver();await frame();
    const center=model.center.clone().project(this.camera),sun=new THREE.Vector3().project(this.camera);
    const arrival={visible:model.visible,blend:model.blend.value,focusAtSun:this.controls.target.length()<1e-12,cameraDistance:this.camera.position.length(),centerNdc:center.toArray(),sunNdc:sun.toArray()};
    this.clearHomeSelection();const rect=this.canvas.getBoundingClientRect();
    await this.pick(rect.left+(center.x*.5+.5)*rect.width,rect.top+(.5-center.y*.5)*rect.height);
    const bodyPicking=this.homeSelected&&this.selected===selected;
    const target=new THREE.WebGLRenderTarget(256,256),pixels=new Uint8Array(256*256*4);
    const sample=()=>{
      model.update(this.camera,this.canvas.clientHeight||innerHeight,this.pixelRatio,this.homeFocused,this.modelDisplay);
      this.renderer.setRenderTarget(target);this.renderer.setClearColor(0,0);this.renderer.clear();this.renderer.render(model.scene,this.camera);
      this.renderer.readRenderTargetPixels(target,0,0,256,256,pixels);
      let litPixels=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>12)litPixels++;
      return {visible:model.visible,blend:model.blend.value,litPixels};
    };
    let views;
    try{
      const outside=sample();
      this.camera.position.copy(model.approachDirection).multiplyScalar(.00001);this.controls.update();await frame();
      const nearSun=sample(),sunAtMinimumZoom=new THREE.Vector3().project(this.camera);
      this.camera.position.set(0,0,0);this.camera.lookAt(model.center);this.camera.updateMatrixWorld();const inside=sample();
      this.setModelDisplay('points');const points=sample();
      this.setModelDisplay('focused');const focused=sample();
      this.reset();this.camera.position.set(0,0,0);this.camera.lookAt(model.center);this.camera.updateMatrixWorld();const noFocus=sample();
      views={outside,nearSun,inside,points,focused,noFocus,sunMarkerWithinClip:sunAtMinimumZoom.z>=-1&&sunAtMinimumZoom.z<=1};
    }finally{target.dispose();this.renderer.setRenderTarget(null);this.renderer.setClearColor(0x06090d,1);this.setModelDisplay(previousDisplay);this.focusObserver();this.invalidate()}
    return {arrival,bodyPicking,views,catalogUnchanged:this.manifest.count===count&&this.selected===selected&&this.measurementDistance===measured,memoryBytes:model.memoryBytes,
      passed:arrival.visible&&arrival.blend===1&&arrival.focusAtSun&&Math.abs(arrival.cameraDistance-.06)<1e-12&&bodyPicking&&views.outside.litPixels>100&&views.inside.litPixels>100&&views.nearSun.litPixels>100&&views.points.litPixels===0&&!views.points.visible&&views.focused.litPixels>100&&views.noFocus.litPixels===0&&views.sunMarkerWithinClip&&this.manifest.count===count&&this.selected===selected&&this.measurementDistance===measured};
  }
  async probeObserverPass(){
    const model=this.resolvedGalaxies.find(item=>item.data.spiral)!;
    const previousDisplay=this.modelDisplay;this.setModelDisplay('automatic');
    // Preserve an inspected galaxy while changing navigation to the observer.
    this.visitGalaxy(model.data.galaxy.id);
    this.focusObserver();
    const target=new THREE.WebGLRenderTarget(256,256),pixels=new Uint8Array(256*256*4);
    const samples=[];
    try{
      for(const radiusMultiple of [60,24,12,6,2,.25,0,-2]){
        this.camera.position.copy(model.center).addScaledVector(model.frame.radial,model.radius*radiusMultiple);
        this.controls.target.set(0,0,0);this.controls.update();
        this.updateModel(model);
        this.renderer.setRenderTarget(target);this.renderer.setClearColor(0,0);this.renderer.clear();this.renderer.render(model.scene,this.camera);
        this.renderer.readRenderTargetPixels(target,0,0,256,256,pixels);
        let bright=0;
        for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>24)bright++;
        samples.push({radiusMultiple,blend:model.blend.value,brightFraction:bright/65536,bodyIntercepts:model.hitTest(new THREE.Vector2(.6,.6),this.camera)});
      }
    }finally{target.dispose();this.renderer.setRenderTarget(null);this.renderer.setClearColor(0x06090d,1)}
    const close=()=>{this.camera.position.copy(model.center).addScaledVector(model.frame.radial,model.radius*.25);this.controls.update();this.updateModel(model)};
    this.visitGalaxy(model.data.galaxy.id);close();const deliberate=model.blend.value===1&&model.visible;
    this.updateDepthCues();const focusedHorizon=this.fadeRangeUniform.value.y;
    this.setModelDisplay('points');this.updateModel(model);this.updateDepthCues();
    const pointsOnly=model.blend.value===0&&!model.hitTest(new THREE.Vector2(),this.camera),stablePointHorizon=this.fadeRangeUniform.value.y===focusedHorizon;
    this.setModelDisplay('focused');this.updateModel(model);const focusedOnly=model.blend.value===1;
    this.focusObserver();close();const observerClearsFocus=model.blend.value===0&&this.selected?.id===model.data.galaxy.id;
    this.setModelDisplay('automatic');this.visitGalaxy(model.data.galaxy.id);this.reset();close();const overviewClearsFocus=model.blend.value===0;
    this.setModelDisplay(previousDisplay);this.focusObserver();close();this.invalidate();
    return {galaxy:model.data.name,samples,deliberate,pointsOnly,stablePointHorizon,focusedOnly,observerClearsFocus,overviewClearsFocus,
      passed:samples.filter(sample=>sample.radiusMultiple<=6).every(sample=>sample.brightFraction<.05&&!sample.bodyIntercepts)&&deliberate&&pointsOnly&&stablePointHorizon&&focusedOnly&&observerClearsFocus&&overviewClearsFocus};
  }
  probeGalaxyProfile(id=this.resolved?.data.galaxy.id){
    const source=id===undefined?null:this.resolvedFor(id);if(!source)return {available:false};
    // Check the measured smooth component separately from illustrative arm light.
    const model=new ResolvedGalaxy({...source.data,spiral:undefined,knotCount:0}),target=new THREE.WebGLRenderTarget(256,256);
    const camera=new THREE.PerspectiveCamera(50,1,.000001,100000),pixels=new Uint8Array(256*256*4);
    camera.up.copy(model.frame.north);
    const sample=(direction:THREE.Vector3,distance:number,zoom=false)=>{
      camera.fov=zoom?THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(25))*24/distance)):50;camera.updateProjectionMatrix();
      camera.position.copy(model.center).addScaledVector(direction,distance*model.radius);camera.lookAt(model.center);camera.updateMatrixWorld();model.update(camera,256,1,true);
      this.renderer.setRenderTarget(target);this.renderer.setClearColor(0,0);this.renderer.clear();this.renderer.render(model.scene,camera);
      this.renderer.readRenderTargetPixels(target,0,0,256,256,pixels);
      let weight=0,x=0,y=0,xx=0,yy=0,xy=0,litPixels=0;
      for(let i=0;i<256*256;i++){
        const w=pixels[i*4]+pixels[i*4+1]+pixels[i*4+2],px=i%256-127.5,py=Math.floor(i/256)-127.5;
        if(w)litPixels++;weight+=w;x+=w*px;y+=w*py;xx+=w*px*px;yy+=w*py*py;xy+=w*px*py;
      }
      const a=xx/weight-(x/weight)**2,b=yy/weight-(y/weight)**2,c=xy/weight-x*y/weight**2;
      const discriminant=Math.hypot(a-b,2*c),axisRatio=Math.sqrt((a+b-discriminant)/(a+b+discriminant));
      return {litPixels,axisRatio,visible:model.visible,blend:model.blend.value};
    };
    try{
      const observerDistance=model.data.galaxy.distance/model.radius;
      const observed=sample(model.frame.radial.clone().negate(),observerDistance,true),faceOn=sample(model.frame.normal,observerDistance,true);
      const inside=sample(model.frame.normal,0),far=sample(model.frame.radial.clone().negate(),1e6);
      return {available:true,observed,faceOn,inside,far,expectedAxisRatio:model.frame.q,
        passed:Math.abs(observed.axisRatio-model.frame.q)<.01&&faceOn.axisRatio>.99&&inside.litPixels===65536&&!far.visible&&far.litPixels===0};
    }finally{model.dispose();target.dispose();this.renderer.setRenderTarget(null);this.renderer.setClearColor(0x06090d,1);this.invalidate()}
  }
  async probeResolvedPicking(id=this.resolved?.data.galaxy.id){
    const model=id===undefined?null:this.resolvedFor(id);
    if(!model)return {available:false};
    this.visitGalaxy(id);await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    const point=model.center.clone().addScaledVector(model.frame.major,2*model.radius).project(this.camera),rect=this.canvas.getBoundingClientRect();
    this.clearSelection();await this.pick(rect.left+(point.x*.5+.5)*rect.width,rect.top+(.5-point.y*.5)*rect.height);
    return {available:true,passed:this.selected?.targetId===model.data.galaxy.targetId,targetId:this.selected?.targetId};
  }
  probeDepthCues(){
    // Isolated GPU acceptance check: exercise the actual display and ID shaders.
    const target=new THREE.WebGLRenderTarget(64,64),scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(50,1,.1,2000);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(3),3));
    const material=this.material(pointFragment,8,false,true).clone();
    const picker=this.pickMaterial.clone();picker.uniforms.uSize.value=8;picker.uniforms.uNode.value=1;
    const points=new THREE.Points(geometry,material);points.frustumCulled=false;scene.add(points);
    const pixels=new Uint8Array(64*64*4);
    const sample=(distance:number,pick=false,enabled=true,minimumOpacity=0,enlarge=true)=>{
      const m=pick?picker:material;points.material=m;
      m.uniforms.uOrigin.value.set(0,0,-distance);m.uniforms.uFadeRange.value.set(100,1000);m.uniforms.uDepthCues.value=enabled;
      m.uniforms.uMinOpacity.value=minimumOpacity;
      m.uniforms.uEnlargePoints.value=enlarge;
      this.renderer.setRenderTarget(target);this.renderer.setClearColor(0,0);this.renderer.clear();this.renderer.render(scene,camera);
      this.renderer.readRenderTargetPixels(target,0,0,64,64,pixels);
      let maxAlpha=0,coveredPixels=0;
      for(let i=0;i<pixels.length;i+=4){maxAlpha=Math.max(maxAlpha,pixels[i+3]);if(pick?(pixels[i]||pixels[i+1]||pixels[i+2]):pixels[i+3])coveredPixels++}
      return {maxAlpha,coveredPixels};
    };
    try{
      const configuredNear=sample(10,false,true,0,this.enlargePointsUniform.value);
      const near=sample(10),middle=sample(500),far=sample(1200),uniform=sample(1200,false,false);
      const nearPick=sample(10,true),farPick=sample(1200,true),uniformPick=sample(1200,true,false);
      const faintFloor=sample(1200,false,true,.01),faintFloorPick=sample(1200,true,true,.01);
      const fixedNear=sample(10,false,true,0,false),fixedNearPick=sample(10,true,true,0,false),enlargedWithoutFade=sample(10,false,false),fixedWithoutFade=sample(10,false,false,0,false);
      const independentSize=fixedNear.maxAlpha===near.maxAlpha&&fixedNear.coveredPixels===middle.coveredPixels&&fixedNearPick.coveredPixels===uniformPick.coveredPixels&&nearPick.coveredPixels>fixedNearPick.coveredPixels&&enlargedWithoutFade.coveredPixels>fixedWithoutFade.coveredPixels&&enlargedWithoutFade.maxAlpha===fixedWithoutFade.maxAlpha;
      return {configuredNear,near,middle,far,uniform,nearPick,farPick,uniformPick,faintFloor,faintFloorPick,fixedNear,fixedNearPick,enlargedWithoutFade,fixedWithoutFade,independentSize,passed:independentSize&&near.maxAlpha===255&&middle.maxAlpha>0&&middle.maxAlpha<near.maxAlpha&&near.coveredPixels>middle.coveredPixels&&far.coveredPixels===0&&uniform.coveredPixels>0&&nearPick.coveredPixels>0&&farPick.coveredPixels===0&&uniformPick.coveredPixels>0&&faintFloor.maxAlpha>0&&faintFloor.maxAlpha<10&&faintFloorPick.coveredPixels>0};
    }finally{
      this.renderer.setRenderTarget(null);this.renderer.setClearColor(0x06090d,1);
      target.dispose();geometry.dispose();material.dispose();picker.dispose();this.invalidate();
    }
  }
  async probePicking(skipId=-1){
    // Called only by the development acceptance runner. Project actual visible data,
    // then exercise the exact GPU-picking and metadata path used by mouse clicks.
    const rect=this.canvas.getBoundingClientRect();let attempted=0;
    for(const id of this.drawn){const item=this.cache.get(id)!;const positions=item.points.geometry.getAttribute('position');
      for(let row=0;row<positions.count;row+=Math.max(1,Math.floor(positions.count/1000))){
        if(item.ids[row]===skipId)continue;
        const world=new THREE.Vector3(positions.getX(row)+item.node.center[0],positions.getY(row)+item.node.center[1],positions.getZ(row)+item.node.center[2]);
        const projected=world.clone().project(this.camera);
        if(projected.z<0||projected.z>1||Math.abs(projected.x)>.5||Math.abs(projected.y)>.55)continue;
        await this.pick(rect.left+(projected.x*.5+.5)*rect.width,rect.top+(.5-projected.y*.5)*rect.height);
        if(this.selected&&this.selected.id!==skipId)return {ok:true,selected:this.selected.targetId,attempted:attempted+1};
        if(++attempted>=8)return {ok:false,attempted};
      }
    }
    return {ok:false,attempted};
  }
  async probeContextRecovery(){
    const extension=this.renderer.getContext().getExtension('WEBGL_lose_context');if(!extension)return {supported:false};
    extension.loseContext();await new Promise(resolve=>setTimeout(resolve,500));extension.restoreContext();
    await new Promise(resolve=>setTimeout(resolve,1000));this.invalidate();return {supported:true,recovered:!this.contextLost};
  }
  async probeIntegrityFailure(){
    const node=this.nodes.get(this.root)!,loader=new ChunkLoader();
    try{await loader.load('integrity-test',new URL(node.points.url,this.base).href,{...node.points,sha256:'0'.repeat(64)},'points',node.storedCount);return {rejected:false}}
    catch(error){return {rejected:true,message:error instanceof Error?error.message:String(error)}}
    finally{loader.dispose()}
  }
  get renderingInfo(){const gl=this.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION),width:this.canvas.width,height:this.canvas.height}}
  dispose(){this.disposed=true;this.lifecycle.abort();cancelAnimationFrame(this.frame);this.exitFlight();this.loader.dispose();this.modelCatalog?.dispose();this.controls.dispose();this.milkyWay.dispose();this.allModels.forEach(model=>model.dispose());this.nearbyPoints.geometry.dispose();this.nearbyPoints.material.dispose();this.nearbyPicker.dispose();for(const item of this.cache.values()){item.points.geometry.dispose();item.points.material.dispose()}this.pickTarget.dispose();this.pickMaterial.dispose();this.renderer.dispose();this.canvas.remove()}
}
