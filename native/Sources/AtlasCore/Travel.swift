import Foundation
import simd

// Port of src/travel.ts.

/// Camera pose relative to an orbit target; `direction` is unit, from the target toward the camera.
public struct Pose: Sendable, Equatable {
  public var target: SIMD3<Double>, distance: Double, direction: SIMD3<Double>
  public init(target: SIMD3<Double>, distance: Double, direction: SIMD3<Double>) { self.target = target; self.distance = distance; self.direction = direction }
}

public func smoothstep(_ x: Double, _ min: Double, _ max: Double) -> Double {
  if x <= min { return 0 }
  if x >= max { return 1 }
  let t = (x - min) / (max - min)
  return t * t * (3 - 2 * t)
}

/// three.js Quaternion.setFromUnitVectors: the rotation taking `from` to `to`, with a deterministic axis for antiparallel inputs.
func rotation(from: SIMD3<Double>, to: SIMD3<Double>) -> simd_quatd {
  var r = simd_dot(from, to) + 1
  var q: simd_quatd
  // three.js tests r < Number.EPSILON; simd dot products round with fused multiply-add, so use a wider antiparallel band.
  if r < 1e-9 {
    r = 0
    q = abs(from.x) > abs(from.z) ? simd_quatd(ix: -from.y, iy: from.x, iz: 0, r: r) : simd_quatd(ix: 0, iy: -from.z, iz: from.y, r: r)
  } else {
    let c = simd_cross(from, to)
    q = simd_quatd(ix: c.x, iy: c.y, iz: c.z, r: r)
  }
  return simd_normalize(q)
}

/**
 Pure pose interpolation for camera travel; s is clamped to [0,1]. Distances must be > 0 (the orbit minimum is 1e-5 Mpc).
 Target lerps, distance interpolates in log space plus a hop that lifts the camera high enough to see both endpoints,
 direction follows the great circle.
 */
public func interpolatePose(from: Pose, to: Pose, _ s: Double) -> Pose {
  let e = smoothstep(s, 0, 1)
  // ponytail: 1.3 fits both endpoints at fov 50° in landscape; portrait needs ~2.1 or an aspect argument
  let hop = 1.3 * simd_distance(from.target, to.target) * sin(.pi * e)
  let distance = exp(log(from.distance) + (log(to.distance) - log(from.distance)) * e) + hop
  let full = rotation(from: from.direction, to: to.direction)
  let partial = simd_slerp(simd_quatd(ix: 0, iy: 0, iz: 0, r: 1), full, e)
  let direction = partial.act(from.direction)
  let target = from.target + (to.target - from.target) * e
  return Pose(target: target, distance: distance, direction: direction)
}
