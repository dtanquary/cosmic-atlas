import XCTest
import simd
import AtlasTestSupport
@testable import AtlasCore

// Ports of tests/galaxy-colors, galaxy-variants, galaxy-appearance and galaxy-detail (pure parts).
final class GalaxyGeometryTests: XCTestCase {
  static let reference = try! ReferenceData(directory: RepoPaths.file("src/data"))
  static let detail = try! JSONDecoder().decode(GalaxyDetailData.self, from: RepoPaths.data("public/data/galaxy-detail.json"))
  static let spiral = try! JSONDecoder().decode(GalaxyDetailData.self, from: RepoPaths.data("public/data/galaxy-spiral.json"))
  var profile: SpiralProfile { Self.reference.spiralProfile }

  func testPalettesAreRepeatableRestrainedAndEquallyBright() {
    let palettes = (0..<256).map { galaxyColors("desi-test:\($0)") }
    XCTAssertEqual(galaxyColors("nearby:m31"), galaxyColors("nearby:m31"))
    XCTAssertNotEqual(galaxyColors("nearby:m31"), galaxyColors("nearby:m33"))
    for p in palettes {
      XCTAssertEqual(luminance(p.disk), 0.69, accuracy: 1e-12); XCTAssertEqual(luminance(p.core), 0.88, accuracy: 1e-12)
      for c in [p.disk, p.core, p.emission] { for ch in c.array { XCTAssertGreaterThan(ch, 0); XCTAssertLessThanOrEqual(ch, 1) } }
      XCTAssertGreaterThan(p.core.r / p.core.b, p.disk.r / p.disk.b)
    }
    let ratios = palettes.map { $0.disk.r / $0.disk.b }
    XCTAssertLessThan(ratios.min()!, 0.75); XCTAssertGreaterThan(ratios.max()!, 1.05)
  }
  func testColorsChangeWithoutMovingSamples() {
    let a = galaxyColors("nearby:m31"), b = galaxyColors("nearby:m33")
    let parameters = GalaxyDetailData.Spiral(arms: 2, pitchDegrees: 20, phaseRadians: 0.4, seed: 123)
    for make in [{ (p: GalaxyColors) in spiralSamples(parameters, count: 1200, palette: p) }, { (p: GalaxyColors) in irregularSamples(seed: 123, count: 1200, palette: p) }] {
      let first = make(a), second = make(b)
      XCTAssertEqual(first.positions, second.positions); XCTAssertEqual(first.sizes, second.sizes)
      XCTAssertNotEqual(first.colors, second.colors); XCTAssertEqual(make(a).colors, first.colors)
    }
  }
  func testNamedRoadTripDestinationsGetStableIllustrations() {
    XCTAssertEqual(galaxyVariant("nearby:m31").variant.key, "tight")
    XCTAssertEqual(galaxyVariant("nearby:m33").variant.key, "feathered")
    XCTAssertEqual(galaxyVariant("39633325333155389").variant.key, "multi")
  }
  func testAssignsEveryVariantAcrossStableIdentities() throws {
    let source = try nearbyDetails(Self.reference.nearby)[0], light = spiralLight(source, profile: profile)
    var other = source; other.galaxy.id = 314
    XCTAssertEqual(spiralLight(other, profile: profile).spiral, light.spiral)
    var family = source; family.model?.family = .elliptical
    XCTAssertEqual(spiralLight(family, profile: profile).spiral, light.spiral)
    let keys = Set((0..<256).map { galaxyVariant("variant-test:\($0)").variant.key })
    XCTAssertEqual(keys.count, galaxyVariants.count)
    for v in galaxyVariants { XCTAssertTrue(keys.contains(v.key)) }
  }
  func testVariantsRedistributeStructureWithoutEnlargingOrBrightening() {
    let palette = galaxyColors("nearby:m31")
    func params(_ v: GalaxyVariant) -> GalaxyDetailData.Spiral { .init(arms: v.arms, pitchDegrees: v.pitchDegrees, phaseRadians: 0.5, seed: 171, innerStyle: v.innerStyle, armStyle: v.armStyle) }
    let base = spiralSamples(params(galaxyVariants[0]), count: 12000, palette: palette)
    for variant in galaxyVariants.dropFirst() {
      let samples = spiralSamples(params(variant), count: 12000, palette: palette)
      XCTAssertNotEqual(samples.positions, base.positions)
      XCTAssertEqual(samples.sizes, base.sizes)
      for i in 0..<samples.sizes.count {
        let j = i * 3, r = hypot(Double(samples.positions[j]), Double(samples.positions[j + 1]))
        XCTAssertEqual(r, hypot(Double(base.positions[j]), Double(base.positions[j + 1])), accuracy: 5e-6)
        XCTAssertLessThanOrEqual(r, 4.500001)
        XCTAssertEqual(samples.positions[j + 2], base.positions[j + 2])
        for c in 0..<3 { XCTAssertEqual(samples.colors[j + c], base.colors[j + c], accuracy: 5e-7) }
      }
    }
  }
  func testCommonProfileExposureAndBudgetForAllVariants() throws {
    let source = try nearbyDetails(Self.reference.nearby)[0], base = spiralLight(source, profile: profile)
    var seen: Set<String> = []
    for i in 0..<256 {
      let targetId = "variant-test:\(i)", recipe = galaxyVariant(targetId)
      if seen.contains(recipe.variant.key) { continue }
      seen.insert(recipe.variant.key)
      var data = source; data.galaxy.targetId = targetId
      let light = spiralLight(data, profile: profile)
      XCTAssertEqual(light.family, .spiral); XCTAssertEqual(light.gaussians, base.gaussians); XCTAssertEqual(light.exposure, 0.55); XCTAssertEqual(light.knotCount, base.knotCount)
      XCTAssertNil(light.spiral?.bar)
    }
    XCTAssertEqual(seen.count, galaxyVariants.count)
  }
  func testRecoversTractorSkyCovarianceAcrossSkyPositions() throws {
    let d = Self.detail
    for (ra, dec) in [(0.0, 0.0), (90, 0), (270, 80), (35, -90), (d.galaxy.ra, d.galaxy.dec)] {
      for (e1, e2) in [(0.5, 0.0), (0, 0.4), (0, -0.4), (d.shape.e1, d.shape.e2)] {
        let f = try galaxyFrame(ra: ra, dec: dec, e1: e1, e2: e2), theta = 0.5 * atan2(e2, e1)
        func cov(_ a: SIMD3<Double>, _ b: SIMD3<Double>) -> Double { simd_dot(f.major, a) * simd_dot(f.major, b) + simd_dot(f.minor, a) * simd_dot(f.minor, b) + f.thickness * f.thickness * simd_dot(f.normal, a) * simd_dot(f.normal, b) }
        XCTAssertEqual(cov(f.east, f.east), sin(theta) * sin(theta) + f.q * f.q * cos(theta) * cos(theta), accuracy: 1e-12)
        XCTAssertEqual(cov(f.north, f.north), cos(theta) * cos(theta) + f.q * f.q * sin(theta) * sin(theta), accuracy: 1e-12)
        XCTAssertEqual(cov(f.east, f.north), (1 - f.q * f.q) * sin(theta) * cos(theta), accuracy: 1e-12)
        XCTAssertEqual(simd_dot(simd_cross(f.major, f.minor), f.normal), 1, accuracy: 1e-12)
      }
    }
  }
  func testSpiralAppearancePreservesProjectedMeasurements() throws {
    var source = try nearbyDetails(Self.reference.nearby)[0]; source.galaxy.targetId = "unmatched:appearance-test"
    for family in [GalaxyFamily.spiral, .barred, .elliptical, .lenticular, .irregular] {
      var data = source; data.spiral = nil; data.model?.family = family
      let catalog = try resolveModel(data, appearance: .catalog, profile: profile), spiral = try resolveModel(data, appearance: .spiral, profile: profile)
      XCTAssertEqual(spiral.light.family, .spiral); XCTAssertEqual(spiral.light.knotCount, 12000)
      XCTAssertEqual(spiral.center, catalog.center); XCTAssertEqual(spiral.radius, catalog.radius)
      XCTAssertEqual(spiral.frame.q, catalog.frame.q); XCTAssertEqual(spiral.frame.positionAngle, catalog.frame.positionAngle)
      let f = spiral.frame
      let minor = f.east * cos(f.positionAngle * .pi / 180) - f.north * sin(f.positionAngle * .pi / 180)
      XCTAssertEqual(hypot(hypot(simd_dot(f.major, minor), simd_dot(f.minor, minor)), f.thickness * simd_dot(f.normal, minor)), f.q, accuracy: 1e-12)
    }
  }
  func testMeasuredAngularSizeAndHalfLight() {
    let d = Self.detail
    let radius = galaxyRadius(distanceMpc: d.galaxy.distance, radiusArcsec: d.shape.radiusArcsec)
    XCTAssertEqual(radius / d.galaxy.distance * 180 / .pi * 3600, d.shape.radiusArcsec, accuracy: 1e-9)
    XCTAssertEqual(simd_distance(d.galaxy.position, cartesian(ra: d.galaxy.ra, dec: d.galaxy.dec, distance: d.galaxy.distance)), 0, accuracy: 1e-9)
    XCTAssertEqual(d.galaxy.targetId, "39633263488141603")
    let total = d.gaussians.reduce(0) { $0 + $1.peak * $1.sigmaRe * $1.sigmaRe }
    let enclosed = d.gaussians.reduce(0) { $0 + $1.peak * $1.sigmaRe * $1.sigmaRe * (1 - exp(-0.5 / ($1.sigmaRe * $1.sigmaRe))) }
    XCTAssertEqual(enclosed / total, 0.5, accuracy: 0.005)
    XCTAssertLessThan(d.fitMaxRelativeError, 0.001)
  }
  func testCrossfadeRules() {
    XCTAssertEqual(detailBlend(0), 0); XCTAssertEqual(detailBlend(0.6), 0); XCTAssertEqual(detailBlend(5), 1)
    var previous = 0.0
    for i in 0..<120 { let v = detailBlend(Double(i) / 10); XCTAssertGreaterThanOrEqual(v, previous); previous = v }
    for shortSide in [320.0, 768, 1440] {
      XCTAssertEqual(modelBlend(shortSide * 0.05, shortSide: shortSide), 1)
      var prev = 1.0
      var fraction = 0.06
      while fraction <= 0.17 { let b = modelBlend(shortSide * fraction, shortSide: shortSide); XCTAssertLessThanOrEqual(b, prev); prev = b; fraction += 0.005 }
      XCTAssertEqual(modelBlend(shortSide, shortSide: shortSide), 0)
      XCTAssertEqual(modelBlend(shortSide, shortSide: shortSide, focused: true), 1)
      XCTAssertEqual(modelBlend(20, shortSide: shortSide, focused: false, display: .focused), 0)
      XCTAssertEqual(modelBlend(20, shortSide: shortSide, focused: true, display: .focused), 1)
      XCTAssertEqual(modelBlend(20, shortSide: shortSide, focused: true, display: .points), 0)
    }
  }
  func testPortraitRegistryFallsBackForSimilarIdentities() throws {
    for id in ["nearby:m310", "39633325333155388", "NGC 3982", "NGC 4874", "NGC 4889", "toString"] { XCTAssertNil(galaxyPortrait(id)) }
    for data in try nearbyDetails(Self.reference.nearby) + [Self.detail, Self.spiral] { XCTAssertNotNil(galaxyPortrait(data.galaxy.targetId), data.galaxy.targetId) }
    var unknown = try nearbyDetails(Self.reference.nearby)[0]; unknown.galaxy.targetId = "unmatched:portrait-fallback"
    let fallback = try resolveModel(unknown, appearance: .spiral, profile: profile)
    XCTAssertNotNil(fallback.light.spiral); XCTAssertNil(fallback.light.portrait); XCTAssertEqual(fallback.light.knotCount, 12000)
    var profileOnly = try nearbyDetails(Self.reference.nearby)[0]; profileOnly.sourceProfileOnly = true; profileOnly.spiral = nil; profileOnly.knotCount = 0
    let source = try resolveModel(profileOnly, appearance: .catalog, profile: profile)
    XCTAssertNil(source.light.portrait); XCTAssertNil(source.light.spiral); XCTAssertEqual(source.light.knotCount, 0)
    let m31 = try resolveModel(try nearbyDetails(Self.reference.nearby)[0], appearance: .spiral, profile: profile)
    XCTAssertEqual(m31.light.portrait, .m31); XCTAssertEqual(m31.light.gaussians, [])
  }
}
