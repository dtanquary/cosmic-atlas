import Foundation
import Metal
import simd
import AtlasCore
import AtlasShaderTypes

/// What the observer-centred overlays draw this frame: the CMB shell, up to eight lookback rings, the survey footprint.
public struct OverlayState {
  public var cmbShell = false
  public var cmbRadiusMpc = 1.0
  public var ringAngles: [Double] = []
  public var footprint: MTLTexture? = nil
  public var footprintRadiusMpc = 1.0
  public init() {}
}

extension AtlasRenderer {
  static func overlayUniforms(camera: Camera, observer: SIMD3<Double>, rings: [Double] = []) -> AtlasOverlayUniforms {
    var u = AtlasOverlayUniforms()
    let m = simd_double3x3(camera.orientation)
    u.rotation = simd_float3x3(columns: (SIMD3<Float>(m.columns.0), SIMD3<Float>(m.columns.1), SIMD3<Float>(m.columns.2)))
    u.lens = SIMD2<Float>(Float(camera.tanHalfFov * camera.aspect), Float(camera.tanHalfFov))
    u.observer = SIMD3<Float>(observer)
    let d = simd_length(camera.position)
    u.toOrigin = d > 0 ? SIMD3<Float>(-camera.position / d) : SIMD3<Float>(0, 0, 1)
    withUnsafeMutableBytes(of: &u.ringAngle) { raw in let p = raw.bindMemory(to: Float.self); for i in 0..<8 { p[i] = i < rings.count ? Float(rings[i]) : 0 } }
    u.ringCount = UInt32(min(rings.count, 8))
    return u
  }

  /// The web's first three draws: shell, rings, footprint; zero draws for anything disabled.
  func drawOverlays(_ overlays: OverlayState, camera: Camera, with encoder: MTLRenderCommandEncoder, stats: inout DrawStats) {
    encoder.setDepthStencilState(depthOff)
    if overlays.cmbShell {
      var u = Self.overlayUniforms(camera: camera, observer: camera.position / overlays.cmbRadiusMpc)
      encoder.setRenderPipelineState(overlayCMB)
      encoder.setFragmentBytes(&u, length: MemoryLayout<AtlasOverlayUniforms>.stride, index: 0)
      encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3); stats.draws += 1
    }
    if !overlays.ringAngles.isEmpty {
      var u = Self.overlayUniforms(camera: camera, observer: .zero, rings: overlays.ringAngles)
      encoder.setRenderPipelineState(overlayRings)
      encoder.setFragmentBytes(&u, length: MemoryLayout<AtlasOverlayUniforms>.stride, index: 0)
      encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3); stats.draws += 1
    }
    if let mask = overlays.footprint, overlays.footprintRadiusMpc > 0 {
      var u = Self.overlayUniforms(camera: camera, observer: camera.position / overlays.footprintRadiusMpc)
      encoder.setRenderPipelineState(overlayFootprint)
      encoder.setFragmentBytes(&u, length: MemoryLayout<AtlasOverlayUniforms>.stride, index: 0)
      encoder.setFragmentTexture(mask, index: 0)
      encoder.setFragmentSamplerState(footprintSampler, index: 0)
      encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3); stats.draws += 1
    }
  }

  /// 720×360 R8 occupancy grid; RA wraps, Dec clamps.
  public func makeFootprintTexture(cells: [UInt8]) -> MTLTexture? {
    let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .r8Unorm, width: FOOTPRINT_WIDTH, height: FOOTPRINT_HEIGHT, mipmapped: false)
    d.usage = [.shaderRead]; d.storageMode = .shared
    guard let texture = device.makeTexture(descriptor: d) else { return nil }
    cells.withUnsafeBytes { texture.replace(region: MTLRegionMake2D(0, 0, FOOTPRINT_WIDTH, FOOTPRINT_HEIGHT), mipmapLevel: 0, withBytes: $0.baseAddress!, bytesPerRow: FOOTPRINT_WIDTH) }
    texture.label = "survey footprint"
    return texture
  }
}
