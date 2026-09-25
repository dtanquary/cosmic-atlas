import XCTest
import AtlasTestSupport
@testable import AtlasCore

/// Ports tests/galaxy-looks.test.ts, plus a guard that the Metal constants match lookDisc.
final class GalaxyLooksTests: XCTestCase {
  func testPutsTheSmoothDiscHalfLightRadiusAtTheAdoptedCatalogRadius() {
    let d = lookDisc, steps = 200000
    func smooth(_ a: Double, _ b: Double, _ x: Double) -> Double { let t = max(0, min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
    var total = 0.0, cumulative = [Double](); cumulative.reserveCapacity(steps)
    for i in 0..<steps { let r = (Double(i) + 0.5) / Double(steps) * d.fadeEnd; total += exp(-r / d.scale) * smooth(d.fadeEnd, d.fadeStart, r) * r; cumulative.append(total) }
    let half = (Double(cumulative.firstIndex { $0 >= total / 2 }!) + 0.5) / Double(steps) * d.fadeEnd
    XCTAssertEqual(half / d.unitsPerRe, 1, accuracy: 5e-4)
  }
  func testSeedsStructureFromTheExactPublicIdentityOnly() {
    XCTAssertEqual(lookSeed("39633325333155389"), lookSeed("39633325333155389"))
    XCTAssertNotEqual(lookSeed("39633325333155389"), lookSeed("39633325333155388"))
    for value in [lookSeed("nearby:m31").x, lookSeed("nearby:m31").y] { XCTAssertGreaterThanOrEqual(value, 0); XCTAssertLessThan(value, 100) }
  }
  func testMetalConstantsMatchTheDiscProfile() throws {
    let shader = try String(contentsOf: RepoPaths.file("native/Sources/AtlasRender/Shaders/Atlas.metal"), encoding: .utf8)
    XCTAssertTrue(shader.contains("S = \(lookDisc.unitsPerRe), SCALE = \(lookDisc.scale), FADE_START = \(lookDisc.fadeStart), FADE_END = \(lookDisc.fadeEnd);"))
  }
}
