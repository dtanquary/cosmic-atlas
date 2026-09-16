import XCTest
import simd
@testable import AtlasCore

// Port of tests/travel.test.ts (the "writes into out" case is value semantics in Swift).
final class TravelTests: XCTestCase {
  func pose(_ target: SIMD3<Double>, _ distance: Double, _ direction: SIMD3<Double>) -> Pose { Pose(target: target, distance: distance, direction: simd_normalize(direction)) }
  let samples = (0...10).map { Double($0) / 10 }
  func rel(_ a: Double, _ b: Double) -> Double { abs(a - b) / abs(b) }
  lazy var from = pose([1, 2, 3], 0.003, [1, 0, 0])
  lazy var to = pose([-4, 7, 9], 30000, [0, 0, 1])

  func testReproducesBothEndpointsExactly() {
    for (s, end) in [(0.0, from), (1.0, to)] {
      let p = interpolatePose(from: from, to: to, s)
      XCTAssertLessThan(simd_distance(p.target, end.target), 1e-12)
      XCTAssertLessThan(rel(p.distance, end.distance), 1e-12)
      XCTAssertLessThan(simd_distance(p.direction, end.direction), 1e-12)
    }
  }
  func testEasesTheTargetWithSmoothstepMonotonically() {
    let a = pose([0, 0, 0], 1, [0, 0, 1]), b = pose([1, 0, 0], 1, [0, 0, 1])
    let xs = samples.map { interpolatePose(from: a, to: b, $0).target.x }
    for i in 1..<xs.count { XCTAssertGreaterThan(xs[i], xs[i - 1]) }
    XCTAssertEqual(xs[5], 0.5, accuracy: 1e-12)
    XCTAssertEqual(interpolatePose(from: a, to: b, 0.25).target.x, 0.15625, accuracy: 1e-12)
  }
  func testInterpolatesDistanceInLogSpaceWhenTargetDoesNotMove() {
    let a = pose([5, 5, 5], 0.003, [0, 0, 1]), b = pose([5, 5, 5], 30000, [0, 0, 1])
    XCTAssertLessThan(rel(interpolatePose(from: a, to: b, 0.5).distance, (0.003 * 30000).squareRoot()), 1e-9)
  }
  func testHopsHighEnoughAtTheApex() {
    let a = pose([0, 0, 0], 0.01, [0, 0, 1]), b = pose([10, 0, 0], 0.01, [0, 0, 1])
    let apex = interpolatePose(from: a, to: b, 0.5)
    XCTAssertGreaterThanOrEqual(apex.distance, 5 / tan(25 * .pi / 180))
    XCTAssertLessThan(abs(apex.distance - 13.01), 1e-9)
    XCTAssertEqual(apex.target.x, 5, accuracy: 1e-12)
  }
  func testClampsSOutsideUnitRange() {
    XCTAssertEqual(simd_distance(interpolatePose(from: from, to: to, -0.5).target, from.target), 0)
    XCTAssertEqual(simd_distance(interpolatePose(from: from, to: to, 1.5).target, to.target), 0)
    XCTAssertLessThan(rel(interpolatePose(from: from, to: to, 7).distance, to.distance), 1e-12)
  }
  func testSlerpsAlongTheGreatCircleAtConstantAngularSpeed() {
    let a = pose([0, 0, 0], 1, [1, 0, 0]), b = pose([0, 0, 0], 1, [0, 1, 0])
    for s in samples {
      let p = interpolatePose(from: a, to: b, s), e = s * s * (3 - 2 * s)
      XCTAssertLessThan(abs(simd_length(p.direction) - 1), 1e-12)
      let angle = acos(max(-1, min(1, simd_dot(p.direction, a.direction))))
      XCTAssertLessThan(abs(angle - e * .pi / 2), 1e-12)
    }
    XCTAssertLessThan(simd_distance(interpolatePose(from: a, to: b, 0.5).direction, simd_normalize(SIMD3(1, 1, 0))), 1e-12)
  }
  func testHandlesAntiparallelDirections() {
    for axis in [SIMD3(0.0, 0, 1), [1, 0, 0], [0, 1, 0], [0.3, -0.4, 0.5]] {
      let a = pose([0, 0, 0], 1, axis), b = pose([0, 0, 0], 1, -axis)
      for s in samples { XCTAssertLessThan(abs(simd_length(interpolatePose(from: a, to: b, s).direction) - 1), 1e-12) }
      XCTAssertLessThan(simd_distance(interpolatePose(from: a, to: b, 1).direction, b.direction), 1e-12)
      XCTAssertLessThan(simd_dot(interpolatePose(from: a, to: b, 0.5).direction, a.direction), 1e-12)
    }
  }
}
