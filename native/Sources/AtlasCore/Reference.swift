import Foundation
import simd

// Codable views of the bundled reference JSON in src/data. The app passes its bundle's `data/` directory,
// tests pass the repository's `src/data`; nothing is duplicated in git.

public struct Gaussian: Codable, Sendable, Equatable { public var sigmaRe: Double, peak: Double }

public struct LookbackReference: Codable, Sendable {
  public struct Ring: Codable, Sendable { public var lookbackGyr: Double, redshift: Double, comovingMpc: Double }
  public struct Table: Codable, Sendable { public var redshift: [Double], comovingMpc: [Double], lookbackGyr: [Double] }
  public var version: Int, cosmology: String, rings: [Ring], table: Table, maxInterpolationErrorGyr: Double, disclosure: String
}

public struct CosmicHorizonReference: Codable, Sendable {
  public var version: Int, cosmology: String, lastScatteringRedshift: Double, radiusMpc: Double, lookbackGyr: Double, ageAtEmissionYears: Double, disclosure: String
}

public struct MilkyWayReference: Codable, Sendable {
  public var version: Int, name: String, frame: String, centerMpc: SIMD3<Double>, axes: [[Double]]
  public var centerRaDeg: Double, centerDecDeg: Double, observerDistanceMpc: Double, solarHeightMpc: Double, diskScaleMpc: Double
  public var radiusMpc: Double, barHalfLengthMpc: Double, barAngleDeg: Double, assumptions: String
  public var sources: [String: String]
}

public struct NearbyReference: Codable, Sendable {
  public struct Source: Codable, Sendable { public var title: String, compilation: String, license: String, excerptSha256: String }
  public struct Entry: Codable, Sendable {
    public var key: String, name: String, aliases: [String], distanceError: String, method: String, distanceSource: String
    public var family: String, typeLabel: String, shapeMeasured: Bool, orientationMeasured: Bool, shapeNote: String, shapeSources: [String]
    public var id: Int, raDeg: Double, decDeg: Double, distanceMpc: Double, radiusArcsec: Double, e1: Double, e2: Double
    public var sersic: Double, gaussians: [Gaussian], profileFitMaxRelativeError: Double
  }
  public var version: Int, source: Source, entries: [Entry]
}

public enum StopKind: String, Codable, Sendable { case sun, core, localgroup, overview, cmb, nearby, catalog, cluster, view }

public struct TourTarget: Codable, Sendable, Equatable {
  public var kind: StopKind, key: String?, name: String?, positionMpc: [Double]?, view: ViewState?
  public init(kind: StopKind, key: String? = nil, name: String? = nil, positionMpc: [Double]? = nil, view: ViewState? = nil) {
    self.kind = kind; self.key = key; self.name = name; self.positionMpc = positionMpc; self.view = view
  }
}

/// `cites` names the nearby galaxy whose distance the caption quotes when it is not the target; `{catalogCount}` in a caption is filled from the active manifest.
public struct TourStop: Codable, Sendable, Equatable {
  public struct SourceStop: Codable, Sendable, Equatable { public var route: String, id: String; public init(route: String, id: String) { self.route = route; self.id = id } }
  /// Stable within a route; titles and array ordering are presentation choices.
  public var id: String, cue: String, context: String?, note: String?, sourceStop: SourceStop?, title: String, caption: String, target: TourTarget
  public var distanceMpc: Double?, cites: String?, dwellSeconds: Double?, travelSeconds: Double
  public init(id: String, cue: String, context: String? = nil, note: String? = nil, sourceStop: SourceStop? = nil, title: String, caption: String, target: TourTarget, distanceMpc: Double? = nil, cites: String? = nil, dwellSeconds: Double? = nil, travelSeconds: Double) {
    self.id = id; self.cue = cue; self.context = context; self.note = note; self.sourceStop = sourceStop; self.title = title; self.caption = caption; self.target = target; self.distanceMpc = distanceMpc; self.cites = cites; self.dwellSeconds = dwellSeconds; self.travelSeconds = travelSeconds
  }
}

public struct TourData: Codable, Sendable, Equatable {
  public var key: String, title: String, summary: String, stops: [TourStop]
  public init(key: String, title: String, summary: String, stops: [TourStop]) { self.key = key; self.title = title; self.summary = summary; self.stops = stops }
}
public struct ToursFile: Codable, Sendable { public var version: Int, tours: [TourData] }

public struct Photograph: Codable, Sendable, Equatable {
  public struct Match: Codable, Sendable, Equatable { public var raDeg: Double, decDeg: Double, fits: String, projection: [String], cdDegPerPixel: [Double], referencePixel: [Double] }
  public var key: String, identity: String, title: String, source: String, download: String, credit: String, license: String, rights: String, note: String
  public var fovArcmin: [Double]?, northClockwiseDeg: Double?, asset: String, bytes: Int, sha256: String, width: Int, height: Int, match: Match?
}
public struct PhotosFile: Codable, Sendable { public var version: Int, verified: String, maxEncodedBytes: Int, maxDecodedBytes: Int, photos: [Photograph] }

/// Every bundled reference file, decoded once.
public struct ReferenceData: Sendable {
  public var lookback: LookbackReference, cosmicHorizon: CosmicHorizonReference, milkyWay: MilkyWayReference
  public var nearby: NearbyReference, tours: [TourData], photos: PhotosFile
  public var cmbRadiusMpc: Double { cosmicHorizon.radiusMpc }

  public init(directory: URL) throws {
    func load<T: Decodable>(_ name: String) throws -> T {
      try JSONDecoder().decode(T.self, from: Data(contentsOf: directory.appendingPathComponent("\(name).json")))
    }
    lookback = try load("lookback"); cosmicHorizon = try load("cosmic-horizon"); milkyWay = try load("milky-way")
    nearby = try load("nearby-galaxies"); tours = (try load("tours") as ToursFile).tours; photos = try load("photos")
  }
}

// ViewState/ViewIdentity in JSON keep the web's shape: identity is a string, a {node,row,targetId} object, or null.
extension ViewIdentity: Codable {
  struct Desi: Codable { var node: String; var row: Int; var targetId: String }
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if let text = try? container.decode(String.self), let parsed = ViewIdentity(text) { self = parsed; return }
    let d = try container.decode(Desi.self)
    self = .desi(node: d.node, row: d.row, targetId: d.targetId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    if case .desi(let node, let row, let targetId) = self { try container.encode(Desi(node: node, row: row, targetId: targetId)) } else { try container.encode(text) }
  }
}
extension ViewState: Codable {
  enum Keys: String, CodingKey { case target, camera, identity }
  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: Keys.self)
    let t = try c.decode([Double].self, forKey: .target), cam = try c.decode([Double].self, forKey: .camera)
    guard t.count == 3, cam.count == 3 else { throw AtlasError("Invalid view state") }
    target = SIMD3(t[0], t[1], t[2]); camera = SIMD3(cam[0], cam[1], cam[2])
    identity = try c.decodeIfPresent(ViewIdentity.self, forKey: .identity)
  }
  public func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: Keys.self)
    try c.encode([target.x, target.y, target.z], forKey: .target); try c.encode([camera.x, camera.y, camera.z], forKey: .camera)
    if let identity { try c.encode(identity, forKey: .identity) } else { try c.encodeNil(forKey: .identity) }
  }
}
