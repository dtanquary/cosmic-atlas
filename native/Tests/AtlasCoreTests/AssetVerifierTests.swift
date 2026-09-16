import XCTest
import AtlasTestSupport
@testable import AtlasCore

/// Every development-subset chunk must pass the worker's verification order against its manifest entry.
final class AssetVerifierTests: XCTestCase {
  static let manifest = try! Manifest.decode(RepoPaths.data("public/data/development/manifest.json"))
  static let models = try! JSONDecoder().decode(ModelManifest.self, from: RepoPaths.data("public/data/models/manifest.json"))

  func testEveryDevelopmentChunkDecodesAndVerifies() throws {
    guard RepoPaths.exists("public/data/development/0.points.bin") else { throw XCTSkip("Development chunks not present locally") }
    var rows = 0
    for node in Self.manifest.nodes {
      let points = try AssetVerifier.verify(compressed: try RepoPaths.data("public/data/development/\(node.points.url)"), asset: node.points, kind: .points, count: node.storedCount)
      let meta = try AssetVerifier.verify(compressed: try RepoPaths.data("public/data/development/\(node.metadata.url)"), asset: node.metadata, kind: .metadata, count: node.storedCount)
      // Ids are dense and below the catalog count; rows align with metadata.
      try points.withUnsafeBytes { raw in
        let ids = raw.bindMemory(to: UInt32.self)[(BINARY_HEADER_BYTES + node.storedCount * 12) / 4 ..< (BINARY_HEADER_BYTES + node.storedCount * 16) / 4]
        XCTAssertTrue(ids.allSatisfy { Int($0) < Self.manifest.count })
        let galaxy = try decodeGalaxy(meta, row: 0, id: Int(ids.first!))
        XCTAssertGreaterThan(galaxy.distance, 0)
      }
      rows += node.storedCount
    }
    XCTAssertGreaterThan(rows, 1_000_000)
  }

  func testRejectsTamperedBytesInWorkerOrder() throws {
    guard RepoPaths.exists("public/data/development/0.points.bin") else { throw XCTSkip("Development chunks not present locally") }
    let node = Self.manifest.nodes[0]
    let data = try RepoPaths.data("public/data/development/\(node.points.url)")
    XCTAssertThrowsError(try AssetVerifier.verify(compressed: data.dropLast(), asset: node.points, kind: .points, count: node.storedCount)) { XCTAssertEqual($0 as? AtlasError, AtlasError("Incomplete data download")) }
    var flipped = data; flipped[flipped.count / 2] ^= 0xff
    XCTAssertThrowsError(try AssetVerifier.verify(compressed: flipped, asset: node.points, kind: .points, count: node.storedCount)) { XCTAssertEqual($0 as? AtlasError, AtlasError("Data integrity check failed")) }
    var wrongKind = node.points; wrongKind.sha256 = AssetVerifier.sha256Hex(data)
    XCTAssertThrowsError(try AssetVerifier.verify(compressed: data, asset: wrongKind, kind: .metadata, count: node.storedCount)) { XCTAssertEqual($0 as? AtlasError, AtlasError("Unsupported data format")) }
    XCTAssertThrowsError(try AssetVerifier.verify(compressed: data, asset: node.points, kind: .points, count: node.storedCount + 1)) { XCTAssertEqual($0 as? AtlasError, AtlasError("Data length does not match manifest")) }
  }

  func testGunzipRoundTripAndTrailerCheck() throws {
    guard RepoPaths.exists("public/data/development/0.points.bin") else { throw XCTSkip("Development chunks not present locally") }
    let node = Self.manifest.nodes[0]
    let data = try RepoPaths.data("public/data/development/\(node.points.url)")
    XCTAssertEqual(try Gunzip.inflate(data, expectedBytes: node.points.decodedBytes).count, node.points.decodedBytes)
    XCTAssertThrowsError(try Gunzip.inflate(data, expectedBytes: node.points.decodedBytes - 1))
    XCTAssertThrowsError(try Gunzip.inflate(Data([0x1f, 0x8b]), expectedBytes: 16))
  }

  func testReleaseUrlsResolveLikeTheWebClient() throws {
    let origin = URL(string: "https://example.org/")!
    let release = try CatalogRelease.resolve(catalogJSON: Data(#"{"manifest":"/data/releases/48847989b1a244ba85a7/dr1/manifest.json"}"#.utf8), origin: origin)
    XCTAssertEqual(release.manifestURL.absoluteString, "https://example.org/data/releases/48847989b1a244ba85a7/dr1/manifest.json")
    XCTAssertEqual(release.nodeURL("0.points.bin").absoluteString, "https://example.org/data/releases/48847989b1a244ba85a7/dr1/0.points.bin")
    XCTAssertEqual(release.catalogAsset("models/manifest.json").absoluteString, "https://example.org/data/releases/48847989b1a244ba85a7/models/manifest.json")
    XCTAssertEqual(release.catalogAsset("galaxy-search.json").absoluteString, "https://example.org/data/releases/48847989b1a244ba85a7/galaxy-search.json")
  }
}
