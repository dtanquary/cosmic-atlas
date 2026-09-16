import Foundation

// Port of src/model-catalog.ts (manifest, profile decoding). The chunk cache arrives with the loader.

public let MODEL_LIMIT = 12

public struct NamedType: Codable, Sendable, Equatable { public var name: String, morphology: String, family: GalaxyFamily, source: String, node: String, row: Int, targetId: String }
public struct ModelNodeAsset: Codable, Sendable, Equatable { public var url: String, bytes: Int, decodedBytes: Int, sha256: String, maxRadiusMpc: Double
  public var asset: Asset { Asset(url: url, bytes: bytes, decodedBytes: decodedBytes, sha256: sha256) } }
public struct ModelManifest: Codable, Sendable {
  public struct LibraryEntry: Codable, Sendable { public var n: Double, weightedError: Double, gaussians: [Gaussian] }
  public struct Example: Codable, Sendable { public var id: Int, node: String, row: Int, targetId: String }
  public var version: Int, catalogId: String, catalogSourceSha256: String, count: Int, measuredShapes: Int, assumedShapes: Int, visualTypes: Int
  public var nodes: [String: ModelNodeAsset], namedTypes: [String: NamedType], library: [LibraryEntry], fallbackRadiusMpc: Double, unresolvedExample: Example

  /// Mirrors ModelCatalog.open: the sidecar must describe exactly the active catalog.
  public func validate(against catalog: Manifest) throws {
    guard version == 1, catalogId == catalog.id, catalogSourceSha256 == catalog.source.sha256, count == catalog.count, !library.isEmpty,
          catalog.nodes.allSatisfy({ nodes[$0.id] != nil }) else { throw AtlasError("Galaxy models do not match the active catalog") }
  }
}

/// One node's 20-byte profile rows (f32 radius arcsec, e1, e2, sersic; u32 flags).
public struct ProfileChunk: Sendable {
  public var buffer: Data
  public var used: TimeInterval
  public init(buffer: Data, used: TimeInterval = 0) { self.buffer = buffer; self.used = used }
  public var count: Int { (buffer.count - BINARY_HEADER_BYTES) / 20 }
  public func value(_ index: Int) -> Float { buffer.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: BINARY_HEADER_BYTES + index * 4, as: Float.self) } }
  public func flag(_ index: Int) -> UInt32 { buffer.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: BINARY_HEADER_BYTES + index * 4, as: UInt32.self) } }
  /// Bound pointers for hot loops: `values` are the five floats per row (the fifth reinterpreted as flags).
  public func withRows<T>(_ body: (_ values: UnsafePointer<Float>, _ flags: UnsafePointer<UInt32>) throws -> T) rethrows -> T {
    try buffer.withUnsafeBytes { raw in
      let base = raw.baseAddress!.advanced(by: BINARY_HEADER_BYTES)
      return try body(base.assumingMemoryBound(to: Float.self), base.assumingMemoryBound(to: UInt32.self))
    }
  }
  public mutating func setValue(_ v: Float, at index: Int) { withUnsafeBytes(of: v) { buffer.replaceSubrange((BINARY_HEADER_BYTES + index * 4)..<(BINARY_HEADER_BYTES + index * 4 + 4), with: $0) } }
}

let familyByCode: [UInt32: GalaxyFamily] = [1: .spiral, 2: .barred, 3: .elliptical, 4: .lenticular, 5: .irregular]
let profileTypes = ["Unknown", "PSF", "REX", "EXP", "DEV", "SER"]

@inline(__always) public func measuredShape(values: UnsafePointer<Float>, flags: UnsafePointer<UInt32>, row: Int) -> Bool {
  let p = row * 5, r = values[p], e1 = values[p + 1], e2 = values[p + 2], type = flags[p + 4] & 255
  return type >= 2 && type <= 5 && (r + e1 + e2).isFinite && r > 0 && hypot(Double(e1), Double(e2)) < 0.999
}
public func measuredShape(_ chunk: ProfileChunk, row: Int) -> Bool { chunk.withRows { measuredShape(values: $0, flags: $1, row: row) } }

public func decodeModel(_ manifest: ModelManifest, chunk: ProfileChunk, row: Int, galaxy: Galaxy) throws -> GalaxyDetailData {
  let count = try chunk.buffer.withUnsafeBytes { try validateBinary($0, kind: .profiles) }
  if row < 0 || row >= count { throw AtlasError("Invalid model reference") }
  let p = row * 5, flags = chunk.flag(p + 4), type = flags & 255, measured = measuredShape(chunk, row: row), named = manifest.namedTypes[String(galaxy.id)]
  let rawIndex = type == 4 ? 4.0 : type == 2 || type == 3 ? 1.0 : Double(chunk.value(p + 3))
  let index = measured && rawIndex.isFinite && rawIndex >= 0.5 ? rawIndex : 1
  let fit = manifest.library.dropFirst().reduce(manifest.library[0]) { best, item in abs(item.n - index) < abs(best.n - index) ? item : best }
  let known = familyByCode[(flags >> 8) & 255]
  // A light-profile fit is not a visual Hubble classification. These are labeled
  // display proxies, including disk-like arms; unresolved sizes are also assumed.
  let family: GalaxyFamily = known ?? (measured ? (index >= 2.5 ? .elliptical : type == 2 ? .lenticular : .spiral) : .elliptical)
  let seed = UInt32(truncatingIfNeeded: Int64(galaxy.id + 1) &* 2654435761), phase = Double(seed) / 4294967296 * .pi * 2
  let approximation = family == .spiral ? "Disk-like" : family == .lenticular ? "Smooth round" : "Spheroidal"
  let typeLabel = known != nil ? "\(familyLabels[family]!) · \(named?.morphology ?? "catalog type")" : measured ? "\(approximation) approximation" : "Unresolved shape · illustrative model"
  let spiral: GalaxyDetailData.Spiral? = family == .spiral || family == .barred
    ? .init(arms: 2 + ((seed >> 8) % 3 == 0 ? 1 : 0), pitchDegrees: Double(18 + seed % 12), phaseRadians: phase, seed: seed, bar: family == .barred) : nil
  let radiusArcsec: Double = measured ? Double(chunk.value(p)) : manifest.fallbackRadiusMpc / galaxy.distance * 180 * 3600 / .pi
  let e1: Double = measured ? Double(chunk.value(p + 1)) : 0
  let e2: Double = measured ? Double(chunk.value(p + 2)) : 0
  let profileType = Int(type) < profileTypes.count ? profileTypes[Int(type)] : "Unknown"
  let shape = GalaxyDetailData.Shape(radiusArcsec: radiusArcsec, e1: e1, e2: e2, sersic: index, profileType: profileType)
  let model = GalaxyDetailData.Model(family: family, typeSource: known != nil ? .catalog : .proxy, typeLabel: typeLabel, shapeMeasured: measured, sourceName: named?.source, profileIndex: fit.n)
  return GalaxyDetailData(catalogId: manifest.catalogId, catalogSourceSha256: manifest.catalogSourceSha256, name: named?.name ?? galaxy.targetId, galaxy: galaxy,
                          shape: shape, gaussians: fit.gaussians, fitMaxRelativeError: fit.weightedError, spiral: spiral, model: model, knotCount: 12000)
}
