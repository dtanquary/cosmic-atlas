import Foundation
import simd

// Pure geometry from src/galaxy-detail.ts, src/galaxy-colors.ts and src/galaxy-portraits.ts.
// Integer hashing reproduces JavaScript's Math.imul / >>> exactly so identities pick the same palette and look.

@inline(__always) func imul(_ a: Int32, _ b: Int32) -> Int32 { a &* b }
@inline(__always) func ushr(_ a: Int32, _ n: Int32) -> Int32 { Int32(bitPattern: UInt32(bitPattern: a) >> UInt32(n)) }

/// The web's LCG: `(Math.imul(1664525,seed)+1013904223)>>>0`, `(seed+.5)/2^32`.
public struct JSRandom {
  public var state: UInt32
  public init(seed: UInt32) { state = seed }
  public mutating func next() -> Double { state = 1664525 &* state &+ 1013904223; return (Double(state) + 0.5) / 4294967296 }
  public mutating func normal() -> Double { let u = next(); let v = next(); return (-2 * log(u)).squareRoot() * cos(2 * .pi * v) }
}

public struct GalaxySamples: Sendable, Equatable {
  public var positions: [Float], colors: [Float], sizes: [Float]
  public init(positions: [Float], colors: [Float], sizes: [Float]) { self.positions = positions; self.colors = colors; self.sizes = sizes }
}

public struct RGB: Sendable, Equatable { public var r: Double, g: Double, b: Double
  public init(_ r: Double, _ g: Double, _ b: Double) { self.r = r; self.g = g; self.b = b }
  public var array: [Double] { [r, g, b] }
  public var float3: SIMD3<Float> { SIMD3(Float(r), Float(g), Float(b)) } }
public struct GalaxyColors: Sendable, Equatable { public var disk: RGB, core: RGB, emission: RGB, emissionFraction: Double }

func mixRGB(_ a: RGB, _ b: RGB, _ t: Double) -> RGB { RGB(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t) }
public func luminance(_ c: RGB) -> Double { c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722 }
func withLuminance(_ c: RGB, _ value: Double) -> RGB { let s = value / luminance(c); return RGB(c.r * s, c.g * s, c.b * s) }

let coolDisk = RGB(0.50, 0.66, 0.83), warmDisk = RGB(0.76, 0.72, 0.64)
/// A palette's disk hue relative to the middle of the range, per channel at unit luminance.
public func warmthTint(_ colors: GalaxyColors) -> RGB {
  let own = withLuminance(colors.disk, 1), middle = withLuminance(mixRGB(coolDisk, warmDisk, 0.5), 1)
  return RGB(own.r / middle.r, own.g / middle.g, own.b / middle.b)
}

/// Plausible display colors, not measured photometry or inferred stellar ages.
public func galaxyColors(_ identity: String) -> GalaxyColors {
  var state = Int32(truncatingIfNeeded: 2166136261 as UInt32)
  for unit in identity.utf16 { state = imul(state ^ Int32(unit), 16777619) }
  func random() -> Double {
    state = state &+ 0x6d2b79f5
    var n = state
    n = imul(n ^ ushr(n, 15), n | 1)
    n ^= n &+ imul(n ^ ushr(n, 7), n | 61)
    return Double(UInt32(bitPattern: n ^ ushr(n, 14))) / 4294967296
  }
  let warmth = 0.1 + 0.8 * random(), coreWarmth = warmth * 0.8 + random() * 0.2
  return GalaxyColors(
    disk: withLuminance(mixRGB(coolDisk, warmDisk, warmth), 0.69),
    core: withLuminance(mixRGB(RGB(0.95, 0.91, 0.83), RGB(1, 0.90, 0.72), coreWarmth), 0.88),
    emission: withLuminance(RGB(0.86, 0.57, 0.64), 0.66),
    emissionFraction: 0.015 + 0.02 * random())
}

/// Irregular light clumps, not individually measured stars or star-forming regions.
public func irregularSamples(seed: UInt32, count: Int = 12000, palette: GalaxyColors? = nil) -> GalaxySamples {
  var random = JSRandom(seed: seed)
  var centers: [[Double]] = []
  for _ in 0..<7 { let a = random.normal() * 0.85; let b = random.normal() * 0.7; let c = random.normal() * 0.14; centers.append([a, b, c]) }
  var positions = [Float](repeating: 0, count: count * 3), colors = [Float](repeating: 0, count: count * 3), sizes = [Float](repeating: 0, count: count)
  var i = 0
  while i < count {
    let c = centers[i % centers.count], diffuse = random.next() < 0.22
    let x = diffuse ? random.normal() * 1.2 : c[0] + random.normal() * 0.24
    let y = diffuse ? random.normal() * 1.1 : c[1] + random.normal() * 0.22
    let z = random.normal() * 0.16 + (diffuse ? 0 : c[2])
    if x * x + y * y + z * z > 20.25 { continue }
    positions[i * 3] = Float(x); positions[i * 3 + 1] = Float(y); positions[i * 3 + 2] = Float(z)
    let pink = random.next() < (palette?.emissionFraction ?? 0.06)
    let color = palette.map { pink ? $0.emission.array : $0.disk.array } ?? (pink ? [0.95, 0.43, 0.57] : [0.53, 0.73, 0.98])
    for ch in 0..<3 { colors[i * 3 + ch] = Float(color[ch]) }
    sizes[i] = Float(0.065 + random.next() * 0.08)
    i += 1
  }
  return GalaxySamples(positions: positions, colors: colors, sizes: sizes)
}

/// The 3D frame of a projected sky ellipse (Tractor convention), deprojected with an assumed thickness.
public struct GalaxyFrame: Sendable, Equatable {
  public var major: SIMD3<Double>, minor: SIMD3<Double>, normal: SIMD3<Double>, radial: SIMD3<Double>, north: SIMD3<Double>, east: SIMD3<Double>
  public var q: Double, thickness: Double, inclination: Double, positionAngle: Double
}
public func galaxyFrame(ra: Double, dec: Double, e1: Double, e2: Double, thickness: Double = 0.12) throws -> GalaxyFrame {
  let radial = cartesian(ra: ra, dec: dec, distance: 1)
  let a = ra * .pi / 180, d = dec * .pi / 180
  let east = SIMD3<Double>(-sin(a), cos(a), 0)
  let north = SIMD3<Double>(-sin(d) * cos(a), -sin(d) * sin(a), cos(d))
  let e = hypot(e1, e2), q = (1 - e) / (1 + e), theta = atan2(e2, e1) / 2
  if e >= 1 || thickness <= 0 || thickness >= q { throw AtlasError("Shape cannot be deprojected with this assumed thickness") }
  // Tractor getRaDecBasis: major=(sin(theta),cos(theta)) in (east,north).
  let major = north * cos(theta) + east * sin(theta)
  let skyMinor = east * cos(theta) - north * sin(theta)
  let cosI = ((q * q - thickness * thickness) / (1 - thickness * thickness)).squareRoot(), sinI = (1 - cosI * cosI).squareRoot()
  let minor = skyMinor * cosI + radial * sinI
  let normal = simd_normalize(simd_cross(major, minor))
  let angle = theta * 180 / .pi
  return GalaxyFrame(major: major, minor: minor, normal: normal, radial: radial, north: north, east: east, q: q, thickness: thickness,
                     inclination: acos(cosI) * 180 / .pi, positionAngle: (angle + 180).truncatingRemainder(dividingBy: 180))
}

public func detailBlend(_ radiusPixels: Double) -> Double {
  let t = max(0, min(1, (radiusPixels - 0.6) / 4.4))
  return t * t * (3 - 2 * t)
}
/// Visibility is a navigation cue; measured geometry is never resized.
public func modelBlend(_ radiusPixels: Double, shortSide: Double, focused: Bool = false, display: ModelDisplay = .automatic) -> Double {
  if display == .points || (display == .focused && !focused) { return 0 }
  let resolved = detailBlend(radiusPixels)
  // Keep intentional fly-throughs intact. Incidental light returns to its catalog marker before its body occupies the whole viewport.
  return focused ? resolved : resolved * (1 - smoothstep(radiusPixels / max(1, shortSide), 0.06, 0.16))
}

public struct GalaxyPortrait: Sendable, Equatable {
  public var label: String, source: String, look: GalaxyLookKey?, smooth: GalaxyFamily?, exposure: Double?
}
/// Image interpretation is keyed only to verified public identities.
let portraits: [String: GalaxyPortrait] = [
  "nearby:m31": GalaxyPortrait(label: "Andromeda · dust-ring disk", source: "https://esahubble.org/images/heic2501a/", look: .m31, smooth: nil, exposure: nil),
  "nearby:m33": GalaxyPortrait(label: "Triangulum · patchy spiral", source: "https://www.eso.org/public/images/eso1424a/", look: .m33, smooth: nil, exposure: nil),
  "39633325333155389": GalaxyPortrait(label: "NGC 3982 · intricate spiral", source: "https://esahubble.org/images/opo1036a/", look: .ngc3982, smooth: nil, exposure: nil),
  "nearby:m32": GalaxyPortrait(label: "M32 · compact elliptical", source: "https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-32/", look: nil, smooth: .elliptical, exposure: 8),
  "nearby:m110": GalaxyPortrait(label: "M110 · diffuse elliptical", source: "https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-110/", look: nil, smooth: .elliptical, exposure: 6),
  "39633263488141603": GalaxyPortrait(label: "NGC 4026 · smooth lenticular", source: "https://www.legacysurvey.org/viewer?ra=179.8544868&dec=50.9616574&layer=ls-dr9&zoom=14", look: nil, smooth: .lenticular, exposure: nil),
  "nearby:lmc": GalaxyPortrait(label: "Large Magellanic Cloud · stellar bar", source: "https://noirlab.edu/public/images/noirlab2030a/", look: nil, smooth: nil, exposure: nil),
  "nearby:smc": GalaxyPortrait(label: "Small Magellanic Cloud · diffuse wing", source: "https://noirlab.edu/public/images/noirlab2030b/", look: nil, smooth: nil, exposure: nil),
]
public func galaxyPortrait(_ identity: String) -> GalaxyPortrait? { portraits[identity] }
public let cloudLabels: [MagellanicCloudKind: String] = [.lmc: "Barred stellar cloud", .smc: "Fragmented stellar cloud"]

/// What a model renders: family, light profile, structure recipe and palette.
public struct GalaxyLight: Sendable, Equatable {
  public struct Look: Sendable, Equatable {
    public var key: GalaxyLookKey, identity: String
    public init(key: GalaxyLookKey, identity: String) { self.key = key; self.identity = identity }
  }
  public var family: GalaxyFamily, gaussians: [Gaussian], cloud: MagellanicCloudKind?
  public var look: Look? = nil
  public var seed: UInt32, knotCount: Int?, exposure: Double?, colors: GalaxyColors?
  public init(family: GalaxyFamily, gaussians: [Gaussian], cloud: MagellanicCloudKind?, seed: UInt32, knotCount: Int?, exposure: Double?, colors: GalaxyColors?) {
    self.family = family; self.gaussians = gaussians; self.cloud = cloud; self.seed = seed; self.knotCount = knotCount; self.exposure = exposure; self.colors = colors
  }
}

/// A measured catalog observation's model recipe (ResolvedGalaxy's constructor): light, deprojected frame, radius and centre.
public struct ResolvedModel: Sendable, Equatable {
  public var light: GalaxyLight, frame: GalaxyFrame, radius: Double, center: SIMD3<Double>
  /// The catalog look drawn, and whether its recorded visual type chose it.
  public var look: CatalogLookChoice?
}
public func resolveModel(_ data: GalaxyDetailData, appearance: GalaxyAppearance = .catalog) throws -> ResolvedModel {
  let galaxy = data.galaxy, shape = data.shape
  let portrait = data.sourceProfileOnly == true ? nil : galaxyPortrait(galaxy.targetId)
  let family: GalaxyFamily = data.cloud != nil ? .irregular : portrait?.smooth ?? ((portrait?.look != nil || appearance == .spiral) ? .spiral : data.model?.family ?? (data.spiral != nil ? .spiral : .lenticular))
  let e = hypot(shape.e1, shape.e2), q = (1 - e) / (1 + e)
  let intrinsic = min(family == .elliptical ? 0.65 : family == .irregular ? 0.3 : 0.12, q * 0.95)
  let seed = UInt32(bitPattern: Int32(truncatingIfNeeded: galaxy.id))
  // Every disc drawn as a spiral gets a catalog look; the source profile stays available through sourceProfileOnly.
  let look = portrait == nil && data.cloud == nil && data.sourceProfileOnly != true && (family == .spiral || family == .barred) ? catalogLook(galaxy.targetId, morphology: data.model?.morphology) : nil
  var light: GalaxyLight
  if let cloud = data.cloud {
    light = GalaxyLight(family: family, gaussians: data.gaussians, cloud: cloud, seed: seed, knotCount: 4096, exposure: nil, colors: galaxyColors(galaxy.targetId))
  } else if let key = portrait?.look {
    light = GalaxyLight(family: family, gaussians: [], cloud: nil, seed: seed, knotCount: nil, exposure: nil, colors: nil)
    light.look = .init(key: key, identity: galaxy.targetId)
  } else if let look {
    light = GalaxyLight(family: family, gaussians: [], cloud: nil, seed: seed, knotCount: nil, exposure: nil, colors: galaxyColors(galaxy.targetId))
    light.look = .init(key: look.key, identity: galaxy.targetId)
  } else {
    light = GalaxyLight(family: family, gaussians: data.gaussians, cloud: nil, seed: seed, knotCount: data.knotCount ?? 12000, exposure: portrait?.exposure, colors: galaxyColors(galaxy.targetId))
  }
  return ResolvedModel(light: light, frame: try galaxyFrame(ra: galaxy.ra, dec: galaxy.dec, e1: shape.e1, e2: shape.e2, thickness: intrinsic),
                       radius: galaxyRadius(distanceMpc: galaxy.distance, radiusArcsec: shape.radiusArcsec), center: galaxy.position, look: look)
}

/// The Milky Way's literature-based frame: adopted axes, thickness .07, unit q; the approach direction the tours use.
public struct MilkyWayFrame: Sendable, Equatable {
  public var major: SIMD3<Double>, minor: SIMD3<Double>, normal: SIMD3<Double>, center: SIMD3<Double>, radius: Double
  public let thickness = 0.07, q = 1.0
  public var approachDirection: SIMD3<Double> { simd_normalize(normal * 0.88 - major * 0.35 + minor * 0.25) }
  public init(_ reference: MilkyWayReference) {
    major = SIMD3(reference.axes[0][0], reference.axes[0][1], reference.axes[0][2])
    minor = SIMD3(reference.axes[1][0], reference.axes[1][1], reference.axes[1][2])
    normal = SIMD3(reference.axes[2][0], reference.axes[2][1], reference.axes[2][2])
    center = reference.centerMpc; radius = reference.radiusMpc
  }
}
