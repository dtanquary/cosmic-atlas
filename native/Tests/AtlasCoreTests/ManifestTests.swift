import XCTest
import AtlasTestSupport
@testable import AtlasCore

/// The real release manifests must decode and pass the same gate as the web client.
final class ManifestTests: XCTestCase {
  func testFullCatalogManifestDecodes() throws {
    let manifest = try Manifest.decode(RepoPaths.data("public/data/dr1/manifest.json"))
    XCTAssertEqual(manifest.id, "dr1")
    XCTAssertEqual(manifest.count, 14_140_375)
    XCTAssertNil(manifest.subset)
    XCTAssertEqual(manifest.nodes.count, 1010)
    XCTAssertEqual(manifest.nodes.first?.id, manifest.root)
    XCTAssertEqual(manifest.nodes.first?.storedCount, 65536)
    XCTAssertEqual(manifest.nodes.first?.points.decodedBytes, 16 + 65536 * 16)
    XCTAssertEqual(manifest.nodes.first?.metadata.decodedBytes, 16 + 65536 * 56)
  }

  func testDevelopmentSubsetManifestDecodes() throws {
    let manifest = try Manifest.decode(RepoPaths.data("public/data/development/manifest.json"))
    XCTAssertEqual(manifest.count, 1_000_000)
    XCTAssertNotNil(manifest.subset)
  }

  func testGateRejectsWrongVersion() throws {
    var manifest = try Manifest.decode(RepoPaths.data("public/data/development/manifest.json"))
    manifest.version = 2
    XCTAssertThrowsError(try manifest.validate())
  }
}
