import * as THREE from 'three';
import {CMB_RADIUS_MPC} from './cosmic-scale';
import {screenOverlay} from './screen-overlay';

const fragment=`precision highp float;
in vec2 vNdc;
uniform vec3 uObserver;
uniform mat3 uRotation;
uniform vec2 uLens;
out vec4 fragColor;
const float PI=3.141592653589793;
float grid(vec3 n){
  vec2 coord=vec2(atan(n.y,n.x)*6./PI,asin(clamp(n.z,-1.,1.))*6./PI);
  vec2 width=max(fwidth(coord),vec2(.00001));
  vec2 line=1.-smoothstep(width*.4,width*1.4,abs(fract(coord+.5)-.5));
  // Fade converging meridians and undersampled lines instead of aliasing.
  line*=1.-smoothstep(vec2(.12),vec2(.4),width);
  line.x*=smoothstep(.02,.12,1.-abs(n.z));
  return max(line.x,line.y);
}
void main(){
  vec3 ray=normalize(uRotation*vec3(vNdc*uLens,-1.));
  float b=dot(uObserver,ray),c=dot(uObserver,uObserver)-1.;
  float discriminant=b*b-c;
  float edgeWidth=max(fwidth(discriminant),.000001);
  if(discriminant<0.)discard;
  float root=sqrt(discriminant),nearT=-b-root,farT=-b+root;
  if(farT<=0.)discard; // Never draw intersections behind the camera.
  vec3 back=normalize(uObserver+ray*farT);
  vec3 front=normalize(uObserver+ray*nearT);
  float rim=pow(1.-abs(dot(back,ray)),4.);
  // The far surface stays continuous inside. Fade the near surface before
  // crossing it, so numerical nearT sign changes cannot flash the whole sky.
  float nearWeight=smoothstep(.002,.04,max(0.,nearT));
  float alpha=.007+.021*grid(back)+.08*rim;
  alpha+=nearWeight*(.011+.055*grid(front)+.14*rim+.10*exp(-discriminant/(edgeWidth*1.5)));
  alpha*=smoothstep(0.,edgeWidth,discriminant);
  float tint=mix(back.z,front.z,nearWeight*.75)*.5+.5;
  vec3 color=mix(vec3(.31,.61,.72),vec3(.50,.43,.64),tint);
  fragColor=vec4(color,alpha);
}`;

/** Fixed world-space sphere, ray traced by one triangle, independent of picking.
 * The camera is normalized by the sourced radius; even inside/near-plane views
 * have no large-coordinate mesh subtraction or clipped shell geometry.
 */
export class CosmicHorizon {
  private overlay=screenOverlay(fragment,{uObserver:{value:new THREE.Vector3()}});
  enabled=false;
  readonly memoryBytes=this.overlay.geometryBytes;
  render(renderer:THREE.WebGLRenderer,camera:THREE.PerspectiveCamera){
    if(!this.enabled)return;
    this.overlay.uniforms.uObserver.value.copy(camera.position).divideScalar(CMB_RADIUS_MPC);
    this.overlay.setCamera(camera);
    renderer.render(this.overlay.scene,camera);
  }
  dispose(){this.overlay.dispose()}
}
