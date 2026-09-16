import Foundation
import simd

// Port of src/format.ts.

public let MLY_PER_MPC = 3.2615637771674333
public enum Units: String, Sendable { case ly, mpc = "Mpc" }

/// `toLocaleString('en-US', {maximumSignificantDigits: n})`.
public func significant(_ value: Double, _ digits: Int) -> String {
  let formatter = NumberFormatter()
  formatter.locale = Locale(identifier: "en_US")
  formatter.numberStyle = .decimal
  formatter.usesSignificantDigits = true
  formatter.maximumSignificantDigits = digits
  return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
}

public func formatDistance(_ mpc: Double, units: Units = .ly, precision: Int = 3) -> String {
  if !mpc.isFinite || mpc < 0 { return "Unavailable" }
  if units == .mpc { return "\(significant(mpc, precision)) Mpc" }
  let ly = mpc * MLY_PER_MPC * 1e6
  let (scale, label): (Double, String) = ly >= 1e9 ? (1e9, "billion ly") : ly >= 1e6 ? (1e6, "million ly") : ly >= 1e3 ? (1e3, "thousand ly") : (1, "ly")
  return "\(significant(ly / scale, precision)) \(label)"
}

/// Equatorial right-handed axes; RA/Dec in degrees, distance in Mpc.
public func cartesian(ra: Double, dec: Double, distance: Double) -> SIMD3<Double> {
  let a = ra * .pi / 180, d = dec * .pi / 180
  return SIMD3(distance * cos(d) * cos(a), distance * cos(d) * sin(a), distance * sin(d))
}

public func separation(_ a: SIMD3<Double>, _ b: SIMD3<Double>) -> Double { simd_length(a - b) }

public enum BinaryKind: Sendable {
  case points, metadata, profiles
  public var magic: UInt32 { switch self { case .points: 0x43415431; case .metadata: 0x43414D31; case .profiles: 0x43415331 } }
  public var rowBytes: Int { switch self { case .points: 16; case .metadata: 56; case .profiles: 20 } }
}
public let BINARY_HEADER_BYTES = 16
public let MAX_CHUNK_ROWS = 65536

/// Header check shared by every chunk kind; returns the row count.
@discardableResult
public func validateBinary(_ buffer: UnsafeRawBufferPointer, kind: BinaryKind, expectedCount: Int? = nil) throws -> Int {
  if buffer.count < BINARY_HEADER_BYTES { throw AtlasError("Truncated data header") }
  let magic = buffer.loadUnaligned(fromByteOffset: 0, as: UInt32.self)
  let version = buffer.loadUnaligned(fromByteOffset: 4, as: UInt32.self)
  let count = Int(buffer.loadUnaligned(fromByteOffset: 8, as: UInt32.self))
  if magic != kind.magic || version != 1 { throw AtlasError("Unsupported data format") }
  if count > MAX_CHUNK_ROWS || (expectedCount != nil && count != expectedCount!) || buffer.count != BINARY_HEADER_BYTES + count * kind.rowBytes {
    throw AtlasError("Data length does not match manifest")
  }
  return count
}
public func validateBinary(_ data: Data, kind: BinaryKind, expectedCount: Int? = nil) throws -> Int {
  try data.withUnsafeBytes { try validateBinary($0, kind: kind, expectedCount: expectedCount) }
}

public struct NearbyInfo: Sendable, Equatable {
  public var key: String, name: String, aliases: [String], method: String, distanceError: String, distanceSource: String, shapeNote: String, shapeSources: [String], orientationMeasured: Bool
  public init(key: String, name: String, aliases: [String], method: String, distanceError: String, distanceSource: String, shapeNote: String, shapeSources: [String], orientationMeasured: Bool) {
    self.key = key; self.name = name; self.aliases = aliases; self.method = method; self.distanceError = distanceError; self.distanceSource = distanceSource; self.shapeNote = shapeNote; self.shapeSources = shapeSources; self.orientationMeasured = orientationMeasured
  }
}

/// A catalog record. `targetId` keeps the exact 64-bit DESI identifier as text; negative `id`s belong to the nearby layer.
public struct Galaxy: Sendable, Equatable {
  public var id: Int, targetId: String, ra: Double, dec: Double, z: Double?, zerr: Double?, distance: Double, delta: Double?, position: SIMD3<Double>
  public var nearby: NearbyInfo?
  public init(id: Int, targetId: String, ra: Double, dec: Double, z: Double?, zerr: Double?, distance: Double, delta: Double?, position: SIMD3<Double>, nearby: NearbyInfo? = nil) {
    self.id = id; self.targetId = targetId; self.ra = ra; self.dec = dec; self.z = z; self.zerr = zerr; self.distance = distance; self.delta = delta; self.position = position; self.nearby = nearby
  }
}

/// 56-byte metadata row: int64 targetId, f64 ra, dec, z, zerr, distance, deltachi2.
public func decodeGalaxy(_ buffer: UnsafeRawBufferPointer, row: Int, id: Int) throws -> Galaxy {
  let count = try validateBinary(buffer, kind: .metadata)
  if row < 0 || row >= count { throw AtlasError("Invalid object reference") }
  let p = BINARY_HEADER_BYTES + row * 56
  let ra = buffer.loadUnaligned(fromByteOffset: p + 8, as: Double.self)
  let dec = buffer.loadUnaligned(fromByteOffset: p + 16, as: Double.self)
  let z = buffer.loadUnaligned(fromByteOffset: p + 24, as: Double.self)
  let distance = buffer.loadUnaligned(fromByteOffset: p + 40, as: Double.self)
  if !(ra + dec + z + distance).isFinite || distance <= 0 { throw AtlasError("Invalid galaxy measurements") }
  return Galaxy(
    id: id, targetId: String(buffer.loadUnaligned(fromByteOffset: p, as: Int64.self)), ra: ra, dec: dec, z: z,
    zerr: buffer.loadUnaligned(fromByteOffset: p + 32, as: Double.self), distance: distance,
    delta: buffer.loadUnaligned(fromByteOffset: p + 48, as: Double.self), position: cartesian(ra: ra, dec: dec, distance: distance))
}
public func decodeGalaxy(_ data: Data, row: Int, id: Int) throws -> Galaxy {
  try data.withUnsafeBytes { try decodeGalaxy($0, row: row, id: id) }
}

public func niceScale(_ maximum: Double) -> Double {
  if !maximum.isFinite || maximum <= 0 { return 1 }
  let power = pow(10, floor(log10(maximum)))
  return ([5.0, 2, 1].first { $0 * power <= maximum } ?? 1) * power
}
