import Foundation

// Procedural spiral looks from src/galaxy-looks.ts (after the Atrium Galaxy screensaver). Arms, dust, stars and H II
// regions are illustrative; only the adopted size, sky ellipse and position come from the source catalogs.

public enum GalaxyLookKey: String, Sendable { case ngc3982 }
public struct GalaxyLook: Sendable, Equatable {
  public var arms: Double, minor: Double, pitchDegrees: Double, bar: Double, bulge: Double, ragged: Double, dust: Double, hii: Double
  public var core: RGB, disc: RGB, young: RGB, knots: RGB
}
public let galaxyLooks: [GalaxyLookKey: GalaxyLook] = [
  .ngc3982: GalaxyLook(arms: 4, minor: 0.8, pitchDegrees: 26, bar: 0, bulge: 0.05, ragged: 0.7, dust: 2.2, hii: 2,
                       core: RGB(1, 0.92, 0.84), disc: RGB(0.88, 0.9, 1), young: RGB(0.7, 0.82, 1), knots: RGB(1, 0.45, 0.58)),
]
/// The smooth disc; unitsPerRe puts its half-light radius at exactly the adopted catalog radius.
public let lookDisc = (scale: 0.4, fadeStart: 0.85, fadeEnd: 1.4, unitsPerRe: 0.5311)

/// Stable noise offsets per galaxy, from its exact public identity (FNV-1a over UTF-16 code units, as the web).
public func lookSeed(_ identity: String) -> SIMD2<Double> {
  var h: UInt32 = 2166136261
  for unit in identity.utf16 { h = (h ^ UInt32(unit)) &* 16777619 }
  return SIMD2(Double(h & 65535) / 65536 * 100, Double(h >> 16) / 65536 * 100)
}
