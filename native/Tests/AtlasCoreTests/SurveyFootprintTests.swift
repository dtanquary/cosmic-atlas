import XCTest
import AtlasTestSupport
@testable import AtlasCore

// Port of tests/survey-footprint.test.ts.
final class SurveyFootprintTests: XCTestCase {
  static let footprint = try! JSONDecoder().decode(SurveyFootprintData.self, from: RepoPaths.data("public/data/survey-footprint.json"))
  static let manifest = try! Manifest.decode(RepoPaths.data("public/data/dr1/manifest.json"))
  static let cells = try! decodeFootprint(footprint, sourceSha256: manifest.source.sha256, acceptedRows: manifest.source.acceptedRows)
  func direction(_ raDeg: Double, _ decDeg: Double) -> SIMD3<Double> { let ra = raDeg * .pi / 180, dec = decDeg * .pi / 180; return [cos(dec) * cos(ra), cos(dec) * sin(ra), sin(dec)] }
  func cellAt(_ raDeg: Double, _ decDeg: Double) -> UInt8 { let (u, v) = footprintUv(direction(raDeg, decDeg)); return Self.cells[Int(v * Double(FOOTPRINT_HEIGHT)) * FOOTPRINT_WIDTH + Int(u * Double(FOOTPRINT_WIDTH))] }

  func testDecodesTheGridWithTheDensestCellAtRow182Column299() {
    XCTAssertEqual(Self.cells.count, FOOTPRINT_WIDTH * FOOTPRINT_HEIGHT)
    XCTAssertEqual(Self.cells[182 * FOOTPRINT_WIDTH + 299], 255)
    XCTAssertEqual(Self.cells.filter { $0 != 0 }.count, Self.footprint.occupiedCells)
    XCTAssertTrue(Self.footprint.sources.contains("https://data.desi.lbl.gov/doc/releases/dr1/"))
    XCTAssertTrue(Self.footprint.disclosure?.contains("not the official survey tiling") ?? false)
  }
  func testMapsSkyDirectionsToTheSidecarConvention() {
    XCTAssertEqual(cellAt(149.75, 1.25), 255)
    XCTAssertGreaterThan(cellAt(180.75, 30.25), 0)
    XCTAssertEqual(cellAt(60, -70), 0)
    let a = footprintUv([1, 0, 0]); XCTAssertEqual(a.u, 0); XCTAssertEqual(a.v, 0.5)
    XCTAssertEqual(footprintUv([0, -1, 0]).u, 0.75, accuracy: 1e-12)
    XCTAssertEqual(footprintUv([0, 0, 1]).v, 1)
  }
  func testRejectsOtherSourcesOrShapesWhileKeepingSubsets() {
    let f = Self.footprint, m = Self.manifest
    XCTAssertThrowsError(try decodeFootprint(f, sourceSha256: "0", acceptedRows: m.source.acceptedRows)) { XCTAssertTrue("\($0)".contains("does not match")) }
    var count = f; count.count = 1
    XCTAssertThrowsError(try decodeFootprint(count, sourceSha256: m.source.sha256, acceptedRows: m.source.acceptedRows)) { XCTAssertTrue("\($0)".contains("does not match")) }
    var version = f; version.version = 2
    XCTAssertThrowsError(try decodeFootprint(version, sourceSha256: m.source.sha256, acceptedRows: m.source.acceptedRows)) { XCTAssertTrue("\($0)".contains("does not match")) }
    var width = f; width.width = 360
    XCTAssertThrowsError(try decodeFootprint(width, sourceSha256: m.source.sha256, acceptedRows: m.source.acceptedRows)) { XCTAssertTrue("\($0)".contains("resolution")) }
    var short = f; short.cells = String(f.cells.dropFirst(4))
    XCTAssertThrowsError(try decodeFootprint(short, sourceSha256: m.source.sha256, acceptedRows: m.source.acceptedRows)) { XCTAssertTrue("\($0)".contains("incomplete")) }
    XCTAssertEqual(try decodeFootprint(f, sourceSha256: m.source.sha256, acceptedRows: m.source.acceptedRows).count, Self.cells.count)
  }
}
