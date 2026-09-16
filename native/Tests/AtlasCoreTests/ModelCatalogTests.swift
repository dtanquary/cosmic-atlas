import XCTest
import AtlasTestSupport
@testable import AtlasCore

// Port of tests/model-catalog.test.ts (decoding; the ResolvedGalaxy frame and irregular clumps port with the volume geometry).
final class ModelCatalogTests: XCTestCase {
  static let manifest = try! JSONDecoder().decode(ModelManifest.self, from: RepoPaths.data("public/data/models/manifest.json"))
  static let original = try! JSONDecoder().decode(GalaxyDetailData.self, from: RepoPaths.data("public/data/galaxy-spiral.json"))
  var galaxy: Galaxy { Self.original.galaxy }

  func chunk(_ type: UInt32, family: UInt32 = 0, e1: Float = 0.4) -> ProfileChunk {
    var data = Data(count: 36)
    func put<T>(_ value: T, at offset: Int) { withUnsafeBytes(of: value) { data.replaceSubrange(offset..<offset + $0.count, with: $0) } }
    put(UInt32(0x43415331), at: 0); put(UInt32(1), at: 4); put(UInt32(1), at: 8)
    for (i, value) in [Float(20), e1, 0.1, 1.4].enumerated() { put(value, at: 16 + i * 4) }
    put(type | (family << 8), at: 32)
    return ProfileChunk(buffer: data)
  }

  func testImagingFitIsNotAVisualClassification() throws {
    let disk = try decodeModel(Self.manifest, chunk: chunk(3), row: 0, galaxy: galaxy), round = try decodeModel(Self.manifest, chunk: chunk(2), row: 0, galaxy: galaxy), spheroid = try decodeModel(Self.manifest, chunk: chunk(4), row: 0, galaxy: galaxy)
    for model in [disk, round, spheroid] { XCTAssertEqual(model.model?.typeSource, .proxy); XCTAssertEqual(model.model?.shapeMeasured, true) }
    XCTAssertEqual(disk.model?.family, .spiral); XCTAssertEqual(round.model?.family, .lenticular); XCTAssertEqual(spheroid.model?.family, .elliptical)
    XCTAssertEqual(galaxyRadius(distanceMpc: disk.galaxy.distance, radiusArcsec: disk.shape.radiusArcsec), galaxyRadius(distanceMpc: Self.original.galaxy.distance, radiusArcsec: 20), accuracy: 1e-12)
  }
  func testExplicitVisualClassificationWins() throws {
    for (i, family) in [GalaxyFamily.spiral, .barred, .elliptical, .lenticular, .irregular].enumerated() {
      let data = try decodeModel(Self.manifest, chunk: chunk(4, family: UInt32(i + 1), e1: 0.85), row: 0, galaxy: galaxy)
      XCTAssertEqual(data.model?.family, family); XCTAssertEqual(data.model?.typeSource, .catalog)
    }
  }
  func testMarksUnresolvedSizesAndOrientationAsAssumptions() throws {
    let data = try decodeModel(Self.manifest, chunk: chunk(1), row: 0, galaxy: galaxy)
    XCTAssertEqual(data.model?.shapeMeasured, false); XCTAssertEqual(data.model?.typeSource, .proxy); XCTAssertEqual(data.shape.e1, 0); XCTAssertEqual(data.shape.e2, 0)
    XCTAssertEqual(galaxyRadius(distanceMpc: data.galaxy.distance, radiusArcsec: data.shape.radiusArcsec), 0.005, accuracy: 1e-12)
    var invalid = chunk(5); invalid.setValue(.nan, at: 0)
    XCTAssertEqual(try decodeModel(Self.manifest, chunk: invalid, row: 0, galaxy: galaxy).model?.shapeMeasured, false)
  }
  func testRejectsIncorrectProfileFormatsAndRowReferences() throws {
    let profiles = chunk(5)
    XCTAssertEqual(try validateBinary(profiles.buffer, kind: .profiles, expectedCount: 1), 1)
    XCTAssertThrowsError(try validateBinary(profiles.buffer, kind: .metadata, expectedCount: 1))
    XCTAssertThrowsError(try decodeModel(Self.manifest, chunk: profiles, row: 1, galaxy: galaxy))
    XCTAssertThrowsError(try validateBinary(profiles.buffer.prefix(35), kind: .profiles, expectedCount: 1))
  }
  func testManifestGateMatchesTheActiveCatalog() throws {
    let catalog = try Manifest.decode(RepoPaths.data("public/data/dr1/manifest.json"))
    XCTAssertNoThrow(try Self.manifest.validate(against: catalog))
    var other = catalog; other.count += 1
    XCTAssertThrowsError(try Self.manifest.validate(against: other))
  }
}
