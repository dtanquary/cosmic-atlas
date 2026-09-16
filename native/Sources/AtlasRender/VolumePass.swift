import Foundation
import Metal
import simd
import AtlasCore
import AtlasShaderTypes

/// Pipelines for the galaxy volumes and their arm/knot points, drawn per visible model after the catalog points.
final class VolumePipelines {
  let gaussian: MTLRenderPipelineState
  let milkyWay: MTLRenderPipelineState
  let portrait: MTLRenderPipelineState
  let cloud: MTLRenderPipelineState
  let arms: MTLRenderPipelineState
  let densitySampler: MTLSamplerState
  let cloudSampler: MTLSamplerState

  init(device: MTLDevice, library: MTLLibrary) throws {
    func pipeline(_ fragment: String, constants: MTLFunctionConstantValues? = nil, additive: Bool) throws -> MTLRenderPipelineState {
      let d = MTLRenderPipelineDescriptor()
      d.vertexFunction = library.makeFunction(name: "atlas_volume_vertex")
      d.fragmentFunction = constants.map { try? library.makeFunction(name: fragment, constantValues: $0) } ?? library.makeFunction(name: fragment)
      d.colorAttachments[0].pixelFormat = AtlasRenderer.colorFormat
      d.colorAttachments[0].isBlendingEnabled = true
      if additive { // three.js AdditiveBlending: SRC_ALPHA / ONE
        d.colorAttachments[0].sourceRGBBlendFactor = .sourceAlpha; d.colorAttachments[0].destinationRGBBlendFactor = .one
        d.colorAttachments[0].sourceAlphaBlendFactor = .sourceAlpha; d.colorAttachments[0].destinationAlphaBlendFactor = .one
      } else { // premultiplied emission plus absorption: ONE / ONE_MINUS_SRC_ALPHA
        d.colorAttachments[0].sourceRGBBlendFactor = .one; d.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha
        d.colorAttachments[0].sourceAlphaBlendFactor = .one; d.colorAttachments[0].destinationAlphaBlendFactor = .oneMinusSourceAlpha
      }
      d.depthAttachmentPixelFormat = AtlasRenderer.depthFormat
      d.label = fragment
      return try device.makeRenderPipelineState(descriptor: d)
    }
    func diskConstants(size: Int, steps: Int, kind: Int) -> MTLFunctionConstantValues {
      let c = MTLFunctionConstantValues()
      var s = Int32(size), st = Int32(steps), k = Int32(kind)
      c.setConstantValue(&s, type: .int, index: 0); c.setConstantValue(&st, type: .int, index: 1); c.setConstantValue(&k, type: .int, index: 2)
      return c
    }
    gaussian = try pipeline("atlas_volume_gaussian", additive: true)
    milkyWay = try pipeline("atlas_volume_disk", constants: diskConstants(size: HOME_FIELD_SIZE, steps: HOME_RAY_STEPS, kind: 0), additive: false)
    portrait = try pipeline("atlas_volume_disk", constants: diskConstants(size: PORTRAIT_FIELD_SIZE, steps: PORTRAIT_RAY_STEPS, kind: 1), additive: false)
    cloud = try pipeline("atlas_volume_cloud", additive: true)
    let a = MTLRenderPipelineDescriptor()
    a.vertexFunction = library.makeFunction(name: "atlas_arms_vertex"); a.fragmentFunction = library.makeFunction(name: "atlas_arms_fragment")
    a.colorAttachments[0].pixelFormat = AtlasRenderer.colorFormat
    a.colorAttachments[0].isBlendingEnabled = true
    a.colorAttachments[0].sourceRGBBlendFactor = .sourceAlpha; a.colorAttachments[0].destinationRGBBlendFactor = .one
    a.colorAttachments[0].sourceAlphaBlendFactor = .sourceAlpha; a.colorAttachments[0].destinationAlphaBlendFactor = .one
    a.depthAttachmentPixelFormat = AtlasRenderer.depthFormat
    a.label = "atlas_arms"
    arms = try device.makeRenderPipelineState(descriptor: a)
    let ds = MTLSamplerDescriptor()
    ds.minFilter = .linear; ds.magFilter = .linear; ds.mipFilter = .linear; ds.maxAnisotropy = 4; ds.sAddressMode = .clampToEdge; ds.tAddressMode = .clampToEdge
    densitySampler = device.makeSamplerState(descriptor: ds)!
    let cs = MTLSamplerDescriptor()
    cs.minFilter = .linear; cs.magFilter = .linear; cs.sAddressMode = .clampToEdge; cs.tAddressMode = .clampToEdge; cs.rAddressMode = .clampToEdge
    cloudSampler = device.makeSamplerState(descriptor: cs)!
  }
}

extension AtlasRenderer {
  /// One volume quad (and one arm-point draw when the model has samples), like the model's scene on the web.
  func drawModel(_ model: GalaxyModel, with encoder: MTLRenderCommandEncoder, stats: inout DrawStats) {
    guard model.visible else { return }
    encoder.setDepthStencilState(depthOff)
    var u = model.uniforms
    switch model.kind {
    case .gaussian: encoder.setRenderPipelineState(volumes.gaussian)
    case .milkyWay: encoder.setRenderPipelineState(volumes.milkyWay); encoder.setFragmentTexture(model.density, index: 0); encoder.setFragmentSamplerState(volumes.densitySampler, index: 0)
    case .portrait: encoder.setRenderPipelineState(volumes.portrait); encoder.setFragmentTexture(model.density, index: 0); encoder.setFragmentSamplerState(volumes.densitySampler, index: 0)
    case .cloud: encoder.setRenderPipelineState(volumes.cloud); encoder.setFragmentTexture(model.cloud, index: 0); encoder.setFragmentSamplerState(volumes.cloudSampler, index: 0)
    }
    encoder.setVertexBytes(&u, length: MemoryLayout<AtlasVolumeUniforms>.stride, index: 0)
    encoder.setFragmentBytes(&u, length: MemoryLayout<AtlasVolumeUniforms>.stride, index: 0)
    encoder.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)
    stats.draws += 1; stats.models += 1
    if let arms = model.arms {
      var a = model.armUniforms
      encoder.setRenderPipelineState(volumes.arms)
      encoder.setVertexBuffer(arms.positions, offset: 0, index: 0); encoder.setVertexBuffer(arms.colors, offset: 0, index: 1); encoder.setVertexBuffer(arms.sizes, offset: 0, index: 2)
      encoder.setVertexBytes(&a, length: MemoryLayout<AtlasArmUniforms>.stride, index: 3)
      encoder.setFragmentBytes(&a, length: MemoryLayout<AtlasArmUniforms>.stride, index: 3)
      encoder.drawPrimitives(type: .point, vertexStart: 0, vertexCount: arms.count)
      stats.draws += 1
    }
  }
}
