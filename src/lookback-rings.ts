import * as THREE from 'three';
import type {LookbackRing} from './lookback';
import {screenOverlay} from './screen-overlay';

// Each ring is the silhouette of an observer-centered sphere: a cone of half-angle
// asin(r/d) around the direction to the origin. Comparing angles avoids the float32
// cancellation of a world-space sphere test near the Sun.
const fragment=`precision highp float;
in vec2 vNdc;
uniform vec3 uToOrigin;
uniform float uRingAngle[8];
uniform int uCount;
uniform mat3 uRotation;
uniform vec2 uLens;
out vec4 fragColor;
void main(){
  vec3 ray=normalize(uRotation*vec3(vNdc*uLens,-1.));
  float ang=atan(length(cross(ray,uToOrigin)),dot(ray,uToOrigin));
  float w=max(fwidth(ang),1e-5);
  float alpha=0.;
  for(int i=0;i<8;i++){if(i>=uCount)break;alpha+=1.-smoothstep(w*.5,w*1.5,abs(ang-uRingAngle[i]));}
  if(alpha<=0.)discard;
  fragColor=vec4(vec3(.31,.61,.72),min(alpha,1.)*.35);
}`;

/** Observer-centered lookback rings: one transparent triangle, zero draws when off or when no ring is visible. */
export class LookbackRings {
  private overlay=screenOverlay(fragment,{uToOrigin:{value:new THREE.Vector3()},uRingAngle:{value:new Float32Array(8)},uCount:{value:0}});
  enabled=false;
  readonly memoryBytes=this.overlay.geometryBytes;
  render(renderer:THREE.WebGLRenderer,camera:THREE.PerspectiveCamera,rings:LookbackRing[]){
    if(!this.enabled||rings.length===0)return;
    const {uToOrigin,uRingAngle,uCount}=this.overlay.uniforms;
    uToOrigin.value.copy(camera.position).negate().normalize();
    rings.forEach((ring,i)=>{if(i<8)uRingAngle.value[i]=ring.angle});
    uCount.value=Math.min(rings.length,8);
    this.overlay.render(renderer,camera);
  }
  dispose(){this.overlay.dispose()}
}
