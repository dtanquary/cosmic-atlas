import * as THREE from 'three';
import {screenOverlay} from './screen-overlay';

export const FOOTPRINT_WIDTH=720,FOOTPRINT_HEIGHT=360;
export interface SurveyFootprintData{version:number;catalogId:string;catalogSourceSha256:string;count:number;width:number;height:number;degreesPerCell:number;maxCellCount:number;occupiedCells:number;cells:string;sources:string[];disclosure:string}
/** Structural subset of `Manifest`; subsets share the source hash and accepted count, so they keep the footprint. */
export type FootprintManifest={source:{sha256:string;acceptedRows:number}};

/** Rejects a sidecar that does not describe the active catalog; returns the uint8 grid (row 0 = Dec −90°, column 0 = RA 0°). */
export function decodeFootprint(data:SurveyFootprintData,manifest:FootprintManifest){
  if(data.version!==1||data.catalogSourceSha256!==manifest.source.sha256||data.count!==manifest.source.acceptedRows)throw new Error('Survey footprint does not match this catalog.');
  if(data.width!==FOOTPRINT_WIDTH||data.height!==FOOTPRINT_HEIGHT)throw new Error('Unexpected survey footprint resolution.');
  const cells=Uint8Array.from(atob(data.cells),c=>c.charCodeAt(0));
  if(cells.length!==data.width*data.height)throw new Error('Survey footprint grid is incomplete.');
  return cells;
}

/** Texture coordinates of a unit sky direction, mirroring the fragment shader: u = RA/360° (wrapping), v = (Dec+90°)/180°. */
export function footprintUv(n:{x:number;y:number;z:number}):[number,number]{
  const ra=Math.atan2(n.y,n.x);
  return [(ra<0?ra+2*Math.PI:ra)/(2*Math.PI),(Math.asin(Math.max(-1,Math.min(1,n.z)))+Math.PI/2)/Math.PI];
}

// The occupancy grid is painted on an observer-centered shell at the catalog's maximum
// distance, drawing both intersections like the CMB shell. Negative u from atan wraps
// through RepeatWrapping to RA 180°–360°; Dec clamps at the poles.
const fragment=`precision highp float;
in vec2 vNdc;
uniform vec3 uObserver;
uniform mat3 uRotation;
uniform vec2 uLens;
uniform sampler2D uMask;
out vec4 fragColor;
const float PI=3.141592653589793;
float occupancy(vec3 n){return texture(uMask,vec2(atan(n.y,n.x)/(2.*PI),asin(clamp(n.z,-1.,1.))/PI+.5)).r;}
void main(){
  vec3 ray=normalize(uRotation*vec3(vNdc*uLens,-1.));
  float b=dot(uObserver,ray),c=dot(uObserver,uObserver)-1.;
  float discriminant=b*b-c;
  if(discriminant<0.)discard;
  float root=sqrt(discriminant),nearT=-b-root,farT=-b+root;
  if(farT<=0.)discard; // Never draw intersections behind the camera.
  float nearWeight=smoothstep(.002,.04,max(0.,nearT));
  float alpha=.3*occupancy(normalize(uObserver+ray*farT))+nearWeight*.3*occupancy(normalize(uObserver+ray*nearT));
  alpha*=smoothstep(0.,max(fwidth(discriminant),.000001),discriminant);
  if(alpha<=0.)discard; // Unsurveyed sky stays dark rather than tinted.
  fragColor=vec4(vec3(.35,.80,.90),alpha);
}`;

/** Sky occupancy of the accepted catalog rows on an observer-centered shell: one triangle, one draw when enabled and loaded. */
export class SurveyFootprint {
  private overlay=screenOverlay(fragment,{uObserver:{value:new THREE.Vector3()},uMask:{value:null as THREE.DataTexture|null}});
  private texture:THREE.DataTexture|null=null;
  enabled=false;
  /** Shell radius; the caller sets it from `manifest.maxDistanceMpc`. */
  radiusMpc=1;
  state:'idle'|'loading'|'ready'|'failed'='idle';
  disclosure='';
  get memoryBytes(){return this.overlay.geometryBytes+(this.texture?FOOTPRINT_WIDTH*FOOTPRINT_HEIGHT:0)}
  /** Fetches and validates the sidecar; a failure leaves the overlay drawing nothing. */
  async load(url:string,manifest:FootprintManifest,signal?:AbortSignal){
    this.state='loading';
    try{
      const response=await fetch(url,{signal});if(!response.ok)throw new Error('Survey footprint could not load.');
      const data:SurveyFootprintData=await response.json(),cells=decodeFootprint(data,manifest);
      this.texture?.dispose();
      this.texture=new THREE.DataTexture(cells,data.width,data.height,THREE.RedFormat,THREE.UnsignedByteType);
      this.texture.wrapS=THREE.RepeatWrapping;this.texture.wrapT=THREE.ClampToEdgeWrapping;
      this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;this.texture.needsUpdate=true;
      this.overlay.uniforms.uMask.value=this.texture;this.disclosure=data.disclosure;this.state='ready';
    }catch{this.state='failed'}
  }
  render(renderer:THREE.WebGLRenderer,camera:THREE.PerspectiveCamera){
    if(!this.enabled||this.state!=='ready')return;
    this.overlay.uniforms.uObserver.value.copy(camera.position).divideScalar(this.radiusMpc);
    this.overlay.setCamera(camera);
    renderer.render(this.overlay.scene,camera);
  }
  dispose(){this.overlay.dispose();this.texture?.dispose()}
}
