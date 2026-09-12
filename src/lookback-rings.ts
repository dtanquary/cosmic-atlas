import * as THREE from 'three';
import type {LookbackRing} from './lookback';

const vertex=`precision highp float;
in vec3 position;
out vec2 vNdc;
void main(){vNdc=position.xy;gl_Position=vec4(position,1.);}`;
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
  readonly scene=new THREE.Scene();
  private geometry=new THREE.BufferGeometry();
  private material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:vertex,fragmentShader:fragment,
    uniforms:{uToOrigin:{value:new THREE.Vector3()},uRingAngle:{value:new Float32Array(8)},uCount:{value:0},uRotation:{value:new THREE.Matrix3()},uLens:{value:new THREE.Vector2()}},
    transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
  private mesh:THREE.Mesh;
  enabled=false;
  readonly memoryBytes=9*Float32Array.BYTES_PER_ELEMENT;
  constructor(){
    this.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));
    this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.scene.add(this.mesh);
  }
  render(renderer:THREE.WebGLRenderer,camera:THREE.PerspectiveCamera,rings:LookbackRing[]){
    if(!this.enabled||rings.length===0)return;
    camera.updateMatrixWorld();
    const lens=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/camera.zoom,uniforms=this.material.uniforms;
    uniforms.uToOrigin.value.copy(camera.position).negate().normalize();
    const angles=uniforms.uRingAngle.value as Float32Array;
    rings.forEach((ring,i)=>{if(i<8)angles[i]=ring.angle});
    uniforms.uCount.value=Math.min(rings.length,8);
    uniforms.uRotation.value.setFromMatrix4(camera.matrixWorld);
    uniforms.uLens.value.set(lens*camera.aspect,lens);
    renderer.render(this.scene,camera);
  }
  dispose(){this.geometry.dispose();this.material.dispose()}
}
