import Foundation
import simd

/// Perspective camera in Mpc with float64 placement; only the matrices are single precision.
/// Camera space follows three.js: +x right, +y up, −z forward.
public struct Camera: Sendable, Equatable {
  public var position: SIMD3<Double>
  public var orientation: simd_quatd
  public var fovDegrees: Double = 50
  public var aspect: Double = 1
  public var near: Double = 0.0001
  public var far: Double = 100000
  public static let up = SIMD3<Double>(0, 0, 1)

  public init(position: SIMD3<Double> = [0, 0, 1], target: SIMD3<Double> = .zero) {
    self.position = position; orientation = simd_quatd(ix: 0, iy: 0, iz: 0, r: 1)
    lookAt(target)
  }
  public var forward: SIMD3<Double> { orientation.act([0, 0, -1]) }
  public var right: SIMD3<Double> { orientation.act([1, 0, 0]) }
  public var cameraUp: SIMD3<Double> { orientation.act([0, 1, 0]) }

  /// three.js Matrix4.lookAt for cameras: z = eye − target, x = up × z, y = z × x.
  public mutating func lookAt(_ target: SIMD3<Double>) {
    var z = position - target
    if simd_length_squared(z) == 0 { z.z = 1 }
    z = simd_normalize(z)
    var x = simd_cross(Self.up, z)
    if simd_length_squared(x) == 0 { z.x += 0.0001; z = simd_normalize(z); x = simd_cross(Self.up, z) }
    x = simd_normalize(x)
    let y = simd_cross(z, x)
    orientation = simd_quatd(simd_double3x3(columns: (x, y, z)))
  }

  /// Per-frame near plane: clamp(|camera − target|·0.01, 1e-8, 1e-4), so 10 pc orbits and 14 Gpc views share one projection.
  public mutating func retuneNear(orbitDistance: Double) { near = min(0.0001, max(1e-8, orbitDistance * 0.01)) }

  /// Rotation-only view matrix; translation is folded into per-draw origins in float64.
  public var viewRotation: simd_float3x3 {
    let inverse = orientation.inverse
    let m = simd_double3x3(inverse)
    return simd_float3x3(columns: (SIMD3<Float>(m.columns.0), SIMD3<Float>(m.columns.1), SIMD3<Float>(m.columns.2)))
  }

  /// Reversed-Z perspective for Metal's [0,1] clip depth: near → 1, far → 0.
  public var projection: simd_float4x4 {
    let f = 1 / tan(fovDegrees * .pi / 360)
    let a = near / (far - near), b = near * far / (far - near)
    return simd_float4x4(columns: (
      SIMD4<Float>(Float(f / aspect), 0, 0, 0),
      SIMD4<Float>(0, Float(f), 0, 0),
      SIMD4<Float>(0, 0, Float(a), -1),
      SIMD4<Float>(0, 0, Float(b), 0)))
  }
  public var tanHalfFov: Double { tan(fovDegrees * .pi / 360) }
}

/// Flight rules from src/explorer.ts: speed in Mpc/s, wheel/pinch scaling, look with the pitch clamp, auto-fly translation.
public enum Flight {
  public static let minSpeed = 1e-6, maxSpeed = 1e4, defaultSpeed = 1000.0
  public static func adjustSpeed(_ speed: Double, wheelDeltaY: Double) -> Double { min(maxSpeed, max(minSpeed, speed * exp(-wheelDeltaY * 0.002))) }
  /// Yaw about world +z then pitch about the camera's x axis; a pitch that would pass ±0.995 in z is refused.
  public static func look(_ camera: inout Camera, movementX: Double, movementY: Double) {
    let yaw = simd_quatd(angle: -movementX * 0.002, axis: [0, 0, 1])
    camera.orientation = yaw * camera.orientation
    let previous = camera.orientation
    camera.orientation = camera.orientation * simd_quatd(angle: -movementY * 0.002, axis: [1, 0, 0])
    if abs(camera.forward.z) > 0.995 { camera.orientation = previous }
  }
  /// Auto fly moves camera and orbit target together so stopping preserves the view.
  public static func autoFly(_ camera: inout Camera, target: inout SIMD3<Double>, speed: Double, dt: Double) {
    let step = camera.forward * (speed * dt)
    camera.position += step; target += step
  }
}
