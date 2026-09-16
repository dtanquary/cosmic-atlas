import Foundation
import Metal
import AtlasCore
import AtlasShaderTypes

/// Owns the Metal device, shader library and pipeline states. Draws a `FrameState` into any render pass,
/// so the same code runs in the app's MTKView and in offscreen macOS tests.
public final class AtlasRenderer: @unchecked Sendable {
  public let device: MTLDevice
  public let queue: MTLCommandQueue
  public let library: MTLLibrary

  public init(device: MTLDevice? = MTLCreateSystemDefaultDevice()) throws {
    guard let device else { throw AtlasError("This device has no Metal GPU.") }
    self.device = device
    guard let queue = device.makeCommandQueue() else { throw AtlasError("Metal command queue unavailable.") }
    self.queue = queue
    self.library = try device.makeDefaultLibrary(bundle: .module)
  }
}
