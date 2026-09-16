import Foundation
import Metal
import simd
import AtlasCore
import AtlasShaderTypes

/// Owns the Metal device, shader library and pipeline states, and draws a `FrameState` into any render pass, so the
/// same code runs in the app's MTKView and offscreen in macOS tests. No tone mapping, no sRGB conversion, no MSAA.
public final class AtlasRenderer: @unchecked Sendable {
  public static let colorFormat = MTLPixelFormat.bgra8Unorm
  public static let pickFormat = MTLPixelFormat.rgba8Unorm
  public static let depthFormat = MTLPixelFormat.depth32Float
  public static let clearColor = MTLClearColor(red: 6.0 / 255, green: 9.0 / 255, blue: 13.0 / 255, alpha: 1)

  public let device: MTLDevice
  public let queue: MTLCommandQueue
  public let library: MTLLibrary
  let pointCatalog: MTLRenderPipelineState
  let pointPick: MTLRenderPipelineState
  let markers: MTLRenderPipelineState
  let line: MTLRenderPipelineState
  let overlayCMB: MTLRenderPipelineState
  let overlayRings: MTLRenderPipelineState
  let overlayFootprint: MTLRenderPipelineState
  let footprintSampler: MTLSamplerState
  let depthTestNoWrite: MTLDepthStencilState
  let depthTestWrite: MTLDepthStencilState
  let depthOff: MTLDepthStencilState
  /// A zero slot buffer shared by every chunk without resident models.
  public let sharedZeroSlots: MTLBuffer

  public init(device: MTLDevice? = MTLCreateSystemDefaultDevice()) throws {
    guard let device else { throw AtlasError("This device has no Metal GPU.") }
    self.device = device
    guard let queue = device.makeCommandQueue() else { throw AtlasError("Metal command queue unavailable.") }
    self.queue = queue
    let library = try device.makeDefaultLibrary(bundle: .module)
    self.library = library
    func pipeline(_ vertex: String, _ fragment: String, format: MTLPixelFormat, blend: Bool, depth: Bool = true) throws -> MTLRenderPipelineState {
      let d = MTLRenderPipelineDescriptor()
      d.vertexFunction = library.makeFunction(name: vertex); d.fragmentFunction = library.makeFunction(name: fragment)
      d.colorAttachments[0].pixelFormat = format
      if blend {
        // three.js NormalBlending: SRC_ALPHA / ONE_MINUS_SRC_ALPHA, unpremultiplied.
        d.colorAttachments[0].isBlendingEnabled = true
        d.colorAttachments[0].sourceRGBBlendFactor = .sourceAlpha; d.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha
        d.colorAttachments[0].sourceAlphaBlendFactor = .sourceAlpha; d.colorAttachments[0].destinationAlphaBlendFactor = .oneMinusSourceAlpha
      }
      d.depthAttachmentPixelFormat = depth ? Self.depthFormat : .invalid
      d.label = "\(vertex)/\(fragment)"
      return try device.makeRenderPipelineState(descriptor: d)
    }
    let pointCatalog = try pipeline("atlas_point_vertex", "atlas_point_fragment", format: Self.colorFormat, blend: true)
    let pointPick = try pipeline("atlas_point_vertex", "atlas_pick_fragment", format: Self.pickFormat, blend: false)
    let markers = try pipeline("atlas_marker_vertex", "atlas_marker_fragment", format: Self.colorFormat, blend: true)
    let line = try pipeline("atlas_line_vertex", "atlas_line_fragment", format: Self.colorFormat, blend: true)
    func depthState(_ compare: MTLCompareFunction, write: Bool) -> MTLDepthStencilState {
      let d = MTLDepthStencilDescriptor(); d.depthCompareFunction = compare; d.isDepthWriteEnabled = write
      return device.makeDepthStencilState(descriptor: d)!
    }
    self.pointCatalog = pointCatalog; self.pointPick = pointPick; self.markers = markers; self.line = line
    overlayCMB = try pipeline("atlas_overlay_vertex", "atlas_cmb_fragment", format: Self.colorFormat, blend: true)
    overlayRings = try pipeline("atlas_overlay_vertex", "atlas_rings_fragment", format: Self.colorFormat, blend: true)
    overlayFootprint = try pipeline("atlas_overlay_vertex", "atlas_footprint_fragment", format: Self.colorFormat, blend: true)
    let sampler = MTLSamplerDescriptor()
    sampler.sAddressMode = .repeat; sampler.tAddressMode = .clampToEdge; sampler.minFilter = .linear; sampler.magFilter = .linear
    footprintSampler = device.makeSamplerState(descriptor: sampler)!
    // Reversed-Z: nearer fragments have larger depth.
    depthTestNoWrite = depthState(.greater, write: false)
    depthTestWrite = depthState(.greater, write: true)
    depthOff = depthState(.always, write: false)
    let zero = device.makeBuffer(length: MAX_CHUNK_ROWS, options: .storageModeShared)!
    memset(zero.contents(), 0, MAX_CHUNK_ROWS)
    sharedZeroSlots = zero
  }

  /// Uploads one decoded chunk file into a shared buffer.
  public func makeChunk(node: CatalogNode, decoded: Data, localChunk: Bool) throws -> ChunkBuffers {
    let buffer = try decoded.withUnsafeBytes { raw -> MTLBuffer in
      guard let b = device.makeBuffer(bytes: raw.baseAddress!, length: raw.count, options: .storageModeShared) else { throw AtlasError("Out of GPU memory") }
      return b
    }
    buffer.label = "chunk \(node.id)"
    return ChunkBuffers(node: node, buffer: buffer, sharedZeroSlots: sharedZeroSlots, localChunk: localChunk)
  }

  /// The web's draw order for what exists so far: catalog chunks (depth test, no write), then annotations (depth off).
  @discardableResult
  public func draw(_ frame: FrameState, with encoder: MTLRenderCommandEncoder) -> DrawStats {
    var stats = DrawStats()
    drawOverlays(frame.overlays, camera: frame.camera, with: encoder, stats: &stats)
    var uniforms = frame.uniforms
    encoder.setVertexBytes(&uniforms, length: MemoryLayout<AtlasFrameUniforms>.stride, index: 2)
    encoder.setFragmentBytes(&uniforms, length: MemoryLayout<AtlasFrameUniforms>.stride, index: 2)
    encoder.setRenderPipelineState(pointCatalog)
    encoder.setDepthStencilState(depthTestNoWrite)
    for draw in frame.chunks {
      var chunk = draw.uniforms
      encoder.setVertexBuffer(draw.chunk.buffer, offset: ChunkBuffers.positionsOffset, index: 0)
      encoder.setVertexBuffer(draw.chunk.slots, offset: 0, index: 1)
      encoder.setVertexBytes(&chunk, length: MemoryLayout<AtlasChunkUniforms>.stride, index: 3)
      encoder.drawPrimitives(type: .point, vertexStart: 0, vertexCount: draw.chunk.node.storedCount)
      stats.draws += 1; stats.points += draw.chunk.node.storedCount
    }
    if !frame.markers.isEmpty || frame.line != nil {
      encoder.setDepthStencilState(depthOff)
      if let line = frame.line {
        encoder.setRenderPipelineState(self.line)
        var vertices = [SIMD3<Float>](repeating: .zero, count: 2); vertices[1] = line.end
        var chunk = AtlasChunkUniforms(); chunk.origin = line.origin
        encoder.setVertexBytes(&vertices, length: MemoryLayout<SIMD3<Float>>.stride * 2, index: 0)
        encoder.setVertexBytes(&chunk, length: MemoryLayout<AtlasChunkUniforms>.stride, index: 3)
        encoder.drawPrimitives(type: .line, vertexStart: 0, vertexCount: 2)
        stats.draws += 1
      }
      encoder.setRenderPipelineState(markers)
      for marker in frame.markers {
        var u = uniforms; u.pointSizePx = marker.sizePx
        var chunk = AtlasChunkUniforms(); chunk.origin = marker.origin
        var color = marker.color
        encoder.setVertexBytes(&u, length: MemoryLayout<AtlasFrameUniforms>.stride, index: 2)
        encoder.setVertexBytes(&chunk, length: MemoryLayout<AtlasChunkUniforms>.stride, index: 3)
        encoder.setFragmentBytes(&color, length: MemoryLayout<SIMD3<Float>>.stride, index: 0)
        encoder.drawPrimitives(type: .point, vertexStart: 0, vertexCount: 1)
        stats.draws += 1
      }
    }
    return stats
  }

  /// Draws a frame into a full pass (clear + draw) on a new command buffer; the caller commits.
  public func encode(_ frame: FrameState, to descriptor: MTLRenderPassDescriptor, on commandBuffer: MTLCommandBuffer) -> DrawStats {
    guard let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: descriptor) else { return DrawStats() }
    encoder.label = "atlas frame"
    let stats = draw(frame, with: encoder)
    encoder.endEncoding()
    return stats
  }
}
