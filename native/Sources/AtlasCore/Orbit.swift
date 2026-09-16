import Foundation
import simd

/// The subset of three.js OrbitControls the atlas uses: perspective camera, world up +z, damping, distance clamps,
/// rotate/pan/dolly deltas and auto-rotate. Positions stay in float64.
public struct Orbit: Sendable {
  public var target: SIMD3<Double> = .zero
  public var enableDamping = true
  public var dampingFactor = 0.09
  public var zoomSpeed = 0.9
  public var rotateSpeed = 1.0
  public var panSpeed = 1.0
  public var minDistance = 1e-5
  public var maxDistance = Double.infinity
  public var minPolarAngle = 0.0
  public var maxPolarAngle = Double.pi
  public var autoRotate = false
  public var autoRotateSpeed = 2.0
  private var sphericalDelta = SIMD2<Double>(0, 0) // theta, phi
  private var panOffset = SIMD3<Double>(0, 0, 0)
  private var scale = 1.0
  private var lastPosition = SIMD3<Double>(repeating: .nan)
  private var lastTarget = SIMD3<Double>(repeating: .nan)
  /// Rotates offsets into "y-axis-is-up" space, as OrbitControls does for a non-y up vector.
  private let quat = rotation(from: Camera.up, to: [0, 1, 0])
  private static let eps = 0.000001

  public init() {}

  public mutating func rotateLeft(_ angle: Double) { sphericalDelta.x -= angle }
  public mutating func rotateUp(_ angle: Double) { sphericalDelta.y -= angle }
  /// Pointer/touch rotate deltas in pixels (right and down positive), as OrbitControls scales them by the viewport height.
  public mutating func rotate(deltaX: Double, deltaY: Double, viewportHeight: Double) {
    rotateLeft(2 * .pi * deltaX * rotateSpeed / viewportHeight)
    rotateUp(2 * .pi * deltaY * rotateSpeed / viewportHeight)
  }
  public func zoomScale(delta: Double) -> Double { pow(0.95, zoomSpeed * abs(delta * 0.01)) }
  public mutating func dollyIn(_ dollyScale: Double) { scale *= dollyScale }
  public mutating func dollyOut(_ dollyScale: Double) { scale /= dollyScale }
  /// Screen-space pan by pixel deltas: distance to target × tan(fov/2) scaled by the viewport height.
  public mutating func pan(deltaX: Double, deltaY: Double, camera: Camera, viewportHeight: Double) {
    let dx = deltaX * panSpeed, dy = deltaY * panSpeed
    let targetDistance = simd_length(camera.position - target) * camera.tanHalfFov
    panOffset += camera.right * (-(2 * dx * targetDistance / viewportHeight))
    panOffset += camera.cameraUp * (2 * dy * targetDistance / viewportHeight)
  }
  /// Any deferred motion left (damping, pan, dolly): keep drawing frames while true.
  public var isSettling: Bool { abs(sphericalDelta.x) > 1e-12 || abs(sphericalDelta.y) > 1e-12 || simd_length_squared(panOffset) > 0 || scale != 1 }
  public mutating func clearMomentum() { sphericalDelta = .zero; panOffset = .zero; scale = 1 }

  /// One OrbitControls.update(): applies deltas, clamps, places the camera and looks at the target. Returns whether the camera changed.
  @discardableResult
  public mutating func update(_ camera: inout Camera, deltaTime: Double? = nil, allowAutoRotate: Bool = true) -> Bool {
    var v = quat.act(camera.position - target)
    // Spherical.setFromVector3
    var radius = simd_length(v)
    var theta = 0.0, phi = 0.0
    if radius > 0 { theta = atan2(v.x, v.z); phi = acos(max(-1, min(1, v.y / radius))) }
    if autoRotate && allowAutoRotate {
      let angle = deltaTime.map { 2 * .pi / 60 * autoRotateSpeed * $0 } ?? (2 * .pi / 60 / 60 * autoRotateSpeed)
      rotateLeft(angle)
    }
    if enableDamping { theta += sphericalDelta.x * dampingFactor; phi += sphericalDelta.y * dampingFactor }
    else { theta += sphericalDelta.x; phi += sphericalDelta.y }
    phi = max(minPolarAngle, min(maxPolarAngle, phi))
    phi = max(Self.eps, min(.pi - Self.eps, phi)) // makeSafe
    if enableDamping { target += panOffset * dampingFactor } else { target += panOffset }
    let previousRadius = radius
    radius = max(minDistance, min(maxDistance, radius * scale))
    let zoomChanged = previousRadius != radius
    let sinPhiRadius = sin(phi) * radius
    v = SIMD3(sinPhiRadius * sin(theta), cos(phi) * radius, sinPhiRadius * cos(theta))
    camera.position = target + quat.inverse.act(v)
    camera.lookAt(target)
    if enableDamping { sphericalDelta *= (1 - dampingFactor); panOffset *= (1 - dampingFactor) }
    else { sphericalDelta = .zero; panOffset = .zero }
    scale = 1
    let changed = zoomChanged || lastPosition.x.isNaN || simd_length_squared(lastPosition - camera.position) > Self.eps || simd_length_squared(lastTarget - target) > 0
    if changed { lastPosition = camera.position; lastTarget = target }
    return changed
  }

  /// Exact placement (Explorer.place): flush damping, set target and camera along a unit direction.
  public mutating func place(_ camera: inout Camera, target: SIMD3<Double>, distance: Double, direction: SIMD3<Double>) {
    clearMomentum()
    self.target = target
    camera.position = target + direction * distance
    camera.lookAt(target)
    lastPosition = camera.position; lastTarget = target
  }
}
