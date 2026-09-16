import Foundation
import Metal
import simd
import AtlasCore
import AtlasShaderTypes

public struct DrawStats: Sendable, Equatable {
  public var draws = 0, points = 0, models = 0
  public init() {}
}

/// One resident point chunk on the GPU: the decoded file (header, planar positions, ids) in a shared buffer plus a
/// byte per row naming the resident model slot (0 = none).
public final class ChunkBuffers {
  public let node: CatalogNode
  public let buffer: MTLBuffer
  public private(set) var slots: MTLBuffer
  public private(set) var hasOwnSlots = false
  public var used: TimeInterval = 0
  public var modelRows: [Int] = []
  public var lookup = ModelRows(limit: MODEL_LIMIT)
  public let localChunk: Bool
  private let shared: MTLBuffer
  public static let positionsOffset = BINARY_HEADER_BYTES
  public var idsOffset: Int { BINARY_HEADER_BYTES + node.storedCount * 12 }

  public init(node: CatalogNode, buffer: MTLBuffer, sharedZeroSlots: MTLBuffer, localChunk: Bool) {
    self.node = node; self.buffer = buffer; self.slots = sharedZeroSlots; self.shared = sharedZeroSlots; self.localChunk = localChunk
  }
  public var ids: UnsafeBufferPointer<UInt32> {
    UnsafeBufferPointer(start: buffer.contents().advanced(by: idsOffset).assumingMemoryBound(to: UInt32.self), count: node.storedCount)
  }
  public var positions: UnsafeBufferPointer<Float> {
    UnsafeBufferPointer(start: buffer.contents().advanced(by: Self.positionsOffset).assumingMemoryBound(to: Float.self), count: node.storedCount * 3)
  }
  /// Managed bytes, as the web counts them: decoded buffer plus the slot bytes.
  public var memoryBytes: Int { buffer.length + (hasOwnSlots ? slots.length : 0) + lookup.memoryBytes }
  /// ponytail: slots are patched in place; a torn read costs one frame. Triple-buffer if it ever shows.
  public func setSlot(row: Int, value: UInt8) {
    if !hasOwnSlots {
      if value == 0 { return }
      guard let own = buffer.device.makeBuffer(length: node.storedCount, options: .storageModeShared) else { return }
      memset(own.contents(), 0, node.storedCount); own.label = "slots \(node.id)"
      slots = own; hasOwnSlots = true
    }
    slots.contents().advanced(by: row).storeBytes(of: value, as: UInt8.self)
  }
}

public struct ChunkDraw {
  public var chunk: ChunkBuffers
  public var uniforms: AtlasChunkUniforms
  public init(chunk: ChunkBuffers, uniforms: AtlasChunkUniforms) { self.chunk = chunk; self.uniforms = uniforms }
}
public struct MarkerDraw: Sendable {
  public var origin: SIMD3<Float>, sizePx: Float, color: SIMD3<Float>
  public init(origin: SIMD3<Float>, sizePx: Float, color: SIMD3<Float>) { self.origin = origin; self.sizePx = sizePx; self.color = color }
}
public struct LineDraw: Sendable {
  public var origin: SIMD3<Float>, end: SIMD3<Float>
  public init(origin: SIMD3<Float>, end: SIMD3<Float>) { self.origin = origin; self.end = end }
}

/// Everything one frame draws. The session builds it; tests can build it by hand.
public struct FrameState {
  public var uniforms: AtlasFrameUniforms
  public var chunks: [ChunkDraw] = []
  public var markers: [MarkerDraw] = []
  public var line: LineDraw? = nil
  public init(uniforms: AtlasFrameUniforms) { self.uniforms = uniforms }
}

public enum FrameUniforms {
  /// The shared per-frame block: camera matrices, point size, fading and the 12 model slots.
  public static func make(camera: Camera, viewportHeightPx: Double, pointSizePx: Double, fadeRange: SIMD2<Double>, minOpacity: Double,
                          depthCues: Bool, enlargePoints: Bool, hideUncertainLocal: Bool,
                          detailOrigins: [SIMD3<Float>] = [], detailMix: [Float] = []) -> AtlasFrameUniforms {
    var u = AtlasFrameUniforms()
    u.projection = camera.projection
    u.viewRotation = camera.viewRotation
    u.fadeRange = SIMD2<Float>(Float(fadeRange.x), Float(fadeRange.y))
    u.viewportHeightPx = Float(viewportHeightPx)
    u.pointSizePx = Float(pointSizePx)
    u.minOpacity = Float(minOpacity)
    u.depthCues = depthCues ? 1 : 0
    u.enlargePoints = enlargePoints ? 1 : 0
    u.hideUncertainLocal = hideUncertainLocal ? 1 : 0
    withUnsafeMutableBytes(of: &u.detailOrigins) { raw in
      let p = raw.bindMemory(to: SIMD3<Float>.self)
      for i in 0..<MODEL_LIMIT { p[i] = i < detailOrigins.count ? detailOrigins[i] : .zero }
    }
    withUnsafeMutableBytes(of: &u.detailMix) { raw in
      let p = raw.bindMemory(to: Float.self)
      for i in 0..<MODEL_LIMIT { p[i] = i < detailMix.count ? detailMix[i] : 0 }
    }
    return u
  }
}
