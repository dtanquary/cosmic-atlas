import * as THREE from 'three';

/** Camera pose relative to an orbit target; `direction` is unit, from the target toward the camera. */
export interface Pose{target:THREE.Vector3;distance:number;direction:THREE.Vector3}

const rotation=new THREE.Quaternion(),partial=new THREE.Quaternion();

/**
 * Pure pose interpolation for camera travel; s is clamped to [0,1]. Writes into `out` when given (no per-frame
 * allocation), otherwise returns a new pose. `out` may be `from` but must not be `to`. Distances must be > 0
 * (the orbit minimum is 1e-5 Mpc; the wiring clamps decoded offsets). Target lerps, distance interpolates in
 * log space plus a hop that lifts the camera high enough to see both endpoints, direction follows the great circle.
 */
export function interpolatePose(from:Pose,to:Pose,s:number,out:Pose={target:new THREE.Vector3(),distance:0,direction:new THREE.Vector3()}):Pose{
  const e=THREE.MathUtils.smoothstep(s,0,1);
  // ponytail: 1.3 fits both endpoints at fov 50° in landscape; portrait needs ~2.1 or an aspect argument
  const hop=1.3*from.target.distanceTo(to.target)*Math.sin(Math.PI*e);
  out.distance=Math.exp(THREE.MathUtils.lerp(Math.log(from.distance),Math.log(to.distance),e))+hop;
  // setFromUnitVectors already picks a deterministic perpendicular axis for antiparallel inputs.
  rotation.setFromUnitVectors(from.direction,to.direction);
  out.direction.copy(from.direction).applyQuaternion(partial.identity().slerp(rotation,e));
  out.target.lerpVectors(from.target,to.target,e);
  return out;
}
