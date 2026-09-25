import Foundation

// Procedural spiral looks from src/galaxy-looks.ts (after the Atrium Galaxy screensaver). Arms, dust, stars and H II
// regions are illustrative; only the adopted size, sky ellipse and position come from the source catalogs.

public enum GalaxyLookKey: String, Sendable, CaseIterable { case ngc3982, m31, m33, milkyWay }
public struct GalaxyLook: Sendable, Equatable {
  public var arms: Double, minor: Double, pitchDegrees: Double, bar: Double, bulge: Double, ragged: Double, dust: Double, hii: Double
  public var extent: Double, unitsPerRe: Double, phaseDegrees: Double, spin: Double
  public var core: RGB, disc: RGB, young: RGB, knots: RGB
}
public let galaxyLooks: [GalaxyLookKey: GalaxyLook] = [
  .ngc3982: GalaxyLook(arms: 4, minor: 0.8, pitchDegrees: 26, bar: 0, bulge: 0.05, ragged: 0.7, dust: 2.2, hii: 2, extent: 1, unitsPerRe: 0.5311, phaseDegrees: 0, spin: 1,
                       core: RGB(1, 0.92, 0.84), disc: RGB(0.88, 0.9, 1), young: RGB(0.7, 0.82, 1), knots: RGB(1, 0.45, 0.58)),
  .m31: GalaxyLook(arms: 2, minor: 1, pitchDegrees: 8, bar: 0, bulge: 0.13, ragged: 0.5, dust: 1.2, hii: 1, extent: 1, unitsPerRe: 0.5311, phaseDegrees: 0, spin: 1,
                   core: RGB(1, 0.9, 0.78), disc: RGB(0.86, 0.78, 0.86), young: RGB(0.74, 0.76, 1), knots: RGB(1, 0.5, 0.7)),
  .m33: GalaxyLook(arms: 2, minor: 1, pitchDegrees: 30, bar: 0, bulge: 0.015, ragged: 0.9, dust: 0.6, hii: 1.5, extent: 1, unitsPerRe: 0.5311, phaseDegrees: 0, spin: 1,
                   core: RGB(1, 0.96, 0.9), disc: RGB(0.88, 0.9, 1), young: RGB(0.74, 0.86, 1), knots: RGB(1, 0.5, 0.56)),
  // Bar length and angle and the handedness follow the sourced home reference; the disc reaches about 15 kpc.
  .milkyWay: GalaxyLook(arms: 4, minor: 0.45, pitchDegrees: 13, bar: 0.71075, bulge: 0.09, ragged: 0.3, dust: 1.2, hii: 1, extent: 1.5, unitsPerRe: 0.6203, phaseDegrees: 152, spin: -1,
                        core: RGB(1, 0.9, 0.76), disc: RGB(0.92, 0.88, 0.84), young: RGB(0.72, 0.84, 1), knots: RGB(1, 0.45, 0.55)),
]
/// The smooth disc: exponential (scale 0.4) fading out between 0.85 and 1.4 times a look's extent.
public let lookDisc = (scale: 0.4, fadeStart: 0.85, fadeEnd: 1.4)

/// Stable noise offsets per galaxy, from its exact public identity (FNV-1a over UTF-16 code units, as the web).
public func lookSeed(_ identity: String) -> SIMD2<Double> {
  var h: UInt32 = 2166136261
  for unit in identity.utf16 { h = (h ^ UInt32(unit)) &* 16777619 }
  return SIMD2(Double(h & 65535) / 65536 * 100, Double(h >> 16) / 65536 * 100)
}
