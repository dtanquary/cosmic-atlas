import Foundation

// Types from src/galaxy-detail.ts. The rendering geometry (ResolvedGalaxy, spiral/irregular samples) ports with the Metal volume passes.

public enum GalaxyFamily: String, Codable, Sendable { case spiral, barred, elliptical, lenticular, irregular }
public enum GalaxyAppearance: String, Codable, Sendable { case spiral, catalog }
public enum ModelDisplay: String, Codable, Sendable { case automatic, focused, points }
public enum MagellanicCloudKind: String, Codable, Sendable { case lmc, smc }

public let familyLabels: [GalaxyFamily: String] = [.spiral: "Spiral", .barred: "Barred spiral", .elliptical: "Elliptical", .lenticular: "Lenticular", .irregular: "Irregular"]

/// Physical half-light radius in Mpc from an angular radius in arcseconds at a comoving distance.
public func galaxyRadius(distanceMpc: Double, radiusArcsec: Double) -> Double { radiusArcsec * distanceMpc * .pi / 648000 }

public struct GalaxyDetailData: Codable, Sendable, Equatable {
  public struct Shape: Codable, Sendable, Equatable {
    public var radiusArcsec: Double, e1: Double, e2: Double, sersic: Double, profileType: String
    public init(radiusArcsec: Double, e1: Double, e2: Double, sersic: Double, profileType: String) { self.radiusArcsec = radiusArcsec; self.e1 = e1; self.e2 = e2; self.sersic = sersic; self.profileType = profileType }
  }
  public struct Spiral: Codable, Sendable, Equatable {
    public var arms: Int, pitchDegrees: Double, phaseRadians: Double, seed: UInt32, bar: Bool?, barRadiusRe: Double?, innerStyle: String?, armStyle: String?
    public init(arms: Int, pitchDegrees: Double, phaseRadians: Double, seed: UInt32, bar: Bool? = nil, barRadiusRe: Double? = nil, innerStyle: String? = nil, armStyle: String? = nil) {
      self.arms = arms; self.pitchDegrees = pitchDegrees; self.phaseRadians = phaseRadians; self.seed = seed; self.bar = bar; self.barRadiusRe = barRadiusRe; self.innerStyle = innerStyle; self.armStyle = armStyle
    }
  }
  public struct Model: Codable, Sendable, Equatable {
    public enum TypeSource: String, Codable, Sendable { case catalog, proxy }
    public var family: GalaxyFamily, typeSource: TypeSource, typeLabel: String, shapeMeasured: Bool, sourceName: String?, profileIndex: Double
    public init(family: GalaxyFamily, typeSource: TypeSource, typeLabel: String, shapeMeasured: Bool, sourceName: String?, profileIndex: Double) {
      self.family = family; self.typeSource = typeSource; self.typeLabel = typeLabel; self.shapeMeasured = shapeMeasured; self.sourceName = sourceName; self.profileIndex = profileIndex
    }
  }
  public var version: Int, catalogId: String, catalogSourceSha256: String, name: String, galaxy: Galaxy
  public var shape: Shape, gaussians: [Gaussian], fitMaxRelativeError: Double
  public var spiral: Spiral?, model: Model?, knotCount: Int?, cloud: MagellanicCloudKind?
  /// Diagnostic opt-out: inspect the unmodified source profile separately.
  public var sourceProfileOnly: Bool?
  public init(version: Int = 1, catalogId: String, catalogSourceSha256: String, name: String, galaxy: Galaxy, shape: Shape, gaussians: [Gaussian], fitMaxRelativeError: Double, spiral: Spiral? = nil, model: Model? = nil, knotCount: Int? = nil, cloud: MagellanicCloudKind? = nil, sourceProfileOnly: Bool? = nil) {
    self.version = version; self.catalogId = catalogId; self.catalogSourceSha256 = catalogSourceSha256; self.name = name; self.galaxy = galaxy; self.shape = shape; self.gaussians = gaussians; self.fitMaxRelativeError = fitMaxRelativeError; self.spiral = spiral; self.model = model; self.knotCount = knotCount; self.cloud = cloud; self.sourceProfileOnly = sourceProfileOnly
  }
}

extension Galaxy: Codable {
  enum Keys: String, CodingKey { case id, targetId, ra, dec, z, zerr, distance, delta, position, nearby }
  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: Keys.self)
    let p = try c.decode([Double].self, forKey: .position)
    guard p.count == 3 else { throw AtlasError("Invalid galaxy position") }
    self.init(id: try c.decode(Int.self, forKey: .id), targetId: try c.decode(String.self, forKey: .targetId), ra: try c.decode(Double.self, forKey: .ra), dec: try c.decode(Double.self, forKey: .dec),
              z: try c.decodeIfPresent(Double.self, forKey: .z), zerr: try c.decodeIfPresent(Double.self, forKey: .zerr), distance: try c.decode(Double.self, forKey: .distance),
              delta: try c.decodeIfPresent(Double.self, forKey: .delta), position: SIMD3(p[0], p[1], p[2]), nearby: try c.decodeIfPresent(NearbyInfo.self, forKey: .nearby))
  }
  public func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: Keys.self)
    try c.encode(id, forKey: .id); try c.encode(targetId, forKey: .targetId); try c.encode(ra, forKey: .ra); try c.encode(dec, forKey: .dec)
    try c.encode(z, forKey: .z); try c.encode(zerr, forKey: .zerr); try c.encode(distance, forKey: .distance); try c.encode(delta, forKey: .delta)
    try c.encode([position.x, position.y, position.z], forKey: .position); try c.encodeIfPresent(nearby, forKey: .nearby)
  }
}
