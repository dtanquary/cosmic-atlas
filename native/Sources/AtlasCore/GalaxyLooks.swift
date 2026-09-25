import Foundation

// Procedural spiral looks from src/galaxy-looks.ts (after the Atrium Galaxy screensaver). Arms, dust, stars and H II
// regions are illustrative; only the adopted size, sky ellipse and position come from the source catalogs.

public enum GalaxyLookKey: String, Sendable, CaseIterable { case ngc3982, m31, m33, milkyWay, grand, multi, tight, flocculent, barred, weakBar }
public struct GalaxyLook: Sendable, Equatable {
  public var arms: Double, minor: Double, pitchDegrees: Double, bar: Double, bulge: Double, ragged: Double, dust: Double, hii: Double
  public var extent: Double, unitsPerRe: Double, phaseDegrees: Double, spin: Double
  public var core: RGB, disc: RGB, young: RGB, knots: RGB
}
let andromeda = GalaxyLook(arms: 2, minor: 1, pitchDegrees: 8, bar: 0, bulge: 0.13, ragged: 0.5, dust: 1.2, hii: 1, extent: 1, unitsPerRe: 0.5311, phaseDegrees: 0, spin: 1,
                           core: RGB(1, 0.9, 0.78), disc: RGB(0.86, 0.78, 0.86), young: RGB(0.74, 0.76, 1), knots: RGB(1, 0.5, 0.7))
let triangulum = GalaxyLook(arms: 2, minor: 1, pitchDegrees: 30, bar: 0, bulge: 0.015, ragged: 0.9, dust: 0.6, hii: 1.5, extent: 1, unitsPerRe: 0.5311, phaseDegrees: 0, spin: 1,
                            core: RGB(1, 0.96, 0.9), disc: RGB(0.88, 0.9, 1), young: RGB(0.74, 0.86, 1), knots: RGB(1, 0.5, 0.56))
public let galaxyLooks: [GalaxyLookKey: GalaxyLook] = [
  .ngc3982: GalaxyLook(arms: 4, minor: 0.8, pitchDegrees: 26, bar: 0, bulge: 0.05, ragged: 0.7, dust: 2.2, hii: 2, extent: 1, unitsPerRe: 0.5311, phaseDegrees: 0, spin: 1,
                       core: RGB(1, 0.92, 0.84), disc: RGB(0.88, 0.9, 1), young: RGB(0.7, 0.82, 1), knots: RGB(1, 0.45, 0.58)),
  .m31: andromeda,
  .m33: triangulum,
  // Bar length and angle and the handedness follow the sourced home reference; the disc reaches about 15 kpc.
  .milkyWay: GalaxyLook(arms: 4, minor: 0.45, pitchDegrees: 13, bar: 0.71075, bulge: 0.09, ragged: 0.3, dust: 1.2, hii: 1, extent: 1.5, unitsPerRe: 0.6203, phaseDegrees: 152, spin: -1,
                        core: RGB(1, 0.9, 0.76), disc: RGB(0.92, 0.88, 0.84), young: RGB(0.72, 0.84, 1), knots: RGB(1, 0.45, 0.55)),
  // Catalog looks, after Atrium's kinds: Whirlpool (M51), Pinwheel (M101), Andromeda, Triangulum, Great Barred (NGC 1300), Milky Way.
  .grand: GalaxyLook(arms: 2, minor: 1, pitchDegrees: 19, bar: 0, bulge: 0.05, ragged: 0.2, dust: 1.3, hii: 1, extent: 1, unitsPerRe: 0.5311, phaseDegrees: 0, spin: 1,
                     core: RGB(1, 0.91, 0.8), disc: RGB(0.94, 0.9, 0.87), young: RGB(0.72, 0.86, 1), knots: RGB(1, 0.42, 0.5)),
  .multi: GalaxyLook(arms: 4, minor: 1, pitchDegrees: 27, bar: 0, bulge: 0.03, ragged: 0.55, dust: 0.8, hii: 1, extent: 1, unitsPerRe: 0.5311, phaseDegrees: 0, spin: 1,
                     core: RGB(1, 0.93, 0.86), disc: RGB(0.95, 0.93, 0.93), young: RGB(0.7, 0.82, 1), knots: RGB(1, 0.5, 0.6)),
  .tight: andromeda,
  .flocculent: triangulum,
  .barred: GalaxyLook(arms: 2, minor: 1, pitchDegrees: 17, bar: 0.45, bulge: 0.05, ragged: 0.1, dust: 1, hii: 1, extent: 1, unitsPerRe: 0.5311, phaseDegrees: 0, spin: 1,
                      core: RGB(1, 0.9, 0.84), disc: RGB(0.93, 0.9, 0.97), young: RGB(0.72, 0.84, 1), knots: RGB(1, 0.5, 0.6)),
  .weakBar: GalaxyLook(arms: 4, minor: 0.45, pitchDegrees: 13, bar: 0.28, bulge: 0.09, ragged: 0.3, dust: 1.2, hii: 1, extent: 1, unitsPerRe: 0.5311, phaseDegrees: 0, spin: 1,
                       core: RGB(1, 0.9, 0.76), disc: RGB(0.92, 0.88, 0.84), young: RGB(0.72, 0.84, 1), knots: RGB(1, 0.45, 0.55)),
]
public let catalogLookLabels: [GalaxyLookKey: String] = [.grand: "Grand-design spiral", .multi: "Multi-arm spiral", .tight: "Tightly wound spiral",
                                                         .flocculent: "Flocculent spiral", .barred: "Barred spiral", .weakBar: "Weakly barred spiral"]

// Recorded Hubble types: bars first (SB, SAB), then the stage sets winding, bulge and raggedness. Display choices, not fits.
let stageLooks: [String: GalaxyLookKey] = ["a": .tight, "ab": .tight, "b": .grand, "bc": .multi, "c": .multi, "cd": .flocculent, "d": .flocculent, "m": .flocculent]
// Without a usable type: weights in hash space, not measured population fractions.
let identityLooks: [(Double, GalaxyLookKey)] = [(0.25, .grand), (0.5, .multi), (0.65, .tight), (0.8, .barred), (0.9, .weakBar), (1, .flocculent)]

func identityHash(_ text: String) -> UInt32 {
  var h = Int32(truncatingIfNeeded: 2166136261 as UInt32)
  for unit in text.utf16 { h = imul(h ^ Int32(unit), 16777619) }
  h ^= ushr(h, 16); h = imul(h, 0x7feb352d); h ^= ushr(h, 15); h = imul(h, Int32(truncatingIfNeeded: 0x846ca68b as UInt32))
  return UInt32(bitPattern: h ^ ushr(h, 16))
}

public struct CatalogLookChoice: Sendable, Equatable { public var key: GalaxyLookKey, fromType: Bool }
/// A catalog galaxy's look: from its recorded visual type when that names a spiral stage, otherwise from its exact identity.
public func catalogLook(_ identity: String, morphology: String? = nil) -> CatalogLookChoice {
  if let m = morphology, let match = m.wholeMatch(of: #/S(AB|B)?(a|ab|b|bc|c|cd|d|m)/#) {
    let bar = match.1.map(String.init)
    return CatalogLookChoice(key: bar == "B" ? .barred : bar == "AB" ? .weakBar : stageLooks[String(match.2)]!, fromType: true)
  }
  let fraction = Double(identityHash("look:\(identity)")) / 4294967296
  return CatalogLookChoice(key: identityLooks.first { fraction < $0.0 }!.1, fromType: false)
}

/// The colours and pattern orientation a model draws with. Catalog looks turn and mirror their pattern and tint the disc
/// and young stars (at fixed luminance) by exact identity; named looks keep their tuned values.
public func lookAppearance(_ key: GalaxyLookKey, identity: String, palette: GalaxyColors? = nil) -> (phase: Double, spin: Double, core: RGB, disc: RGB, young: RGB, knots: RGB) {
  let l = galaxyLooks[key]!, catalog = catalogLookLabels[key] != nil, h = identityHash("pattern:\(identity)")
  let tint = palette.map(warmthTint) ?? RGB(1, 1, 1)
  // Light multipliers, so a channel may pass 1; the stretch keeps the output in range.
  func shift(_ c: RGB, _ amount: Double) -> RGB {
    let out = RGB(c.r * (1 + amount * (tint.r - 1)), c.g * (1 + amount * (tint.g - 1)), c.b * (1 + amount * (tint.b - 1)))
    return withLuminance(out, luminance(c))
  }
  return (catalog ? Double(h & 16777215) / 16777216 * .pi * 2 : l.phaseDegrees * .pi / 180, catalog ? (h >> 31 == 1 ? -1 : 1) : l.spin,
          l.core, shift(l.disc, 1), shift(l.young, 0.6), l.knots)
}
/// The smooth disc: exponential (scale 0.4) fading out between 0.85 and 1.4 times a look's extent.
public let lookDisc = (scale: 0.4, fadeStart: 0.85, fadeEnd: 1.4)

/// Stable noise offsets per galaxy, from its exact public identity (FNV-1a over UTF-16 code units, as the web).
public func lookSeed(_ identity: String) -> SIMD2<Double> {
  var h: UInt32 = 2166136261
  for unit in identity.utf16 { h = (h ^ UInt32(unit)) &* 16777619 }
  return SIMD2(Double(h & 65535) / 65536 * 100, Double(h >> 16) / 65536 * 100)
}
