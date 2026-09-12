import * as THREE from 'three';
import {GalaxyVolume} from './galaxy-detail';
import reference from './data/milky-way.json';
import {HOME_FIELD_SIZE,milkyWayDensityField,milkyWayFragment} from './milky-way-light';

export const milkyWayReference=reference;

/** Literature-based reference geometry, separate from every DESI observation. */
export class MilkyWay extends GalaxyVolume {
  private readonly density:THREE.DataTexture;
  constructor(){
    const [major,minor,normal]=reference.axes.map(axis=>new THREE.Vector3().fromArray(axis));
    const frame={major,minor,normal,thickness:.07,q:1};
    super({family:'barred',seed:20260911,gaussians:[]},
      frame,reference.radiusMpc,new THREE.Vector3().fromArray(reference.centerMpc));
    this.density=new THREE.DataTexture(milkyWayDensityField(),HOME_FIELD_SIZE,HOME_FIELD_SIZE,THREE.RGBAFormat);
    this.density.minFilter=THREE.LinearMipmapLinearFilter;this.density.magFilter=THREE.LinearFilter;
    this.density.generateMipmaps=true;this.density.anisotropy=4;this.density.needsUpdate=true;
    const phase=Math.PI-THREE.MathUtils.degToRad(reference.barAngleDeg);
    this.material.fragmentShader=milkyWayFragment;
    Object.assign(this.material.uniforms,{uDensity:{value:this.density},uThickness:{value:frame.thickness},
      uBarDirection:{value:new THREE.Vector2(Math.cos(phase),Math.sin(phase))},
      uBarRadius:{value:reference.barHalfLengthMpc/reference.radiusMpc},uDustStrength:{value:.9}});
    // Premultiplied emission plus absorption of background light. All stellar
    // components and their intervening dust are integrated in the same pass.
    this.material.blending=THREE.CustomBlending;
    this.material.blendSrc=THREE.OneFactor;this.material.blendDst=THREE.OneMinusSrcAlphaFactor;
  }
  get approachDirection(){return this.frame.normal.clone().multiplyScalar(.88).addScaledVector(this.frame.major,-.35).addScaledVector(this.frame.minor,.25).normalize()}
  override get memoryBytes(){return this.density.image.data!.byteLength+4*(4*HOME_FIELD_SIZE*HOME_FIELD_SIZE-1)/3}
  override dispose(){this.density.dispose();super.dispose()}
}
