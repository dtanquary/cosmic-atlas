import XCTest
import simd
import AtlasTestSupport
@testable import AtlasCore

// Ports of tests/galaxy-colors, galaxy-appearance and galaxy-detail (pure parts).
final class GalaxyGeometryTests: XCTestCase {
  static let reference = try! ReferenceData(directory: RepoPaths.file("src/data"))
  static let detail = try! JSONDecoder().decode(GalaxyDetailData.self, from: RepoPaths.data("public/data/galaxy-detail.json"))
  static let spiral = try! JSONDecoder().decode(GalaxyDetailData.self, from: RepoPaths.data("public/data/galaxy-spiral.json"))

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
    for make in [{ (p: GalaxyColors) in irregularSamples(seed: 123, count: 1200, palette: p) }] {
      let first = make(a), second = make(b)
      XCTAssertEqual(first.positions, second.positions); XCTAssertEqual(first.sizes, second.sizes)
      XCTAssertNotEqual(first.colors, second.colors); XCTAssertEqual(make(a).colors, first.colors)
    }
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
      let catalog = try resolveModel(data, appearance: .catalog), spiral = try resolveModel(data, appearance: .spiral)
      XCTAssertEqual(spiral.light.family, .spiral); XCTAssertNotNil(spiral.look); XCTAssertNotNil(spiral.light.look)
      // Catalog types keeps the other families' renderers; spiral and barred discs take a look.
      XCTAssertEqual(catalog.look != nil, family == .spiral || family == .barred)
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
    let fallback = try resolveModel(unknown, appearance: .spiral)
    XCTAssertNotNil(fallback.look); XCTAssertEqual(fallback.light.look?.key, fallback.look?.key)
    var profileOnly = try nearbyDetails(Self.reference.nearby)[0]; profileOnly.sourceProfileOnly = true; profileOnly.spiral = nil; profileOnly.knotCount = 0
    let source = try resolveModel(profileOnly, appearance: .catalog)
    XCTAssertNil(source.light.look); XCTAssertNil(source.look); XCTAssertEqual(source.light.knotCount, 0)
    let m31 = try resolveModel(try nearbyDetails(Self.reference.nearby)[0], appearance: .spiral)
    XCTAssertEqual(m31.light.look?.key, .m31); XCTAssertEqual(m31.light.gaussians, [])
  }
}
