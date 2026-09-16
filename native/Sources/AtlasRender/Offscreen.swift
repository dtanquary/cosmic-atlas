import Foundation
import Metal
import AtlasCore

/// A colour + depth target for rendering without a view: macOS tests and pixel checksums.
public final class OffscreenTarget {
  public let renderer: AtlasRenderer
  public let color: MTLTexture
  public let depth: MTLTexture
  public let width: Int, height: Int
  public init(renderer: AtlasRenderer, width: Int, height: Int) {
    self.renderer = renderer; self.width = width; self.height = height
    let c = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: AtlasRenderer.colorFormat, width: width, height: height, mipmapped: false)
    c.usage = [.renderTarget, .shaderRead]; c.storageMode = .shared
    color = renderer.device.makeTexture(descriptor: c)!
    let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: AtlasRenderer.depthFormat, width: width, height: height, mipmapped: false)
    d.usage = [.renderTarget]; d.storageMode = .private
    depth = renderer.device.makeTexture(descriptor: d)!
  }
  public var passDescriptor: MTLRenderPassDescriptor {
    let pass = MTLRenderPassDescriptor()
    pass.colorAttachments[0].texture = color; pass.colorAttachments[0].loadAction = .clear; pass.colorAttachments[0].storeAction = .store
    pass.colorAttachments[0].clearColor = AtlasRenderer.clearColor
    pass.depthAttachment.texture = depth; pass.depthAttachment.loadAction = .clear; pass.depthAttachment.clearDepth = 0; pass.depthAttachment.storeAction = .dontCare
    return pass
  }
  /// Draws one frame and waits for it.
  public func render(_ frame: FrameState) -> DrawStats {
    guard let commandBuffer = renderer.queue.makeCommandBuffer() else { return DrawStats() }
    let stats = renderer.encode(frame, to: passDescriptor, on: commandBuffer)
    commandBuffer.commit(); commandBuffer.waitUntilCompleted()
    return stats
  }
  public func pixels() -> [UInt8] {
    var bytes = [UInt8](repeating: 0, count: width * height * 4)
    color.getBytes(&bytes, bytesPerRow: width * 4, from: MTLRegionMake2D(0, 0, width, height), mipmapLevel: 0)
    return bytes
  }
  /// FNV-1a over the BGRA bytes, the same checksum the web diagnostics pin.
  public static func fnv1a(_ bytes: [UInt8]) -> UInt32 {
    var hash: UInt32 = 0x811c9dc5
    for b in bytes { hash ^= UInt32(b); hash = hash &* 0x01000193 }
    return hash
  }
  /// Pixels that differ from the clear colour.
  public static func litPixels(_ bytes: [UInt8]) -> Int {
    var lit = 0
    var i = 0
    while i < bytes.count { if bytes[i] != 13 || bytes[i + 1] != 9 || bytes[i + 2] != 6 { lit += 1 }; i += 4 }
    return lit
  }
}
