import XCTest
import Metal
import simd
import AtlasTestSupport
@testable import AtlasCore
@testable import AtlasRender
import AtlasShaderTypes

/// Offscreen checks on the M3 Max over the development subset: draw counts, lit pixels, and a GPU pick that resolves
/// to the exact dense id and target id.
final class PointPassTests: XCTestCase {
  static let manifest = try! Manifest.decode(RepoPaths.data("public/data/development/manifest.json"))

  func loadChunk(_ renderer: AtlasRenderer, _ node: CatalogNode) throws -> ChunkBuffers {
    let data = try AssetVerifier.verify(compressed: try RepoPaths.data("public/data/development/\(node.points.url)"), asset: node.points, kind: .points, count: node.storedCount)
    return try renderer.makeChunk(node: node, decoded: data, localChunk: false)
  }

  func testRootChunkDrawsOnceAndLightsPixels() throws {
    guard RepoPaths.exists("public/data/development/0.points.bin") else { throw XCTSkip("Development chunks not present locally") }
    let renderer = try AtlasRenderer()
    let node = Self.manifest.nodes[0]
    let chunk = try loadChunk(renderer, node)
    var camera = Camera(position: (node.min + node.max) / 2 + OVERVIEW_DIRECTION * simd_length(node.max - node.min) / 2 * 2.1, target: (node.min + node.max) / 2)
    camera.aspect = 1; camera.far = simd_length(node.max - node.min) * 30
    var frame = FrameState(uniforms: FrameUniforms.make(camera: camera, viewportHeightPx: 256, pointSizePx: 1.6, fadeRange: [1000, 10000], minOpacity: 0.005, depthCues: true, enlargePoints: false, hideUncertainLocal: true), camera: camera)
    var u = AtlasChunkUniforms(); u.origin = SIMD3<Float>(node.center - camera.position); u.worldOrigin = SIMD3<Float>(node.center); u.nodeCode = 1
    frame.chunks = [ChunkDraw(chunk: chunk, uniforms: u)]
    frame.markers = [MarkerDraw(origin: SIMD3<Float>(-camera.position), sizePx: 7, color: [0.45, 0.6, 0.68])]
    let target = OffscreenTarget(renderer: renderer, width: 256, height: 256)
    let stats = target.render(frame)
    XCTAssertEqual(stats.draws, 2); XCTAssertEqual(stats.points, node.storedCount)
    let pixels = target.pixels()
    let lit = OffscreenTarget.litPixels(pixels)
    XCTAssertGreaterThan(lit, 2000, "the overview should light thousands of pixels")
    XCTAssertLessThan(lit, 256 * 256)
    // Deterministic: a second render checksums identically.
    _ = target.render(frame)
    XCTAssertEqual(OffscreenTarget.fnv1a(target.pixels()), OffscreenTarget.fnv1a(pixels))
  }

  func testPickResolvesTheExactRowUnderTheCursor() throws {
    guard RepoPaths.exists("public/data/development/0.points.bin") else { throw XCTSkip("Development chunks not present locally") }
    let renderer = try AtlasRenderer()
    let node = Self.manifest.nodes[0]
    let chunk = try loadChunk(renderer, node)
    // Look straight at row 1234 from a distance where it is the only point near the centre.
    let row = 1234
    let p = chunk.positions
    let world = node.center + SIMD3<Double>(Double(p[row * 3]), Double(p[row * 3 + 1]), Double(p[row * 3 + 2]))
    var camera = Camera(position: world + OVERVIEW_DIRECTION * 0.5, target: world)
    camera.aspect = 1; camera.near = 0.001; camera.far = 100000
    var frame = FrameState(uniforms: FrameUniforms.make(camera: camera, viewportHeightPx: 512, pointSizePx: 7, fadeRange: [1000, 10000], minOpacity: 0.005, depthCues: true, enlargePoints: false, hideUncertainLocal: true), camera: camera)
    var u = AtlasChunkUniforms(); u.origin = SIMD3<Float>(node.center - camera.position); u.worldOrigin = SIMD3<Float>(node.center); u.nodeCode = 1
    frame.chunks = [ChunkDraw(chunk: chunk, uniforms: u)]
    let pass = PickPass(renderer: renderer)
    let window = PickPass.Window(x: 256, y: 256, drawableWidth: 512, drawableHeight: 512)
    let code = pass.pick(frame, window: window, drawableWidth: 512, drawableHeight: 512)
    XCTAssertEqual(code >> 16, 1)
    XCTAssertEqual(Int(code & 65535), row)
    let meta = try AssetVerifier.verify(compressed: try RepoPaths.data("public/data/development/\(node.metadata.url)"), asset: node.metadata, kind: .metadata, count: node.storedCount)
    let galaxy = try decodeGalaxy(meta, row: row, id: Int(chunk.ids[row]))
    XCTAssertEqual(simd_distance(galaxy.position, world), 0, accuracy: 0.001)
    // Nothing drawn, nothing picked.
    var empty = frame; empty.chunks = []
    XCTAssertEqual(pass.pick(empty, window: window, drawableWidth: 512, drawableHeight: 512), 0)
  }

  func testWindowProjectionMapsTheWindowCentreToNdcOrigin() {
    var camera = Camera(); camera.aspect = 2
    let window = PickPass.Window(x: 100, y: 40, drawableWidth: 400, drawableHeight: 200)
    let p = PickPass.windowProjection(camera.projection, window: window, drawableWidth: 400, drawableHeight: 200)
    // A view-space point that lands at the window centre in the full drawable lands at NDC (0,0) in the pick target.
    let cx = (Double(window.left) + 4.5) / 400 * 2 - 1, cy = (Double(window.bottom) + 4.5) / 200 * 2 - 1
    let d = 10.0
    let view = SIMD4<Float>(Float(cx * d * camera.tanHalfFov * 2), Float(cy * d * camera.tanHalfFov), Float(-d), 1)
    let clip = p * view
    XCTAssertEqual(clip.x / clip.w, 0, accuracy: 1e-4); XCTAssertEqual(clip.y / clip.w, 0, accuracy: 1e-4)
  }
}
