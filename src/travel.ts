import * as THREE from 'three';

/** Camera pose relative to an orbit target; `direction` is unit, from the target toward the camera. */
export interface Pose{target:THREE.Vector3;distance:number;direction:THREE.Vector3}

const rotation=new THREE.Quaternion(),partial=new THREE.Quaternion();

/**
 * Pure pose interpolation for camera travel, s in [0,1]. Writes into `out` when given (no per-frame
 * allocation), otherwise returns a new pose. Target lerps, distance interpolates in log space plus a hop that
 * lifts the camera high enough to see both endpoints, direction follows the great circle.
 */
export function interpolatePose(from:Pose,to:Pose,s:number,out:Pose={target:new THREE.Vector3(),distance:0,direction:new THREE.Vector3()}):Pose{
  const e=s*s*(3-2*s);
  out.target.lerpVectors(from.target,to.target,e);
  // ponytail: 1.3 is what fov 50° needs to see both endpoints at the apex; tune if fov changes
  out.distance=Math.exp(THREE.MathUtils.lerp(Math.log(from.distance),Math.log(to.distance),e))+1.3*from.target.distanceTo(to.target)*Math.sin(Math.PI*e);
  // setFromUnitVectors already picks a deterministic perpendicular axis for antiparallel inputs.
  rotation.setFromUnitVectors(from.direction,to.direction);
  out.direction.copy(from.direction).applyQuaternion(partial.identity().slerp(rotation,e));
  return out;
}

export function cameraFromPose(pose:Pose,out=new THREE.Vector3()){
  return out.copy(pose.target).addScaledVector(pose.direction,pose.distance);
}
