import XCTest
import Metal
import simd
import AtlasTestSupport
@testable import AtlasCore
@testable import AtlasRender

/// Galaxy volumes on the Mac GPU: visibility/crossfade rules, body hit tests, draw counts, allocations and determinism,
/// ported from the model cases of galaxy-detail, milky-way, magellanic-clouds and galaxy-portraits tests.
final class VolumeTests: XCTestCase {
  static let reference = try! ReferenceData(directory: RepoPaths.file("src/data"))
  static let detail = try! JSONDecoder().decode(GalaxyDetailData.self, from: RepoPaths.data("public/data/galaxy-detail.json"))
  static let spiral = try! JSONDecoder().decode(GalaxyDetailData.self, from: RepoPaths.data("public/data/galaxy-spiral.json"))
  static let renderer = try! AtlasRenderer()
  static let fields = FieldCache(milkyWay: reference.milkyWay)
  var profile: SpiralProfile { Self.reference.spiralProfile }

  func model(_ data: GalaxyDetailData, _ appearance: GalaxyAppearance = .catalog) throws -> GalaxyModel { try GalaxyModel(renderer: Self.renderer, data: data, appearance: appearance, profile: profile, fields: Self.fields) }
  func camera(at position: SIMD3<Double>, lookingAt target: SIMD3<Double>, near: Double = 0.0001) -> Camera { var c = Camera(position: position, target: target); c.aspect = 1; c.near = near; c.far = 100000; return c }
  func project(_ point: SIMD3<Double>, _ camera: Camera) -> SIMD2<Double> {
    let v = simd_double3x3(camera.orientation.inverse) * (point - camera.position)
    return SIMD2(v.x / (-v.z * camera.tanHalfFov * camera.aspect), v.y / (-v.z * camera.tanHalfFov))
  }

  func testSelectsTheResolvedBodyAwayFromCentreAndStaysFiniteInside() throws {
    let m = try model(Self.detail), f = try XCTUnwrap(m.frame)
    var cam = camera(at: m.center - f.radial * 12 * m.radius, lookingAt: m.center)
    m.update(camera: cam, heightPx: 900, focused: true)
    XCTAssertTrue(m.visible); XCTAssertEqual(m.blend, 1)
    let offset = project(m.center + f.major * 2 * m.radius, cam)
    XCTAssertTrue(m.hitTest(ndc: offset, camera: cam))
    XCTAssertFalse(m.hitTest(ndc: [0.9, 0.9], camera: cam))
    cam.position = m.center; m.update(camera: cam, heightPx: 900, focused: true)
    XCTAssertTrue(m.visible); XCTAssertTrue(m.hitTest(ndc: .zero, camera: cam))
    cam = camera(at: m.center - f.radial * 1000, lookingAt: m.center); m.update(camera: cam, heightPx: 900, focused: true)
    XCTAssertFalse(m.visible); XCTAssertEqual(m.blend, 0)
  }
  func testIncidentalForegroundModelNeverCoversTheObserverView() throws {
    let m = try model(Self.detail), f = try XCTUnwrap(m.frame)
    for distance in [6.0, 2, 0.25, 0] {
      let cam = camera(at: m.center + f.radial * distance * m.radius, lookingAt: .zero, near: 0.000001)
      m.update(camera: cam, heightPx: 900)
      XCTAssertEqual(m.blend, 0); XCTAssertFalse(m.visible); XCTAssertFalse(m.hitTest(ndc: [0.6, 0.6], camera: cam))
    }
  }
  func testMilkyWayArrivalAndSolarViews() throws {
    let mw = try GalaxyModel(renderer: Self.renderer, milkyWay: Self.reference.milkyWay, fields: Self.fields), frame = try XCTUnwrap(mw.milkyWayFrame)
    var cam = camera(at: frame.approachDirection * 0.06, lookingAt: .zero, near: 0.000001)
    mw.update(camera: cam, heightPx: 900, focused: true)
    let projected = project(mw.center, cam)
    XCTAssertLessThan(abs(projected.x), 0.6); XCTAssertLessThan(abs(projected.y), 0.6)
    XCTAssertTrue(mw.visible); XCTAssertEqual(mw.blend, 1)
    XCTAssertLessThan(mw.memoryBytes, 3 * 1_048_576)
    XCTAssertNil(mw.data) // No fabricated DESI ID or redshift.
    cam = camera(at: .zero, lookingAt: mw.center, near: 0.0000001)
    mw.update(camera: cam, heightPx: 900, focused: true); XCTAssertTrue(mw.visible); XCTAssertEqual(mw.blend, 1)
    mw.update(camera: cam, heightPx: 900, focused: false); XCTAssertFalse(mw.visible)
    mw.update(camera: cam, heightPx: 900, focused: true, display: .points); XCTAssertFalse(mw.visible)
    cam = camera(at: frame.approachDirection * 100, lookingAt: .zero); mw.update(camera: cam, heightPx: 900, focused: true); XCTAssertFalse(mw.visible)
  }
  func testCloudsKeepIdentityGeometryVisibilitySelectionAndAllocations() throws {
    let sources = try nearbyDetails(Self.reference.nearby).filter { $0.cloud != nil }
    XCTAssertEqual(sources.map(\.galaxy.targetId), ["nearby:lmc", "nearby:smc"])
    for data in sources {
      var other = data; other.galaxy.id = -123
      let a = try model(data, .spiral), b = try model(other, .catalog), f = try XCTUnwrap(a.frame)
      XCTAssertEqual(a.center, b.center); XCTAssertEqual(a.radius, b.radius); XCTAssertEqual(a.frame?.q, b.frame?.q)
      XCTAssertEqual(a.arms?.count, b.arms?.count); XCTAssertEqual(a.arms?.count, 4096)
      XCTAssertLessThanOrEqual(a.memoryBytes, 12000 * 7 * 4 * 2)
      let cam = camera(at: a.center + f.normal * 12 * a.radius, lookingAt: a.center, near: 1e-8)
      a.update(camera: cam, heightPx: 900, focused: true); XCTAssertTrue(a.visible); XCTAssertTrue(a.hitTest(ndc: .zero, camera: cam))
      a.update(camera: cam, heightPx: 900, focused: true, presence: 0.4); XCTAssertEqual(a.blend, 0.4, accuracy: 1e-12)
      a.update(camera: cam, heightPx: 900, focused: true, display: .points); XCTAssertFalse(a.visible); XCTAssertFalse(a.hitTest(ndc: .zero, camera: cam))
    }
  }
  func testPortraitsAndSmoothModelsPreserveSourcedGeometryWithinBudgets() throws {
    var nearbyBytes = 0
    for data in try nearbyDetails(Self.reference.nearby) + [Self.detail, Self.spiral] {
      let portrait = try XCTUnwrap(galaxyPortrait(data.galaxy.targetId))
      var other = data; other.galaxy.id = 777
      let a = try model(data, .spiral), b = try model(other, .catalog)
      XCTAssertEqual(a.center, data.galaxy.position); XCTAssertEqual(a.radius, b.radius); XCTAssertEqual(a.frame?.q, b.frame?.q); XCTAssertEqual(a.frame?.positionAngle, b.frame?.positionAngle)
      XCTAssertEqual(a.radius / data.galaxy.distance * 180 / .pi * 3600, data.shape.radiusArcsec, accuracy: 1e-9)
      if let look = portrait.look {
        // Procedural: no texture, and the noise seed follows the exact identity, not the dense row.
        XCTAssertEqual(a.kind, .look(look)); XCTAssertNil(a.arms); XCTAssertEqual(a.memoryBytes, 0); XCTAssertEqual(a.uniforms.seed, b.uniforms.seed)
      }
      else if portrait.smooth != nil { XCTAssertEqual(a.kind, .gaussian); XCTAssertNil(a.arms); XCTAssertEqual(a.memoryBytes, 0); XCTAssertEqual(a.light.gaussians, data.gaussians) }
      if data.galaxy.nearby != nil { nearbyBytes += a.memoryBytes }
    }
    XCTAssertLessThan(nearbyBytes, 4 * 1_048_576)
    var unknown = try nearbyDetails(Self.reference.nearby)[0]; unknown.galaxy.targetId = "unmatched:portrait-fallback"
    let fallback = try model(unknown, .spiral)
    XCTAssertEqual(fallback.memoryBytes, 672000); XCTAssertNotNil(fallback.arms)
    for family in [GalaxyFamily.spiral, .barred, .elliptical, .lenticular, .irregular] {
      var d = unknown; d.spiral = nil; d.model?.family = family
      XCTAssertEqual(try model(d, .spiral).memoryBytes, 12000 * 7 * 4 * 2)
    }
  }
  func testVolumesDrawDeterministicallyWithTheWebsDrawCounts() throws {
    let target = OffscreenTarget(renderer: Self.renderer, width: 320, height: 320)
    // NGC 3982 carries a procedural look (one draw); an unmatched identity takes the generic spiral with arm points (two).
    var generic = Self.spiral; generic.galaxy.targetId = "unmatched:draw-count"
    let smooth = try model(Self.detail), portrait = try model(Self.spiral, .spiral), spiral = try model(generic, .spiral), m31 = try model(try nearbyDetails(Self.reference.nearby)[0], .spiral)
    let lmc = try model(try nearbyDetails(Self.reference.nearby).first { $0.cloud == .lmc }!, .spiral)
    let mw = try GalaxyModel(renderer: Self.renderer, milkyWay: Self.reference.milkyWay, fields: Self.fields)
    XCTAssertEqual(portrait.kind, .look(.ngc3982)); XCTAssertEqual(spiral.kind, .gaussian)
    for (m, expectedDraws) in [(smooth, 1), (portrait, 1), (spiral, 2), (m31, 1), (lmc, 2), (mw, 1)] {
      let direction = m.frame?.normal ?? m.milkyWayFrame!.normal
      let cam = camera(at: m.center + simd_normalize(direction * 0.8 + (m.frame?.major ?? m.milkyWayFrame!.major) * 0.6) * 6 * m.radius, lookingAt: m.center, near: m.radius * 0.01)
      m.update(camera: cam, heightPx: 320, focused: true)
      XCTAssertTrue(m.visible, "\(m.kind)")
      var frame = FrameState(uniforms: FrameUniforms.make(camera: cam, viewportHeightPx: 320, pointSizePx: 1.6, fadeRange: [1, 10], minOpacity: 0.005, depthCues: true, enlargePoints: false, hideUncertainLocal: true), camera: cam)
      frame.models = [m]
      let stats = target.render(frame)
      XCTAssertEqual(stats.draws, expectedDraws, "\(m.kind)"); XCTAssertEqual(stats.models, 1)
      let pixels = target.pixels()
      XCTAssertGreaterThan(OffscreenTarget.litPixels(pixels), 500, "\(m.kind) lights the view")
      _ = target.render(frame)
      XCTAssertEqual(OffscreenTarget.fnv1a(target.pixels()), OffscreenTarget.fnv1a(pixels), "\(m.kind) redraws identically")
    }
  }
}
