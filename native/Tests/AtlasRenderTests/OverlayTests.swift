import XCTest
import Metal
import simd
import AtlasTestSupport
@testable import AtlasCore
@testable import AtlasRender

/// The three reference overlays: exactly one draw each when enabled, none when disabled, and the footprint tints only surveyed sky.
final class OverlayTests: XCTestCase {
  static let reference = try! ReferenceData(directory: RepoPaths.file("src/data"))
  static let manifest = try! Manifest.decode(RepoPaths.data("public/data/dr1/manifest.json"))

  func frame(camera: Camera) -> FrameState {
    FrameState(uniforms: FrameUniforms.make(camera: camera, viewportHeightPx: 256, pointSizePx: 1.6, fadeRange: [1000, 10000], minOpacity: 0.005, depthCues: true, enlargePoints: false, hideUncertainLocal: true), camera: camera)
  }

  func testDrawCountsFollowTheToggles() throws {
    let renderer = try AtlasRenderer(), target = OffscreenTarget(renderer: renderer, width: 256, height: 256)
    let cmb = Self.reference.cmbRadiusMpc
    var camera = Camera(position: OVERVIEW_DIRECTION * cmb * 3, target: .zero); camera.aspect = 1; camera.far = cmb * 12
    var f = frame(camera: camera)
    XCTAssertEqual(target.render(f).draws, 0)
    let dark = OffscreenTarget.litPixels(target.pixels())
    XCTAssertEqual(dark, 0)
    f.overlays.cmbShell = true; f.overlays.cmbRadiusMpc = cmb
    XCTAssertEqual(target.render(f).draws, 1)
    XCTAssertGreaterThan(OffscreenTarget.litPixels(target.pixels()), 1000, "the shell seen from outside lights its disc")
    let rings = Lookback(Self.reference).chooseRings(dOriginMpc: cmb * 3, fovDeg: 50, aspect: 1, heightPx: 256)
    f.overlays.ringAngles = rings.map(\.angle)
    XCTAssertEqual(target.render(f).draws, rings.isEmpty ? 1 : 2)
    let cells = try decodeFootprint(try JSONDecoder().decode(SurveyFootprintData.self, from: RepoPaths.data("public/data/survey-footprint.json")), sourceSha256: Self.manifest.source.sha256, acceptedRows: Self.manifest.source.acceptedRows)
    f.overlays.footprint = renderer.makeFootprintTexture(cells: cells); f.overlays.footprintRadiusMpc = Self.manifest.maxDistanceMpc
    XCTAssertEqual(target.render(f).draws, rings.isEmpty ? 2 : 3)
    // Checksums are deterministic across redraws.
    let first = OffscreenTarget.fnv1a(target.pixels()); _ = target.render(f)
    XCTAssertEqual(OffscreenTarget.fnv1a(target.pixels()), first)
  }

  func testFootprintTintsSurveyedSkyOnly() throws {
    let renderer = try AtlasRenderer(), target = OffscreenTarget(renderer: renderer, width: 64, height: 64)
    let cells = try decodeFootprint(try JSONDecoder().decode(SurveyFootprintData.self, from: RepoPaths.data("public/data/survey-footprint.json")), sourceSha256: Self.manifest.source.sha256, acceptedRows: Self.manifest.source.acceptedRows)
    let mask = renderer.makeFootprintTexture(cells: cells)
    func centre(raDeg: Double, decDeg: Double) -> (b: UInt8, g: UInt8, r: UInt8) {
      let ra = raDeg * .pi / 180, dec = decDeg * .pi / 180
      let direction = SIMD3<Double>(cos(dec) * cos(ra), cos(dec) * sin(ra), sin(dec))
      // From just outside the observer looking along the sky direction; the shell sits at the catalog radius.
      var camera = Camera(position: direction * 0.001, target: direction); camera.aspect = 1; camera.far = Self.manifest.maxDistanceMpc * 12
      var f = frame(camera: camera)
      f.overlays.footprint = mask; f.overlays.footprintRadiusMpc = Self.manifest.maxDistanceMpc
      _ = target.render(f)
      let p = target.pixels(), i = (32 * 64 + 32) * 4
      return (p[i], p[i + 1], p[i + 2])
    }
    let surveyed = centre(raDeg: 149.75, decDeg: 1.25), dark = centre(raDeg: 60, decDeg: -70)
    XCTAssertGreaterThan(surveyed.g, 40, "COSMOS direction is tinted")
    XCTAssertEqual(dark.g, 9, "unsurveyed sky keeps the clear colour: not surveyed here, not confirmed empty")
  }
}
