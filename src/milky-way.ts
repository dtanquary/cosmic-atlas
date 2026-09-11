import * as THREE from 'three';
import {GalaxyVolume,type ModelDisplay} from './galaxy-detail';
import reference from './data/milky-way.json';

export const milkyWayReference=reference;

/** Literature-based reference geometry, separate from every DESI observation. */
export class MilkyWay extends GalaxyVolume {
  private readonly bulge:GalaxyVolume;
  constructor(){
    const [major,minor,normal]=reference.axes.map(axis=>new THREE.Vector3().fromArray(axis));
    const frame={major,minor,normal,thickness:.07,q:1};
    super({family:'barred',seed:20260911,gaussians:reference.gaussians,knotCount:32000,exposure:.4,
      spiral:{arms:2,pitchDegrees:14,phaseRadians:Math.PI-THREE.MathUtils.degToRad(reference.barAngleDeg),seed:20260911,bar:true,barRadiusRe:reference.barHalfLengthMpc/reference.radiusMpc}},
      frame,reference.radiusMpc,new THREE.Vector3().fromArray(reference.centerMpc));
    this.bulge=new GalaxyVolume({family:'elliptical',seed:0,exposure:.45,gaussians:[{sigmaRe:.4,peak:1.2},{sigmaRe:1,peak:.3}]},
      {...frame,thickness:.6},.0008,this.center);
    this.scene.add(this.bulge.scene);
  }
  override update(camera:THREE.PerspectiveCamera,height:number,pixelRatio=1,focused=false,display:ModelDisplay='automatic'){
    super.update(camera,height,pixelRatio,focused,display);
    this.bulge.update(camera,height,pixelRatio,true,display);
    this.bulge.blend.value*=this.blend.value;this.bulge.scene.visible=this.visible;
  }
  get approachDirection(){return this.frame.normal.clone().multiplyScalar(.88).addScaledVector(this.frame.major,-.35).addScaledVector(this.frame.minor,.25).normalize()}
  override dispose(){this.bulge.dispose();super.dispose()}
}
