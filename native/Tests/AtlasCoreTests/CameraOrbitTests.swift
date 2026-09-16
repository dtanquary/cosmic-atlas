import XCTest
import simd
@testable import AtlasCore

final class CameraOrbitTests: XCTestCase {
  func testLookAtGivesThreeJsBasisWithZUp() {
    var camera = Camera(position: [0, -10, 0], target: .zero)
    XCTAssertEqual(simd_distance(camera.forward, [0, 1, 0]), 0, accuracy: 1e-12)
    XCTAssertEqual(simd_distance(camera.right, [1, 0, 0]), 0, accuracy: 1e-12)
    XCTAssertEqual(simd_distance(camera.cameraUp, [0, 0, 1]), 0, accuracy: 1e-12)
    camera.retuneNear(orbitDistance: 1e-5); XCTAssertEqual(camera.near, 1e-7, accuracy: 1e-20)
    camera.retuneNear(orbitDistance: 1000); XCTAssertEqual(camera.near, 1e-4)
  }
  func testReversedZProjectionMapsNearToOneAndFarToZero() {
    var camera = Camera(); camera.near = 0.01; camera.far = 100; camera.aspect = 1.5
    let p = camera.projection
    func depth(_ d: Float) -> Float { let c = p * SIMD4<Float>(0, 0, -d, 1); return c.z / c.w }
    XCTAssertEqual(depth(0.01), 1, accuracy: 1e-6)
    XCTAssertEqual(depth(100), 0, accuracy: 1e-6)
    XCTAssertGreaterThan(depth(1), depth(10))
    let f = 1 / tan(25 * Double.pi / 180)
    XCTAssertEqual(Double(p.columns.1.y), f, accuracy: 1e-6)
    XCTAssertEqual(Double(p.columns.0.x), f / 1.5, accuracy: 1e-6)
  }
  func testViewRotationInvertsOrientation() {
    let camera = Camera(position: [3, 4, 5], target: [0, 0, 0])
    let forwardView = camera.viewRotation * SIMD3<Float>(camera.forward)
    XCTAssertEqual(simd_distance(forwardView, [0, 0, -1]), 0, accuracy: 1e-5)
  }
  func testOrbitDampingConvergesAndKeepsDistance() {
    var camera = Camera(position: [0, -1, 0], target: .zero)
    var orbit = Orbit(); orbit.dampingFactor = 0.09
    orbit.rotate(deltaX: 100, deltaY: 0, viewportHeight: 1000)
    var frames = 0
    while orbit.update(&camera) && frames < 500 { frames += 1 }
    XCTAssertGreaterThan(frames, 10)
    XCTAssertEqual(simd_length(camera.position), 1, accuracy: 1e-9)
    XCTAssertEqual(camera.position.z, 0, accuracy: 1e-9)
    // A rightward drag turns the camera clockwise seen from +z; like three.js, redraws stop once a step falls under 1e-3 Mpc,
    // leaving about a percent of the damped delta unapplied.
    XCTAssertEqual(atan2(camera.position.x, -camera.position.y), -2 * .pi * 0.1, accuracy: 0.02)
    XCTAssertLessThan(frames, 500)
  }
  func testDollyClampsToMinimumDistance() {
    var camera = Camera(position: [0, 0, 2e-5], target: .zero)
    var orbit = Orbit(); orbit.enableDamping = false
    for _ in 0..<50 { orbit.dollyIn(orbit.zoomScale(delta: -100)); orbit.update(&camera) }
    XCTAssertEqual(simd_length(camera.position), 1e-5, accuracy: 1e-15)
    XCTAssertEqual(orbit.zoomScale(delta: 100), pow(0.95, 0.9), accuracy: 1e-12)
  }
  func testPanMovesTargetInScreenSpace() {
    var camera = Camera(position: [0, -10, 0], target: .zero)
    var orbit = Orbit(); orbit.enableDamping = false
    orbit.pan(deltaX: 100, deltaY: 0, camera: camera, viewportHeight: 1000)
    orbit.update(&camera)
    XCTAssertLessThan(orbit.target.x, 0) // dragging right moves the scene right, the target left
    XCTAssertEqual(orbit.target.x, -2 * 100 * 10 * camera.tanHalfFov / 1000, accuracy: 1e-12)
    XCTAssertEqual(orbit.target.y, 0, accuracy: 1e-12); XCTAssertEqual(orbit.target.z, 0, accuracy: 1e-12)
  }
  func testFlightRules() {
    XCTAssertEqual(Flight.adjustSpeed(1000, wheelDeltaY: 100), 1000 * exp(-0.2), accuracy: 1e-9)
    XCTAssertEqual(Flight.adjustSpeed(1e4, wheelDeltaY: -1000), 1e4)
    XCTAssertEqual(Flight.adjustSpeed(1e-6, wheelDeltaY: 1000), 1e-6)
    var camera = Camera(position: .zero, target: [0, 1, 0])
    Flight.look(&camera, movementX: 0, movementY: -10000)
    XCTAssertLessThanOrEqual(abs(camera.forward.z), 0.995)
    var target = SIMD3<Double>(0, 1, 0)
    camera = Camera(position: .zero, target: target)
    Flight.autoFly(&camera, target: &target, speed: 10, dt: 0.5)
    XCTAssertEqual(camera.position.y, 5, accuracy: 1e-12); XCTAssertEqual(target.y, 6, accuracy: 1e-12)
  }
  func testBudgets() {
    XCTAssertEqual(MemoryBudget(mode: .full, availableBytes: nil).limit, 1536 * MemoryBudget.mebibyte)
    XCTAssertEqual(MemoryBudget(mode: .adaptive, availableBytes: 12 * 1024 * MemoryBudget.mebibyte).limit, 768 * MemoryBudget.mebibyte)
    XCTAssertEqual(MemoryBudget(mode: .full, availableBytes: 1000 * MemoryBudget.mebibyte).limit, 450 * MemoryBudget.mebibyte)
    var tight = MemoryBudget(mode: .full, availableBytes: 100 * MemoryBudget.mebibyte)
    XCTAssertEqual(tight.limit, 256 * MemoryBudget.mebibyte)
    tight.didReceiveMemoryWarning(); XCTAssertEqual(tight.limit, 256 * MemoryBudget.mebibyte); XCTAssertEqual(tight.evictTarget(), 128 * MemoryBudget.mebibyte)
    var budget = AdaptiveBudget()
    for _ in 0..<120 { XCTAssertFalse(budget.record(mode: .adaptive, moving: true, pending: 0, p95: 30)) }
    XCTAssertTrue(budget.record(mode: .adaptive, moving: true, pending: 0, p95: 30)); XCTAssertEqual(budget.points, 800_000)
    for _ in 0..<121 { _ = budget.record(mode: .adaptive, moving: true, pending: 0, p95: 10) }
    XCTAssertEqual(budget.points, 880_000)
    XCTAssertFalse(budget.record(mode: .full, moving: true, pending: 0, p95: 10))
    var timings = FrameTimings(); for i in 0..<300 { timings.record(Double(i)) }
    XCTAssertEqual(timings.p95, 288); XCTAssertEqual(timings.mean, 179.5, accuracy: 1e-9)
  }
}
