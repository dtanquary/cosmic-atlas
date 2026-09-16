import Foundation

// Port of src/survey-footprint.ts (data side): the 720×360 sky-occupancy grid and its validation.

// ponytail: fixed 0.5° grid; memoryBytes and the footprint checks assume 720×360.
public let FOOTPRINT_WIDTH = 720, FOOTPRINT_HEIGHT = 360

public struct SurveyFootprintData: Codable, Sendable {
  public var version: Int, catalogId: String, catalogSourceSha256: String, count: Int, width: Int, height: Int
  public var degreesPerCell: Double, maxCellCount: Int, occupiedCells: Int, cells: String, sources: [String], disclosure: String?
}

/// Rejects a sidecar that does not describe the active catalog; returns the uint8 grid (row 0 = Dec −90°, column 0 = RA 0°).
/// Subsets share the source hash and accepted count, so they keep the footprint.
public func decodeFootprint(_ data: SurveyFootprintData, sourceSha256: String, acceptedRows: Int) throws -> [UInt8] {
  if data.version != 1 || data.catalogSourceSha256 != sourceSha256 || data.count != acceptedRows { throw AtlasError("Survey footprint does not match this catalog.") }
  if data.width != FOOTPRINT_WIDTH || data.height != FOOTPRINT_HEIGHT { throw AtlasError("Unexpected survey footprint resolution.") }
  guard data.disclosure != nil else { throw AtlasError("Survey footprint disclosure missing.") }
  guard let cells = Data(base64Encoded: data.cells) else { throw AtlasError("Survey footprint grid is incomplete.") }
  if cells.count != data.width * data.height { throw AtlasError("Survey footprint grid is incomplete.") }
  return [UInt8](cells)
}

/// Texture coordinates of a unit sky direction, mirroring the fragment shader: u = RA/360° (wrapping), v = (Dec+90°)/180°.
public func footprintUv(_ n: SIMD3<Double>) -> (u: Double, v: Double) {
  let ra = atan2(n.y, n.x)
  return ((ra < 0 ? ra + 2 * .pi : ra) / (2 * .pi), (asin(max(-1, min(1, n.z))) + .pi / 2) / .pi)
}
