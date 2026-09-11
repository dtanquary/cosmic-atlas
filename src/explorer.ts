import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ChunkLoader } from './loader';
import { chooseFrontier, coveredFrontier } from './spatial';
import { decodeGalaxy, separation } from './format';
import type { Galaxy, Manifest, SpatialNode } from './types';

const vertex=`precision highp float;
precision highp int;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform vec3 uOrigin;
uniform float uSize;
uniform uint uNode;
in vec3 position;
flat out uint vCode;
void main(){
  vec3 relative = position + uOrigin;
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * relative, 1.0);
  gl_PointSize = uSize;
  vCode = (uNode << 16u) | uint(gl_VertexID);
}`;
const pointFragment=`precision highp float;
out vec4 fragColor;
void main(){float r=length(gl_PointCoord-vec2(.5));if(r>.5)discard;float alpha=.88*(1.0-smoothstep(.15,.52,r));fragColor=vec4(.73,.82,.9,alpha);}`;
const pickFragment=`precision highp float;
precision highp int;
flat in uint vCode;
out vec4 fragColor;
void main(){if(length(gl_PointCoord-vec2(.5))>.5)discard;fragColor=vec4(float(vCode&255u),float((vCode>>8u)&255u),float((vCode>>16u)&255u),float((vCode>>24u)&255u))/255.0;}`;
const markerFragment=`precision highp float;
uniform vec3 uColor;
out vec4 fragColor;
void main(){float r=length(gl_PointCoord-vec2(.5));if(r>.49||r<.34)discard;fragColor=vec4(uColor,.9);}`;
const lineFragment=`precision highp float;out vec4 fragColor;void main(){fragColor=vec4(.4,.76,.85,.7);}`;

interface Resident {
  node: SpatialNode; buffer: ArrayBuffer; ids: Uint32Array; points: THREE.Points<THREE.BufferGeometry,THREE.RawShaderMaterial>;
  bytes: number; used: number;
}
export interface AtlasStats {
  drawn:number; loaded:number; represented:number; pending:number; failed:number; mode:'adaptive'|'full'; complete:boolean;
  fps:number; p95:number; calls:number; managedMiB:number; blocked:boolean; focusDistance:number; budget:number;
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
  speed=1000;
  selected:Galaxy|null=null;
  measurement:Galaxy[]=[];
  measuring=false;
  onStats=(stats:AtlasStats)=>{};
  onSelection=(galaxy:Galaxy|null)=>{};
  onMeasure=(galaxies:Galaxy[],enabled:boolean)=>{};
  onFlight=(active:boolean)=>{};
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
  private pickTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.UnsignedByteType,format:THREE.RGBAFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true,stencilBuffer:false});
  private pickMaterial=this.material(pickFragment,9,false);
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
    this.controls=new OrbitControls(this.camera,this.canvas);this.controls.enableDamping=true;this.controls.dampingFactor=.09;this.controls.minDistance=.02;this.controls.zoomSpeed=.9;
    this.controls.addEventListener('change',()=>{this.dirty=true;this.invalidate()});
    this.loader.onChange=()=>{this.dirty=true;this.invalidate()};
    this.pickMaterial.blending=THREE.NoBlending;this.pickMaterial.depthWrite=true;
    this.selectionMarker.visible=false;this.measureMarkers.forEach(m=>m.visible=false);this.measureLine.visible=false;
    this.annotations.add(this.originMarker,this.selectionMarker,...this.measureMarkers,this.measureLine);
    this.measureLine.frustumCulled=false;
    const signal=this.lifecycle.signal;
    addEventListener('resize',()=>this.resize(),{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(this.frame);this.frame=0;this.keys.clear();this.lastTime=0}else this.invalidate()},{signal});
    this.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.contextLost=true;this.onError('The graphics connection was interrupted. Waiting for it to recover…')},{signal});
    this.canvas.addEventListener('webglcontextrestored',()=>{this.contextLost=false;this.onReady();this.onMessage('Graphics restored');this.dirty=true;this.invalidate()},{signal});
    document.addEventListener('pointerlockchange',()=>{
      const enabled=document.pointerLockElement===this.canvas;
      this.flight=enabled;this.controls.enabled=!enabled;
      if(!enabled){this.keys.clear();this.controls.target.copy(this.camera.position).addScaledVector(this.camera.getWorldDirection(this.scratch),this.focusDistance);this.controls.update()}
      this.onFlight(enabled);this.invalidate();
    },{signal});
    document.addEventListener('pointerlockerror',()=>this.onMessage('Flight could not capture the pointer. Click Fly to try again.'),{signal});
    document.addEventListener('mousemove',event=>this.look(event),{signal});
    window.addEventListener('keydown',event=>{
      if((event.target as HTMLElement)?.matches('input,select,textarea')||document.querySelector('dialog[open]'))return;
      if(this.flight&&['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight'].includes(event.code)){event.preventDefault();this.keys.add(event.code);this.invalidate()}
      if(event.code==='KeyR'&&!event.metaKey&&!event.ctrlKey)this.reset();
      if(event.code==='KeyF'&&!event.metaKey&&!event.ctrlKey)this.focusSelected();
    },{signal});
    window.addEventListener('keyup',event=>this.keys.delete(event.code),{signal});
    addEventListener('blur',()=>this.keys.clear(),{signal});
    this.canvas.addEventListener('wheel',event=>{if(this.flight){event.preventDefault();this.speed=THREE.MathUtils.clamp(this.speed*Math.exp(-event.deltaY*.002),.01,10000);this.invalidate()}},{passive:false,signal});
    let down=[0,0];
    this.canvas.addEventListener('pointerdown',event=>{down=[event.clientX,event.clientY]},{signal});
    this.canvas.addEventListener('pointerup',event=>{if(event.button===0&&!this.flight&&Math.hypot(event.clientX-down[0],event.clientY-down[1])<5)void this.pick(event.clientX,event.clientY)},{signal});
    this.resize();
  }
  private material(fragment:string,size:number,transparent:boolean){
    return new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:vertex,fragmentShader:fragment,
      uniforms:{uOrigin:{value:new THREE.Vector3()},uSize:{value:size},uNode:{value:0},uColor:{value:new THREE.Color(0x9fe5f1)}},
      transparent,depthTest:true,depthWrite:!transparent,toneMapped:false});
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
    this.exitFlight();this.controls.enabled=true;
    this.camera.position.copy(this.overviewPosition);this.controls.target.copy(this.overviewTarget);
    this.camera.up.set(0,0,1);this.controls.update();this.focusDistance=this.camera.position.distanceTo(this.controls.target);
    this.dirty=true;this.invalidate();
  }
  setMode(mode:'adaptive'|'full'){this.mode=mode;this.blocked=false;this.dirty=true;this.invalidate()}
  enterFlight(){if(!this.ready)return;this.focusDistance=this.camera.position.distanceTo(this.controls.target);void this.canvas.requestPointerLock()?.catch(()=>this.onMessage('Click Fly again to enter flight.'))}
  exitFlight(){if(document.pointerLockElement===this.canvas)document.exitPointerLock()}
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
  focusSelected(){
    if(!this.selected)return;
    this.exitFlight();const direction=this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.fromArray(this.selected.position);this.camera.position.copy(this.controls.target).addScaledVector(direction,25);
    this.controls.update();this.dirty=true;this.invalidate();
  }
  private get memoryBytes(){
    let bytes=this.references.byteLength+this.pickTarget.width*this.pickTarget.height*8;
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
      const material=this.material(pointFragment,1.6*this.pixelRatio,true);
      const points=new THREE.Points(geometry,material);points.frustumCulled=false;points.visible=false;
      points.onBeforeRender=(_renderer,_scene,camera,_geometry,usedMaterial)=>{
        const m=usedMaterial as THREE.RawShaderMaterial;
        m.uniforms.uOrigin.value.set(node.center[0]-camera.position.x,node.center[1]-camera.position.y,node.center[2]-camera.position.z);
        m.uniforms.uNode.value=Number(node.id)+1;m.uniformsNeedUpdate=true;
      };
      this.cache.set(node.id,{node,buffer,ids,points,bytes:buffer.byteLength+positions.byteLength,used:performance.now()});
      for(const id of ids)if(this.references[id]++===0)this.loadedUnique++;
      this.scene.add(points);
      if(!this.ready){this.ready=true;this.onReady()}
    }).catch(error=>{if(error.name!=='AbortError'){this.failed.set(node.id,error.message);if(node.id===this.root&&!this.ready)this.onError('The first galaxy data could not load. Use Retry missing detail below.');this.onMessage(`Some detail could not load: ${error.message}`)}}).finally(()=>{this.pending.delete(node.id);this.dirty=true;this.invalidate()});
  }
  retry(){this.failed.clear();this.blocked=false;this.dirty=true;this.invalidate()}
  private updateLOD(){
    if(!this.manifest)return;
    this.camera.updateMatrixWorld();this.clipMatrix.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.clipMatrix,this.camera.coordinateSystem,this.camera.reversedDepth);
    const height=this.canvas.clientHeight||innerHeight;
    const wanted=chooseFrontier({root:this.root,nodes:this.nodes,mode:this.mode,budget:this.sampleBudget,
      visible:node=>this.frustum.intersectsBox(this.bounds.get(node.id)!),
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
    this.onOrigin((origin.x*.5+.5)*this.canvas.clientWidth,(.5-origin.y*.5)*this.canvas.clientHeight,origin.z>-1&&origin.z<1&&Math.abs(origin.x)<.95&&Math.abs(origin.y)<.9);
  }
  private async pick(clientX:number,clientY:number){
    if(this.picking||!this.ready||this.contextLost)return;
    this.picking=true;const serial=++this.selectionSerial;
    const rect=this.canvas.getBoundingClientRect(),width=this.pickTarget.width,height=this.pickTarget.height;
    const x=Math.floor((clientX-rect.left)*width/rect.width),y=Math.floor((rect.bottom-clientY)*height/rect.height);
    const left=Math.max(0,x-4),bottom=Math.max(0,y-4),w=Math.min(9,width-left),h=Math.min(9,height-bottom);
    try{
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
      const galaxy=decodeGalaxy(metadata,row,id);this.selected=galaxy;this.onSelection(galaxy);
      if(this.measuring){if(this.measurement.length===2)this.measurement=[];if(!this.measurement.length||this.measurement[0].id!==galaxy.id)this.measurement.push(galaxy);this.onMeasure(this.measurement,true)}
      this.updateAnnotations();this.invalidate();
    }catch(error){this.onMessage(`Could not inspect this point. ${error instanceof Error?error.message:'Try again.'}`)}
    finally{this.scene.overrideMaterial=null;this.renderer.setRenderTarget(null);this.renderer.setScissorTest(false);this.renderer.setClearColor(0x06090d,1);this.picking=false;this.invalidate()}
  }
  get stats():AtlasStats{
    const sorted=[...this.timings].sort((a,b)=>a-b),mean=this.timings.reduce((a,b)=>a+b,0)/(this.timings.length||1);
    return {drawn:this.drawn.reduce((n,id)=>n+this.nodes.get(id)!.storedCount,0),loaded:this.loadedUnique,represented:this.drawn.reduce((n,id)=>n+this.nodes.get(id)!.count,0),pending:this.loader.pending,failed:this.failed.size,mode:this.mode,
      complete:this.ready&&this.drawn.length>0&&this.desired.size===this.drawn.length&&this.drawn.every(id=>this.desired.has(id))&&this.drawn.every(id=>!this.nodes.get(id)!.children.length),
      fps:mean?1000/mean:0,p95:sorted[Math.floor(sorted.length*.95)]??0,calls:this.renderer.info.render.calls,managedMiB:this.memoryBytes/1048576,blocked:this.blocked,
      focusDistance:this.camera.position.distanceTo(this.controls.target),budget:this.sampleBudget};
  }
  invalidate(){if(!this.frame&&!document.hidden&&!this.contextLost&&!this.disposed)this.frame=requestAnimationFrame(time=>this.tick(time))}
  private tick(time:number){
    this.frame=0;if(this.contextLost)return;
    const elapsed=this.lastTime?time-this.lastTime:16.67;this.lastTime=time;
    const moved=this.move(Math.min(elapsed/1000,.05));
    const orbitMoved=!this.flight&&this.controls.update();
    if((moved||orbitMoved)&&this.wasContinuous){this.timings.push(elapsed);if(this.timings.length>240)this.timings.shift()}
    if(this.dirty||time-this.lastLOD>200){this.updateLOD();this.lastLOD=time;this.dirty=false}
    this.positionAnnotations();this.renderer.info.reset();this.renderer.autoClear=true;this.renderer.render(this.scene,this.camera);this.renderer.autoClear=false;this.renderer.render(this.annotations,this.camera);this.renderer.autoClear=true;
    if(time-this.lastStats>250||!(moved||orbitMoved)){this.onStats(this.stats);this.lastStats=time}
    if(this.mode==='adaptive'&&(moved||orbitMoved)&&!this.loader.pending&&++this.adaptationFrames>120){
      const p95=this.stats.p95;
      if(p95>22)this.sampleBudget=Math.max(250000,Math.floor(this.sampleBudget*.8));
      else if(p95>0&&p95<17)this.sampleBudget=Math.min(2000000,Math.floor(this.sampleBudget*1.1));
      this.adaptationFrames=0;this.dirty=true;
    }
    this.wasContinuous=!!(moved||orbitMoved||this.dirty);
    if(this.wasContinuous)this.invalidate();
  }
  get measurementDistance(){return this.measurement.length===2?separation(this.measurement[0].position,this.measurement[1].position):null}
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
  dispose(){this.disposed=true;this.lifecycle.abort();cancelAnimationFrame(this.frame);this.exitFlight();this.loader.dispose();this.controls.dispose();for(const item of this.cache.values()){item.points.geometry.dispose();item.points.material.dispose()}this.pickTarget.dispose();this.pickMaterial.dispose();this.renderer.dispose();this.canvas.remove()}
}
