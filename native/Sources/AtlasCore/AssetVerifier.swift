import Foundation
import CryptoKit

/// The data worker's checks, in the same order with the same messages (src/data.worker.ts).
public enum AssetVerifier {
  public static func sha256Hex(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

  public static func verify(compressed: Data, asset: Asset, kind: BinaryKind, count: Int) throws -> Data {
    if compressed.count != asset.bytes { throw AtlasError("Incomplete data download") }
    if sha256Hex(compressed) != asset.sha256 { throw AtlasError("Data integrity check failed") }
    let buffer = try Gunzip.inflate(compressed, expectedBytes: asset.decodedBytes)
    try validateBinary(buffer, kind: kind, expectedCount: count)
    if buffer.count != asset.decodedBytes { throw AtlasError("Unexpected decoded size") }
    return buffer
  }
}

/// Resolves release URLs the way the web client does: node assets relative to the manifest directory, sidecars one level up.
public struct CatalogRelease: Sendable, Equatable {
  public let manifestURL: URL
  public init(manifestURL: URL) { self.manifestURL = manifestURL }
  /// `/data/catalog.json` → `{"manifest": "/data/releases/<id>/dr1/manifest.json"}` relative to the origin.
  public static func resolve(catalogJSON: Data, origin: URL) throws -> CatalogRelease {
    struct Index: Decodable { var manifest: String }
    let index = try JSONDecoder().decode(Index.self, from: catalogJSON)
    guard let url = URL(string: index.manifest, relativeTo: origin)?.absoluteURL else { throw AtlasError("The catalog index could not be opened.") }
    return CatalogRelease(manifestURL: url)
  }
  public var base: URL { manifestURL.deletingLastPathComponent() }
  public func nodeURL(_ path: String) -> URL { URL(string: path, relativeTo: base)!.absoluteURL }
  public func catalogAsset(_ path: String) -> URL { URL(string: "../" + path, relativeTo: base)!.standardized.absoluteURL }
}
