import XCTest
import AtlasTestSupport
@testable import AtlasCore

/// Ports tests/galaxy-looks.test.ts, plus a guard that the Metal constants match lookDisc.
final class GalaxyLooksTests: XCTestCase {
  func testPutsEveryLooksSmoothDiscHalfLightRadiusAtTheAdoptedCatalogRadius() {
    let d = lookDisc, steps = 200000
    func smooth(_ a: Double, _ b: Double, _ x: Double) -> Double { let t = max(0, min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
    for (key, look) in galaxyLooks {
      let outer = d.fadeEnd * look.extent
      var total = 0.0, cumulative = [Double](); cumulative.reserveCapacity(steps)
      for i in 0..<steps { let r = (Double(i) + 0.5) / Double(steps) * outer; total += exp(-r / d.scale) * smooth(outer, d.fadeStart * look.extent, r) * r; cumulative.append(total) }
      let half = (Double(cumulative.firstIndex { $0 >= total / 2 }!) + 0.5) / Double(steps) * outer
      XCTAssertEqual(half / look.unitsPerRe, 1, accuracy: 5e-4, key.rawValue)
    }
  }
  func testKeepsTheMilkyWayBarLengthAngleAndHandednessFromTheSourcedReference() throws {
    let reference = try ReferenceData(directory: RepoPaths.file("src/data")).milkyWay, look = try XCTUnwrap(galaxyLooks[.milkyWay])
    XCTAssertEqual(look.bar, reference.barHalfLengthMpc / reference.radiusMpc * look.unitsPerRe, accuracy: 5e-5)
    XCTAssertEqual(look.phaseDegrees, 180 - reference.barAngleDeg)
    // milky-way-light winds its arms anticlockwise outward in the model frame; the look mirrors to match.
    XCTAssertEqual(look.spin, -1)
  }
  func testSeedsStructureFromTheExactPublicIdentityOnly() {
    XCTAssertEqual(lookSeed("39633325333155389"), lookSeed("39633325333155389"))
    XCTAssertNotEqual(lookSeed("39633325333155389"), lookSeed("39633325333155388"))
    for value in [lookSeed("nearby:m31").x, lookSeed("nearby:m31").y] { XCTAssertGreaterThanOrEqual(value, 0); XCTAssertLessThan(value, 100) }
  }
  func testMetalConstantsMatchTheDiscProfile() throws {
    let shader = try String(contentsOf: RepoPaths.file("native/Sources/AtlasRender/Shaders/Atlas.metal"), encoding: .utf8)
    XCTAssertTrue(shader.contains("SCALE = \(lookDisc.scale), FADE_START = \(lookDisc.fadeStart), FADE_END = \(lookDisc.fadeEnd),"))
  }
}
