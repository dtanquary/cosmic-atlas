import Foundation
import Metal
import simd
import AtlasCore
import AtlasShaderTypes

/// GPU ID picking (src/explorer.ts pick): the web renders the full canvas through a 9×9 scissor; here a dedicated 9×9
/// target with an off-centre projection covers exactly the same pixels, and the bytes come back through shared storage.
public final class PickPass {
  public static let size = 9
  let renderer: AtlasRenderer
  let color: MTLTexture
  let depth: MTLTexture
  public init(renderer: AtlasRenderer) {
    self.renderer = renderer
    let c = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: AtlasRenderer.pickFormat, width: Self.size, height: Self.size, mipmapped: false)
    c.usage = [.renderTarget]; c.storageMode = .shared
    color = renderer.device.makeTexture(descriptor: c)!
    let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: AtlasRenderer.depthFormat, width: Self.size, height: Self.size, mipmapped: false)
    d.usage = [.renderTarget]; d.storageMode = .private
    depth = renderer.device.makeTexture(descriptor: d)!
  }

  /// The pixel window the web reads: x, y in physical pixels with a bottom-left origin.
  public struct Window: Sendable, Equatable {
    public var x: Int, y: Int, left: Int, bottom: Int, w: Int, h: Int
    public init(x: Int, y: Int, drawableWidth: Int, drawableHeight: Int) {
      self.x = x; self.y = y
      left = max(0, x - 4); bottom = max(0, y - 4)
      w = min(PickPass.size, drawableWidth - left); h = min(PickPass.size, drawableHeight - bottom)
    }
  }

  /// Post-projection remap so the 9×9 target sees exactly the window's pixels of the full drawable.
  public static func windowProjection(_ projection: simd_float4x4, window: Window, drawableWidth: Int, drawableHeight: Int) -> simd_float4x4 {
    let sx = Float(drawableWidth) / Float(size), sy = Float(drawableHeight) / Float(size)
    let cx = (Float(window.left) + Float(size) / 2) / Float(drawableWidth) * 2 - 1
    let cy = (Float(window.bottom) + Float(size) / 2) / Float(drawableHeight) * 2 - 1
    var remap = matrix_identity_float4x4
    remap.columns.0.x = sx; remap.columns.1.y = sy
    remap.columns.3.x = -cx * sx; remap.columns.3.y = -cy * sy
    return remap * projection
  }

  /// Renders the pick pass and returns the nearest non-zero code to the tap, or 0. Blocks until the GPU finishes.
  public func pick(_ frame: FrameState, window: Window, drawableWidth: Int, drawableHeight: Int) -> UInt32 {
    var uniforms = frame.uniforms
    uniforms.projection = Self.windowProjection(frame.uniforms.projection, window: window, drawableWidth: drawableWidth, drawableHeight: drawableHeight)
    let pass = MTLRenderPassDescriptor()
    pass.colorAttachments[0].texture = color; pass.colorAttachments[0].loadAction = .clear; pass.colorAttachments[0].storeAction = .store
    pass.colorAttachments[0].clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
    pass.depthAttachment.texture = depth; pass.depthAttachment.loadAction = .clear; pass.depthAttachment.clearDepth = 0; pass.depthAttachment.storeAction = .dontCare
    guard let commandBuffer = renderer.queue.makeCommandBuffer(), let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: pass) else { return 0 }
    encoder.label = "atlas pick"
    encoder.setRenderPipelineState(renderer.pointPick)
    encoder.setDepthStencilState(renderer.depthTestWrite)
    encoder.setVertexBytes(&uniforms, length: MemoryLayout<AtlasFrameUniforms>.stride, index: 2)
    for draw in frame.chunks {
      var chunk = draw.uniforms
      encoder.setVertexBuffer(draw.chunk.buffer, offset: ChunkBuffers.positionsOffset, index: 0)
      encoder.setVertexBuffer(draw.chunk.slots, offset: 0, index: 1)
      encoder.setVertexBytes(&chunk, length: MemoryLayout<AtlasChunkUniforms>.stride, index: 3)
      encoder.drawPrimitives(type: .point, vertexStart: 0, vertexCount: draw.chunk.node.storedCount)
    }
    if let nearby = frame.nearby {
      var u = nearby.uniforms, chunk = nearby.draw.uniforms
      u.projection = uniforms.projection; u.pointSizePx = uniforms.pointSizePx
      encoder.setVertexBytes(&u, length: MemoryLayout<AtlasFrameUniforms>.stride, index: 2)
      encoder.setVertexBuffer(nearby.draw.chunk.buffer, offset: ChunkBuffers.positionsOffset, index: 0)
      encoder.setVertexBuffer(nearby.draw.chunk.slots, offset: 0, index: 1)
      encoder.setVertexBytes(&chunk, length: MemoryLayout<AtlasChunkUniforms>.stride, index: 3)
      encoder.drawPrimitives(type: .point, vertexStart: 0, vertexCount: nearby.draw.chunk.node.storedCount)
    }
    encoder.endEncoding()
    commandBuffer.commit(); commandBuffer.waitUntilCompleted()
    var pixels = [UInt8](repeating: 0, count: Self.size * Self.size * 4)
    color.getBytes(&pixels, bytesPerRow: Self.size * 4, from: MTLRegionMake2D(0, 0, Self.size, Self.size), mipmapLevel: 0)
    var code: UInt32 = 0, best = Int.max
    for row in 0..<Self.size {
      for col in 0..<Self.size {
        let i = (row * Self.size + col) * 4
        let value = UInt32(pixels[i]) | UInt32(pixels[i + 1]) << 8 | UInt32(pixels[i + 2]) << 16 | UInt32(pixels[i + 3]) << 24
        // Texture rows run top-down; the window's rows run bottom-up like the web's readback.
        let px = window.left + col, py = window.bottom + (Self.size - 1 - row)
        let distance = (px - window.x) * (px - window.x) + (py - window.y) * (py - window.y)
        if value != 0 && distance < best { code = value; best = distance }
      }
    }
    return code
  }
}
