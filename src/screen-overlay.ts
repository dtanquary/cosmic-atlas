import * as THREE from 'three';

const vertex=`precision highp float;
in vec3 position;
out vec2 vNdc;
void main(){vNdc=position.xy;gl_Position=vec4(position,1.);}`;

/** Shared body of the observer-centered reference overlays: one full-screen triangle with a
 * transparent, depth-free GLSL3 raw shader. The fragment shader reconstructs each ray from
 * `vNdc`, `uRotation` and `uLens`; callers add their own uniforms and early returns. */
export function screenOverlay<U extends Record<string,THREE.IUniform>>(fragment:string,uniforms:U){
  const scene=new THREE.Scene(),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));
  const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:vertex,fragmentShader:fragment,
    uniforms:{...uniforms,uRotation:{value:new THREE.Matrix3()},uLens:{value:new THREE.Vector2()}},
    transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);
  return {scene,material,uniforms:material.uniforms as U&{uRotation:THREE.IUniform<THREE.Matrix3>;uLens:THREE.IUniform<THREE.Vector2>},geometryBytes:9*Float32Array.BYTES_PER_ELEMENT,
    setCamera(camera:THREE.PerspectiveCamera){
      camera.updateMatrixWorld();
      const lens=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/camera.zoom;
      material.uniforms.uRotation.value.setFromMatrix4(camera.matrixWorld);material.uniforms.uLens.value.set(lens*camera.aspect,lens);
    },
    dispose(){geometry.dispose();material.dispose()}};
}
