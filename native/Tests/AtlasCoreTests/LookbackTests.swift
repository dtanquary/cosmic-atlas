import XCTest
import AtlasTestSupport
@testable import AtlasCore

// Port of tests/lookback.test.ts and tests/cosmic-scale.test.ts.
final class LookbackTests: XCTestCase {
  static let reference = try! ReferenceData(directory: RepoPaths.file("src/data"))
  let lookback = Lookback(reference)
  var table: LookbackReference.Table { Self.reference.lookback.table }
  var cmb: Double { Self.reference.cmbRadiusMpc }

  func testTableIsStrictlyMonotonic() {
    for i in 1..<table.redshift.count {
      XCTAssertGreaterThan(table.redshift[i], table.redshift[i - 1])
      XCTAssertGreaterThan(table.comovingMpc[i], table.comovingMpc[i - 1])
      XCTAssertGreaterThan(table.lookbackGyr[i], table.lookbackGyr[i - 1])
    }
    XCTAssertEqual(Self.reference.lookback.cosmology, "Planck18")
    XCTAssertLessThan(Self.reference.lookback.maxInterpolationErrorGyr, 0.01)
  }
  func testRoundTripsEveryRingWithinInterpolationError() {
    for ring in Self.reference.lookback.rings {
      XCTAssertLessThanOrEqual(abs(lookback.lookbackForDistance(ring.comovingMpc) - ring.lookbackGyr), Self.reference.lookback.maxInterpolationErrorGyr + 1e-6)
    }
  }
  func testUsesDistanceOverCBelowFirstRowAndClampsAtCMB() {
    let galacticCenterYears = lookback.lookbackForDistance(0.008122) * 1e9
    XCTAssertLessThan(abs(galacticCenterYears - 26500) / 26500, 0.01)
    XCTAssertEqual(lightTravelGyr(0.008122) * 1e9, galacticCenterYears, accuracy: 1e-6)
    let last = table.lookbackGyr.last!
    XCTAssertEqual(lookback.lookbackForDistance(cmb), last)
    XCTAssertEqual(lookback.lookbackForDistance(cmb * 3), last)
    XCTAssertTrue(lookback.lookbackForDistance(-1).isNaN)
    XCTAssertTrue(lookback.lookbackForDistance(.nan).isNaN)
  }
  func testFormatLookbackTiers() {
    XCTAssertEqual(formatLookback(0.0000265), "26,500 years")
    XCTAssertEqual(formatLookback(0.82), "820 million years")
    XCTAssertEqual(formatLookback(2.1), "2.1 billion years")
    XCTAssertEqual(formatLookback(13.7865), "13.8 billion years")
    XCTAssertEqual(formatLookback(0.005), "5 million years")
    XCTAssertEqual(formatLookback(0.0009), "900,000 years")
    XCTAssertEqual(formatLookback(.nan), "Unavailable")
  }
  func testChooseRingsKeepsAtMostEightAscendingRings() {
    let fov = 50.0, aspect = 1.6, height = 1000.0, tanHalf = tan(fov * .pi / 360)
    func pixels(_ angle: Double) -> Double { tan(angle) / tanHalf * height / 2 }
    for d in [50, 1000, 10000, cmb * 3] {
      let chosen = lookback.chooseRings(dOriginMpc: d, fovDeg: fov, aspect: aspect, heightPx: height)
      XCTAssertLessThanOrEqual(chosen.count, 8)
      for (i, ring) in chosen.enumerated() {
        XCTAssertLessThan(ring.comovingMpc, d)
        XCTAssertEqual(ring.angle, asin(ring.comovingMpc / d), accuracy: 1e-12)
        XCTAssertGreaterThanOrEqual(ring.angle, .pi / 180)
        XCTAssertLessThanOrEqual(ring.angle, atan(tanHalf * (1 + aspect * aspect).squareRoot()))
        if i > 0 { XCTAssertGreaterThan(ring.lookbackGyr, chosen[i - 1].lookbackGyr); XCTAssertGreaterThanOrEqual(pixels(ring.angle) - pixels(chosen[i - 1].angle), 28) }
      }
    }
    XCTAssertGreaterThan(lookback.chooseRings(dOriginMpc: 10000, fovDeg: fov, aspect: aspect, heightPx: height).count, 0)
    XCTAssertEqual(lookback.chooseRings(dOriginMpc: 1e-5, fovDeg: fov, aspect: aspect, heightPx: height), [])
    XCTAssertEqual(lookback.chooseRings(dOriginMpc: 0, fovDeg: fov, aspect: aspect, heightPx: height), [])
    XCTAssertEqual(lookback.chooseRings(dOriginMpc: .nan, fovDeg: fov, aspect: aspect, heightPx: height), [])
    XCTAssertEqual(lookback.chooseRings(dOriginMpc: 30000, fovDeg: fov, aspect: aspect, heightPx: 120).map(\.lookbackGyr), [9, 13.5])
    XCTAssertEqual(lookback.chooseRings(dOriginMpc: 16664, fovDeg: fov, aspect: aspect, heightPx: height).map(\.lookbackGyr), [7, 8, 9, 10, 11, 12, 13, 13.5])
  }
  func testCMBScaleReference() {
    XCTAssertEqual(cmb * MLY_PER_MPC / 1000, 45.28, accuracy: 0.05)
    XCTAssertEqual(Self.reference.cosmicHorizon.lookbackGyr, 13.79, accuracy: 0.005)
    XCTAssertGreaterThan(Self.reference.cosmicHorizon.ageAtEmissionYears, 360000)
    XCTAssertLessThan(Self.reference.cosmicHorizon.ageAtEmissionYears, 390000)
    XCTAssertEqual(Self.reference.cosmicHorizon.cosmology, "Planck18")
    XCTAssertEqual(catalogRadialReach(4830.888927, cmbRadiusMpc: cmb)!, 0.34794, accuracy: 5e-5)
    XCTAssertEqual(catalogRadialReach(0, cmbRadiusMpc: cmb), 0)
    XCTAssertEqual(catalogRadialReach(cmb * 2, cmbRadiusMpc: cmb), 2)
    XCTAssertNil(catalogRadialReach(.nan, cmbRadiusMpc: cmb))
    XCTAssertNil(catalogRadialReach(-1, cmbRadiusMpc: cmb))
  }
}
