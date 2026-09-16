import Foundation
import simd

// Port of src/types.ts and the manifest gate in Explorer.load (src/explorer.ts).

public struct Asset: Codable, Sendable, Equatable {
  public var url: String, bytes: Int, decodedBytes: Int, sha256: String
  public init(url: String, bytes: Int, decodedBytes: Int, sha256: String) { self.url = url; self.bytes = bytes; self.decodedBytes = decodedBytes; self.sha256 = sha256 }
}

/// One octree node. `center`, `min`, `max` are float64 Mpc; stored point offsets are float32 relative to `center`.
public struct CatalogNode: Codable, Sendable, Equatable {
  public var id: String, count: Int, storedCount: Int
  public var center: SIMD3<Double>, min: SIMD3<Double>, max: SIMD3<Double>
  public var children: [String], points: Asset, metadata: Asset
  public init(id: String, count: Int, storedCount: Int, center: SIMD3<Double>, min: SIMD3<Double>, max: SIMD3<Double>, children: [String], points: Asset, metadata: Asset) {
    self.id = id; self.count = count; self.storedCount = storedCount; self.center = center; self.min = min; self.max = max; self.children = children; self.points = points; self.metadata = metadata
  }
}

public struct Manifest: Codable, Sendable {
  public struct Source: Codable, Sendable { public var url: String, sha256: String, acceptedRows: Int, examinedRows: Int, sourceRows: Int, maxDistanceInterpolationErrorMpc: Double }
  public struct Cosmology: Codable, Sendable { public var name: String, H0: Double, Om0: Double }
  public var version: Int, id: String, title: String, count: Int, subset: String?
  public var root: String, nodes: [CatalogNode], units: String, coordinateSystem: String
  public var source: Source, maxDistanceMpc: Double, maxRedshift: Double, totalCompressedBytes: Int
  public var cosmology: Cosmology, filters: [String]

  public static func decode(_ data: Data) throws -> Manifest {
    let manifest = try JSONDecoder().decode(Manifest.self, from: data)
    try manifest.validate()
    return manifest
  }
  /// Mirrors src/explorer.ts load(): version 1, count in [1, 0xfffffffe], at most 65534 nodes (65535 is the nearby pick namespace), storedCount in [1, 65536].
  public func validate() throws {
    guard version == 1, count >= 1, count <= 0xfffffffe, nodes.count <= 65534, !nodes.isEmpty,
          nodes.allSatisfy({ $0.storedCount >= 1 && $0.storedCount <= MAX_CHUNK_ROWS }),
          nodes.contains(where: { $0.id == root }) else { throw AtlasError("Unsupported catalog manifest") }
  }
  public var nodesById: [String: CatalogNode] { Dictionary(uniqueKeysWithValues: nodes.map { ($0.id, $0) }) }
}
