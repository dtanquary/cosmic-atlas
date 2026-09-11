import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ChunkLoader } from './loader';
import { chooseFrontier, coveredFrontier } from './spatial';
import { decodeGalaxy, separation } from './format';
import {ResolvedGalaxy, type GalaxyDetailData} from './galaxy-detail';
import {ModelCatalog,MODEL_LIMIT,decodeModel,measuredShape} from './model-catalog';
import type { Galaxy, Manifest, SpatialNode } from './types';

const vertex=`precision highp float;
precision highp int;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform vec3 uOrigin;
uniform float uSize;
uniform uint uNode;
uniform bool uDepthCues;
uniform vec2 uFadeRange;
uniform vec3 uDetailOrigins[${MODEL_LIMIT}];
uniform float uDetailMix[${MODEL_LIMIT}];
uniform float uMinOpacity;
out float vDetail;
out float vVisibility;
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
  if(uDepthCues){
    float distanceToCamera = length(relative);
    vVisibility = mix(1.0,uMinOpacity,smoothstep(uFadeRange.x, uFadeRange.y, distanceToCamera));
    // Screen markers grow by at most 65%, only within 150 Mpc of the camera.
    gl_PointSize *= 1.0 + .65 * (1.0 - smoothstep(0.0, 150.0, distanceToCamera));
  }
  vCode = (uNode << 16u) | uint(gl_VertexID);
}`;
const pointFragment=`precision highp float;
in float vVisibility;
in float vDetail;
uniform bool uDepthCues;
out vec4 fragColor;
void main(){
  float r=length(gl_PointCoord-vec2(.5));
  if(r>.5||vVisibility<=0.0)discard;
  float alpha=(uDepthCues?vVisibility:.88)*(1.0-smoothstep(.25,.5,r));
  alpha *= 1.0 - vDetail;
  if(alpha<=0.0)discard;
  fragColor=vec4(.73,.82,.9,alpha);
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
  resolvedGalaxies:ResolvedGalaxy[]=[];
  modelCatalog:ModelCatalog|null=null;
  get resolved(){return this.resolvedGalaxies.find(model=>model.data.galaxy.id===this.selected?.id)??this.resolvedGalaxies[0]??null}
  resolvedFor(id:number){return this.resolvedGalaxies.find(model=>model.data.galaxy.id===id)}
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
  private selectionMarker=this.marker(0xb6f1fa,15);
  private measureMarkers=[this.marker(0x9ee4f1,13),this.marker(0x9ee4f1,13)];
  private measureLine=new THREE.Line(new THREE.BufferGeometry(),this.material(lineFragment,1,true));
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
    this.selectionMarker.visible=false;this.measureMarkers.forEach(m=>m.visible=false);this.measureLine.visible=false;
    this.annotations.add(this.originMarker,this.selectionMarker,...this.measureMarkers,this.measureLine);
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
  private material(fragment:string,size:number,transparent:boolean,depthCues=false){
    const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:vertex,fragmentShader:fragment,
      uniforms:{uOrigin:{value:new THREE.Vector3()},uSize:{value:size},uNode:{value:0},uColor:{value:new THREE.Color(0x9fe5f1)},uDepthCues:depthCues?this.depthCueUniform:{value:false},uFadeRange:this.fadeRangeUniform,
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
        return new ResolvedGalaxy(data);
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
    this.selectionSerial++;
    this.exitFlight();this.controls.enabled=true;
    this.camera.position.copy(this.overviewPosition);this.controls.target.copy(this.overviewTarget);
    this.camera.up.set(0,0,1);this.controls.update();this.focusDistance=this.camera.position.distanceTo(this.controls.target);
    this.dirty=true;this.invalidate();
  }
  setMode(mode:'adaptive'|'full'){this.mode=mode;this.blocked=false;this.dirty=true;this.invalidate()}
  setDepthCues(enabled:boolean){this.depthCueUniform.value=enabled;this.dirty=true;this.invalidate()}
  setMinimumOpacity(value:number){if(!Number.isFinite(value))return;this.minOpacityUniform.value=THREE.MathUtils.clamp(value,0,1);this.dirty=true;this.invalidate()}
  private updateDepthCues(){
    // Expand the fade horizon smoothly outside the survey; use a neighborhood
    // range inside it. This works in both orbit and flight without mode changes.
    const outside=this.camera.position.distanceTo(this.overviewTarget)-this.overviewRadius;
    let far=Math.max(1500,this.overviewRadius*.4+Math.max(0,outside)*3);
    // Resolve a galaxy against its local neighborhood rather than a wall of
    // distant screen markers. The same reversible distance-cue setting applies.
    for(const model of this.resolvedGalaxies){const localHorizon=Math.max(1,this.camera.position.distanceTo(model.center)*30);far=Math.min(far,THREE.MathUtils.lerp(far,localHorizon,model.blend.value))}
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
  clearSelection(){this.selectionSerial++;this.selected=null;this.selectionMarker.visible=false;this.onSelection(null);this.invalidate()}
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
    const id=model.data.galaxy.id;model.dispose();this.modelLocations.delete(id);
    this.resolvedGalaxies=this.resolvedGalaxies.filter(item=>item!==model);
  }
  private ensureModel(galaxy:Galaxy,node:SpatialNode,row:number,priority=false):Promise<ResolvedGalaxy>{
    const existing=this.resolvedFor(galaxy.id);if(existing)return Promise.resolve(existing);
    const pending=this.modelRequests.get(galaxy.id);if(pending)return pending;
    if(!this.modelCatalog)return Promise.reject(new Error('The model catalog is unavailable'));
    const catalog=this.modelCatalog;
    const promise=catalog.read(node).then(chunk=>{
      if(this.disposed||(!priority&&!this.wantedModels.has(galaxy.id)))throw new DOMException('Model no longer nearby','AbortError');
      const existing=this.resolvedFor(galaxy.id);if(existing)return existing;
      if(this.resolvedGalaxies.length>=MODEL_LIMIT){
        const removable=this.resolvedGalaxies.filter(model=>!this.pinnedModels.has(model.data.galaxy.id)&&model.data.galaxy.id!==this.selected?.id)
          .sort((a,b)=>b.center.distanceToSquared(this.camera.position)/b.radius**2-a.center.distanceToSquared(this.camera.position)/a.radius**2)[0];
        if(!removable)throw new Error('Nearby model budget is occupied');
        this.removeModel(removable);
      }
      const model=new ResolvedGalaxy(decodeModel(catalog.manifest,chunk,row,galaxy));
      model.update(this.camera,this.canvas.clientHeight||innerHeight,this.pixelRatio);
      this.resolvedGalaxies.push(model);this.modelLocations.set(galaxy.id,{node:node.id,row});this.bindModels();
      if(this.selected?.id===galaxy.id)this.onSelection(this.selected);
      this.invalidate();return model;
    }).finally(()=>this.modelRequests.delete(galaxy.id));
    this.modelRequests.set(galaxy.id,promise);return promise;
  }
  private updateModels(){
    const catalog=this.modelCatalog;if(!catalog)return;
    const scale=(this.canvas.clientHeight||innerHeight)/(2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)));
    const camera=this.camera.position,forward=this.camera.getWorldDirection(this.scratch);
    const candidates:{id:number;node:SpatialNode;row:number;score:number}[]=[];
    const available=MODEL_LIMIT-this.pinnedModels.size-(this.selected&&!this.pinnedModels.has(this.selected.id)?1:0);
    let requests=0;
    for(const nodeId of this.drawn){
      const item=this.cache.get(nodeId)!,asset=catalog.manifest.nodes[nodeId];if(!asset)continue;
      if(this.bounds.get(nodeId)!.distanceToPoint(camera)>asset.maxRadiusMpc*scale/.7)continue;
      const chunk=catalog.get(nodeId);
      if(!chunk){
        if(!catalog.failed.has(nodeId)&&catalog.pendingCount<4&&requests++<4)void catalog.read(item.node).catch(()=>this.onMessage('Some galaxy shapes could not load. Retry missing detail to try again.'));
        continue;
      }
      const positions=item.points.geometry.getAttribute('position').array as Float32Array;
      const cx=item.node.center[0],cy=item.node.center[1],cz=item.node.center[2];
      for(let row=0;row<item.ids.length;row++){
        const id=item.ids[row];if(this.pinnedModels.has(id)||id===this.selected?.id)continue;
        const x=positions[row*3]+cx,y=positions[row*3+1]+cy,z=positions[row*3+2]+cz;
        const dx=x-camera.x,dy=y-camera.y,dz=z-camera.z,distanceSq=dx*dx+dy*dy+dz*dz;
        const radius=measuredShape(chunk,row)?chunk.values[row*5]*Math.sqrt(x*x+y*y+z*z)*Math.PI/(180*3600):catalog.manifest.fallbackRadiusMpc;
        if(dx*forward.x+dy*forward.y+dz*forward.z < -8*radius)continue;
        const score=radius*radius*scale*scale/Math.max(distanceSq,1e-20);
        if(score<.7*.7||candidates.length>=available&&score<=candidates[candidates.length-1].score)continue;
        const candidate={id,node:item.node,row,score};
        const index=candidates.findIndex(other=>score>other.score);
        candidates.splice(index<0?candidates.length:index,0,candidate);if(candidates.length>available)candidates.pop();
      }
    }
    this.wantedModels=new Set(candidates.map(item=>item.id));
    let changed=false;
    for(const model of [...this.resolvedGalaxies]){
      const id=model.data.galaxy.id;
      if(!this.pinnedModels.has(id)&&id!==this.selected?.id&&!this.wantedModels.has(id)&&!this.modelRequests.has(id)){this.removeModel(model);changed=true}
    }
    if(changed)this.bindModels();
    for(const candidate of candidates){
      if(this.resolvedFor(candidate.id)||this.modelRequests.has(candidate.id)||this.modelRequests.size>=4)continue;
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
    if(!this.selected)return;
    this.focusAt(new THREE.Vector3().fromArray(this.selected.position),this.resolvedFor(this.selected.id)?this.resolvedFor(this.selected.id)!.radius*12:25);
  }
  visitGalaxy(id=this.resolved?.data.galaxy.id){
    const model=id===undefined?null:this.resolvedFor(id);
    if(!this.ready||!model)return;
    this.selectionSerial++;this.selectGalaxy(model.data.galaxy);
    this.focusAt(model.center,model.radius*12,model.frame.radial.clone().negate());
    this.onMessage(`${model.data.name} · observer-facing view. Drag to explore its inferred 3D shape.`);
  }
  async visitCatalog(entry:{id:number;node:string;row:number;targetId:string}){
    const node=this.nodes.get(entry.node),serial=++this.selectionSerial;
    if(!node||!Number.isInteger(entry.row)||entry.row<0||entry.row>=node.storedCount)throw new Error('This named observation is unavailable.');
    const metadata=await this.loader.load(`m:${node.id}`,new URL(node.metadata.url,this.base).href,node.metadata,'metadata',node.storedCount,true);
    const galaxy=decodeGalaxy(metadata,entry.row,entry.id);
    if(galaxy.targetId!==entry.targetId)throw new Error('The name index does not match this catalog.');
    if(this.modelCatalog)try{await this.ensureModel(galaxy,node,entry.row,true)}catch{this.onMessage('The shape could not load; showing the catalog position. Retry missing detail to try again.')}
    if(serial!==this.selectionSerial)return;
    if(this.resolvedFor(galaxy.id)){this.visitGalaxy(galaxy.id);return}
    this.selectGalaxy(galaxy);this.focusSelected();
  }
  focusObserver(){
    if(!this.ready)return;
    this.focusAt(new THREE.Vector3(0,0,0));
    this.onMessage('Focused on observer · our location');
  }
  private focusAt(target:THREE.Vector3,distance=25,direction=this.camera.getWorldDirection(new THREE.Vector3()).negate()){
    this.selectionSerial++;
    this.exitFlight();this.controls.enabled=true;
    // Consume any remaining orbit/pan damping before setting the exact focus.
    const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();
    this.controls.target.copy(target);this.camera.position.copy(target).addScaledVector(direction,distance);
    this.controls.update();this.controls.enableDamping=damping;this.focusDistance=distance;
    this.dirty=true;this.invalidate();
  }
  private get memoryBytes(){
    let bytes=this.references.byteLength+this.pickTarget.width*this.pickTarget.height*8+this.resolvedGalaxies.reduce((sum,model)=>sum+model.memoryBytes,0)+(this.modelCatalog?.memoryBytes??0);
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
      points.onBeforeRender=(_renderer,_scene,camera,_geometry,usedMaterial)=>{
        const m=usedMaterial as THREE.RawShaderMaterial;
        m.uniforms.uOrigin.value.set(node.center[0]-camera.position.x,node.center[1]-camera.position.y,node.center[2]-camera.position.z);
        m.uniforms.uNode.value=Number(node.id)+1;m.uniformsNeedUpdate=true;
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
    this.selectionMarker.visible=!!this.selected;
    if(this.selected)this.selectionMarker.userData.world.fromArray(this.selected.position);
    this.measureMarkers.forEach((marker,i)=>{marker.visible=!!this.measurement[i];if(this.measurement[i])marker.userData.world.fromArray(this.measurement[i].position)});
    this.measureLine.visible=this.measurement.length===2;
    if(this.measurement.length===2){const [a,b]=this.measurement;this.measureLine.userData.world=new THREE.Vector3().fromArray(a.position);this.measureLine.geometry.dispose();this.measureLine.geometry=new THREE.BufferGeometry();this.measureLine.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array([0,0,0,b.position[0]-a.position[0],b.position[1]-a.position[1],b.position[2]-a.position[2]]),3))}
  }
  private positionAnnotations(){
    for(const marker of [this.originMarker,this.selectionMarker,...this.measureMarkers]){
      marker.material.uniforms.uOrigin.value.copy(marker.userData.world).sub(this.camera.position);
      marker.material.uniforms.uSize.value=marker.userData.size*this.pixelRatio;
    }
    if(this.measureLine.visible)this.measureLine.material.uniforms.uOrigin.value.copy(this.measureLine.userData.world).sub(this.camera.position);
    const origin=new THREE.Vector3().project(this.camera);
    const observerInFront=this.camera.getWorldDirection(this.scratch).dot(this.camera.position)<0;
    this.onOrigin((origin.x*.5+.5)*this.canvas.clientWidth,(.5-origin.y*.5)*this.canvas.clientHeight,observerInFront&&origin.z>-1&&origin.z<1&&Math.abs(origin.x)<.95&&Math.abs(origin.y)<.9);
  }
  private async pick(clientX:number,clientY:number){
    if(this.picking||!this.ready||this.contextLost)return;
    const bounds=this.canvas.getBoundingClientRect();
    const body=this.resolvedGalaxies.filter(model=>model.hitTest(new THREE.Vector2((clientX-bounds.left)/bounds.width*2-1,1-(clientY-bounds.top)/bounds.height*2),this.camera)).sort((a,b)=>a.center.distanceToSquared(this.camera.position)-b.center.distanceToSquared(this.camera.position))[0];
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
      if(this.modelCatalog)try{await this.ensureModel(galaxy,node,row,true)}catch{this.onMessage('The shape could not load; the catalog measurements are still available.')}
      if(serial!==this.selectionSerial)return;
      this.selectGalaxy(galaxy);
    }catch(error){this.onMessage(`Could not inspect this point. ${error instanceof Error?error.message:'Try again.'}`)}
    finally{this.scene.overrideMaterial=null;this.renderer.setRenderTarget(null);this.renderer.setScissorTest(false);this.renderer.setClearColor(0x06090d,1);this.picking=false;this.invalidate()}
  }
  private selectGalaxy(galaxy:Galaxy){
    this.selected=galaxy;this.onSelection(galaxy);
    if(this.measuring){if(this.measurement.length===2)this.measurement=[];if(!this.measurement.length||this.measurement[0].id!==galaxy.id)this.measurement.push(galaxy);this.onMeasure(this.measurement,true)}
    this.updateAnnotations();this.invalidate();
  }
  get stats():AtlasStats{
    const sorted=[...this.timings].sort((a,b)=>a-b),mean=this.timings.reduce((a,b)=>a+b,0)/(this.timings.length||1);
    return {drawn:this.drawn.reduce((n,id)=>n+this.nodes.get(id)!.storedCount,0),loaded:this.loadedUnique,represented:this.drawn.reduce((n,id)=>n+this.nodes.get(id)!.count,0),pending:this.loader.pending+(this.modelCatalog?.pendingCount??0),failed:this.failed.size+(this.modelCatalog?.failed.size??0),mode:this.mode,
      complete:this.ready&&this.drawn.length>0&&this.desired.size===this.drawn.length&&this.drawn.every(id=>this.desired.has(id))&&this.drawn.every(id=>!this.nodes.get(id)!.children.length),
      fps:mean?1000/mean:0,p95:sorted[Math.floor(sorted.length*.95)]??0,calls:this.renderer.info.render.calls,managedMiB:this.memoryBytes/1048576,blocked:this.blocked,
      focusDistance:this.camera.position.distanceTo(this.controls.target),budget:this.sampleBudget,models:this.resolvedGalaxies.filter(model=>model.visible).length};
  }
  invalidate(){if(!this.frame&&!document.hidden&&!this.contextLost&&!this.disposed)this.frame=requestAnimationFrame(time=>this.tick(time))}
  private tick(time:number){
    this.frame=0;if(this.contextLost)return;
    const elapsed=this.lastTime?time-this.lastTime:16.67;this.lastTime=time;
    const moved=this.move(Math.min(elapsed/1000,.05));
    const orbitMoved=!this.flight&&!this.autoFly&&this.controls.update();
    const automaticOrbit=!this.flight&&!this.autoFly&&this.controls.autoRotate;
    if((moved||orbitMoved||automaticOrbit)&&this.wasContinuous){this.timings.push(elapsed);if(this.timings.length>240)this.timings.shift()}
    this.resolvedGalaxies.forEach((model,i)=>{model.update(this.camera,this.canvas.clientHeight||innerHeight,this.pixelRatio);this.detailBlendUniform.value[i]=model.blend.value});
    this.updateDepthCues();
    if(this.dirty||time-this.lastLOD>200){this.updateLOD();this.lastLOD=time;this.dirty=false}
    if(this.modelScanNeeded||time-this.lastModelScan>250){this.updateModels();this.lastModelScan=time;this.modelScanNeeded=false}
    this.positionAnnotations();this.renderer.info.reset();this.renderer.autoClear=true;this.renderer.render(this.scene,this.camera);this.renderer.autoClear=false;
    for(const model of this.resolvedGalaxies)if(model.visible)this.renderer.render(model.scene,this.camera);
    this.renderer.render(this.annotations,this.camera);this.renderer.autoClear=true;
    if(time-this.lastStats>250||!(moved||orbitMoved)){this.onStats(this.stats);this.lastStats=time}
    if(this.mode==='adaptive'&&(moved||orbitMoved)&&!this.loader.pending&&++this.adaptationFrames>120){
      const p95=this.stats.p95;
      if(p95>22)this.sampleBudget=Math.max(250000,Math.floor(this.sampleBudget*.8));
      else if(p95>0&&p95<17)this.sampleBudget=Math.min(2000000,Math.floor(this.sampleBudget*1.1));
      this.adaptationFrames=0;this.dirty=true;
    }
    this.wasContinuous=!!(moved||orbitMoved||automaticOrbit||this.dirty);
    if(this.wasContinuous)this.invalidate();
  }
  get measurementDistance(){return this.measurement.length===2?separation(this.measurement[0].position,this.measurement[1].position):null}
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
  async probeObserverPass(){
    const model=this.resolvedGalaxies.find(item=>item.data.spiral)!;
    this.focusObserver();
    const target=new THREE.WebGLRenderTarget(256,256),pixels=new Uint8Array(256*256*4);
    const samples=[];
    try{
      for(const radiusMultiple of [60,24,12,6,2,.25,0,-2]){
        this.camera.position.copy(model.center).addScaledVector(model.frame.radial,model.radius*radiusMultiple);
        this.controls.target.set(0,0,0);this.controls.update();
        model.update(this.camera,this.canvas.clientHeight||innerHeight,this.pixelRatio);
        this.renderer.setRenderTarget(target);this.renderer.setClearColor(0,0);this.renderer.clear();this.renderer.render(model.scene,this.camera);
        this.renderer.readRenderTargetPixels(target,0,0,256,256,pixels);
        let bright=0;
        for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>24)bright++;
        samples.push({radiusMultiple,blend:model.blend.value,brightFraction:bright/65536,bodyIntercepts:model.hitTest(new THREE.Vector2(.6,.6),this.camera)});
      }
    }finally{target.dispose();this.renderer.setRenderTarget(null);this.renderer.setClearColor(0x06090d,1)}
    this.camera.position.copy(model.center).addScaledVector(model.frame.radial,model.radius*.25);this.controls.update();this.invalidate();
    return {galaxy:model.data.name,samples,passed:samples.filter(sample=>sample.radiusMultiple<=6).every(sample=>sample.brightFraction<.05&&!sample.bodyIntercepts)};
  }
  probeGalaxyProfile(id=this.resolved?.data.galaxy.id){
    const source=id===undefined?null:this.resolvedFor(id);if(!source)return {available:false};
    // Check the measured smooth component separately from illustrative arm light.
    const model=new ResolvedGalaxy({...source.data,spiral:undefined,knotCount:0}),target=new THREE.WebGLRenderTarget(256,256);
    const camera=new THREE.PerspectiveCamera(50,1,.000001,100000),pixels=new Uint8Array(256*256*4);
    camera.up.copy(model.frame.north);
    const sample=(direction:THREE.Vector3,distance:number,zoom=false)=>{
      camera.fov=zoom?THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(25))*24/distance)):50;camera.updateProjectionMatrix();
      camera.position.copy(model.center).addScaledVector(direction,distance*model.radius);camera.lookAt(model.center);camera.updateMatrixWorld();model.update(camera,256);
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
    const sample=(distance:number,pick=false,enabled=true,minimumOpacity=0)=>{
      const m=pick?picker:material;points.material=m;
      m.uniforms.uOrigin.value.set(0,0,-distance);m.uniforms.uFadeRange.value.set(100,1000);m.uniforms.uDepthCues.value=enabled;
      m.uniforms.uMinOpacity.value=minimumOpacity;
      this.renderer.setRenderTarget(target);this.renderer.setClearColor(0,0);this.renderer.clear();this.renderer.render(scene,camera);
      this.renderer.readRenderTargetPixels(target,0,0,64,64,pixels);
      let maxAlpha=0,coveredPixels=0;
      for(let i=0;i<pixels.length;i+=4){maxAlpha=Math.max(maxAlpha,pixels[i+3]);if(pick?(pixels[i]||pixels[i+1]||pixels[i+2]):pixels[i+3])coveredPixels++}
      return {maxAlpha,coveredPixels};
    };
    try{
      const near=sample(10),middle=sample(500),far=sample(1200),uniform=sample(1200,false,false);
      const nearPick=sample(10,true),farPick=sample(1200,true),uniformPick=sample(1200,true,false);
      const faintFloor=sample(1200,false,true,.01),faintFloorPick=sample(1200,true,true,.01);
      return {near,middle,far,uniform,nearPick,farPick,uniformPick,faintFloor,faintFloorPick,passed:near.maxAlpha===255&&middle.maxAlpha>0&&middle.maxAlpha<near.maxAlpha&&near.coveredPixels>middle.coveredPixels&&far.coveredPixels===0&&uniform.coveredPixels>0&&nearPick.coveredPixels>0&&farPick.coveredPixels===0&&uniformPick.coveredPixels>0&&faintFloor.maxAlpha>0&&faintFloor.maxAlpha<10&&faintFloorPick.coveredPixels>0};
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
  dispose(){this.disposed=true;this.lifecycle.abort();cancelAnimationFrame(this.frame);this.exitFlight();this.loader.dispose();this.modelCatalog?.dispose();this.controls.dispose();this.resolvedGalaxies.forEach(model=>model.dispose());for(const item of this.cache.values()){item.points.geometry.dispose();item.points.material.dispose()}this.pickTarget.dispose();this.pickMaterial.dispose();this.renderer.dispose();this.canvas.remove()}
}
