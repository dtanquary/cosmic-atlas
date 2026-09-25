import Foundation
import Metal
import simd
import AtlasCore
import AtlasShaderTypes

/// One galaxy volume on the GPU (GalaxyVolume in src/galaxy-detail.ts): the analytic Gaussian body, a procedural look,
/// the Milky Way (its look plus the home density march) or a Magellanic cloud, plus optional arm/knot light samples.
/// ponytail: mutated only on the main actor (session) or in a single test; unchecked rather than locked.
public final class GalaxyModel: @unchecked Sendable {
  public enum Kind: Equatable { case gaussian, milkyWay, look(GalaxyLookKey), cloud(MagellanicCloudKind) }
  public let data: GalaxyDetailData?
  public let appearance: GalaxyAppearance
  public let light: GalaxyLight
  public let frame: GalaxyFrame?
  public let milkyWayFrame: MilkyWayFrame?
  public let radius: Double
  public let center: SIMD3<Double>
  public let kind: Kind
  public private(set) var blend = 0.0
  public private(set) var visible = false
  var uniforms = AtlasVolumeUniforms()
  let toModel: simd_double3x3
  let thickness: Double
  let density: MTLTexture?
  let cloud: MTLTexture?
  struct Arms { let positions: MTLBuffer, colors: MTLBuffer, sizes: MTLBuffer, count: Int, bytes: Int }
  let arms: Arms?
  var armUniforms = AtlasArmUniforms()
  /// Model row/slot bookkeeping lives on the session; this is the identity slotted points look up.
  public var id: Int { data?.galaxy.id ?? Int.min }

  /// A measured catalog observation or a nearby entry.
  public convenience init(renderer: AtlasRenderer, data: GalaxyDetailData, appearance: GalaxyAppearance, profile: SpiralProfile, fields: FieldCache) throws {
    let resolved = try resolveModel(data, appearance: appearance, profile: profile)
    let axes = (major: resolved.frame.major, minor: resolved.frame.minor, normal: resolved.frame.normal, thickness: resolved.frame.thickness, q: resolved.frame.q)
    try self.init(renderer: renderer, data: data, appearance: appearance, light: resolved.light, frame: resolved.frame, milkyWay: nil, axes: axes, radius: resolved.radius, center: resolved.center, fields: fields)
  }
  /// The Milky Way reference: literature-based frame, no catalog identity.
  public convenience init(renderer: AtlasRenderer, milkyWay reference: MilkyWayReference, fields: FieldCache) throws {
    let frame = MilkyWayFrame(reference)
    var light = GalaxyLight(family: .barred, gaussians: [], spiral: nil, cloud: nil, seed: 20260911, knotCount: nil, exposure: nil, colors: nil)
    light.look = .init(key: .milkyWay, seed: lookSeed("milky-way"))
    try self.init(renderer: renderer, data: nil, appearance: .catalog, light: light, frame: nil, milkyWay: frame, axes: (frame.major, frame.minor, frame.normal, frame.thickness, frame.q), radius: frame.radius, center: frame.center, fields: fields)
  }

  init(renderer: AtlasRenderer, data: GalaxyDetailData?, appearance: GalaxyAppearance, light: GalaxyLight, frame: GalaxyFrame?, milkyWay: MilkyWayFrame?,
       axes: (major: SIMD3<Double>, minor: SIMD3<Double>, normal: SIMD3<Double>, thickness: Double, q: Double), radius: Double, center: SIMD3<Double>, fields: FieldCache) throws {
    self.data = data; self.appearance = appearance; self.light = light; self.frame = frame; self.milkyWayFrame = milkyWay; self.radius = radius; self.center = center
    thickness = axes.thickness
    // three.js Matrix3.set is row-major: rows are major, minor and normal/thickness.
    toModel = simd_double3x3(rows: [axes.major, axes.minor, axes.normal / axes.thickness])
    let family = light.family
    let disk = light.colors?.disk ?? (family == .elliptical ? RGB(0.72, 0.58, 0.46) : family == .irregular ? RGB(0.42, 0.63, 0.86) : RGB(0.48, 0.68, 0.82))
    let core = light.colors?.core ?? (family == .irregular ? RGB(0.86, 0.91, 1) : family == .elliptical ? RGB(1, 0.91, 0.75) : RGB(1, 0.93, 0.76))
    uniforms.bounds = SIMD4(-1, -1, 1, 1)
    uniforms.toModel = simd_float3x3(columns: (SIMD3<Float>(toModel.columns.0), SIMD3<Float>(toModel.columns.1), SIMD3<Float>(toModel.columns.2)))
    uniforms.diskColor = disk.float3; uniforms.coreColor = core.float3
    uniforms.emissionColor = (light.colors?.emission ?? RGB(0.86, 0.57, 0.64)).float3
    withUnsafeMutableBytes(of: &uniforms.gaussians) { raw in
      let p = raw.bindMemory(to: SIMD2<Float>.self)
      for i in 0..<20 { p[i] = i < light.gaussians.count ? SIMD2(Float(light.gaussians[i].sigmaRe), Float(light.gaussians[i].peak)) : SIMD2(1, 0) }
    }
    uniforms.normalization = Float(axes.q / axes.thickness)
    uniforms.exposure = Float(light.exposure ?? (family == .irregular ? 0.2 : 0.55))
    uniforms.palette = family == .elliptical ? 1 : family == .irregular ? 2 : 0
    uniforms.thickness = Float(axes.thickness)
    var kind = Kind.gaussian
    var density: MTLTexture? = nil, cloud: MTLTexture? = nil
    if let look = light.look, let l = galaxyLooks[look.key] {
      kind = .look(look.key)
      uniforms.dustStrength = 1
      uniforms.shape = SIMD4(Float(l.arms), Float(1 / tan(l.pitchDegrees * .pi / 180)), Float(l.bar), Float(l.bulge))
      uniforms.arms = SIMD4(Float(l.ragged), Float(l.dust), Float(l.minor), Float(l.hii))
      uniforms.pattern = SIMD4(Float(l.phaseDegrees * .pi / 180), Float(l.spin), Float(l.extent), Float(l.unitsPerRe))
      uniforms.coreColor = l.core.float3; uniforms.diskColor = l.disc.float3; uniforms.youngColor = l.young.float3; uniforms.emissionColor = l.knots.float3
      uniforms.seed = SIMD2<Float>(look.seed); uniforms.pixelRatio = 1
    }
    if milkyWay != nil {
      // The look from outside; the home density march inside the disc.
      kind = .milkyWay
      density = try fields.milkyWayTexture(renderer)
      let phase = Double.pi - fields.milkyWay.barAngleDeg * .pi / 180
      uniforms.barDirection = SIMD2(Float(cos(phase)), Float(sin(phase)))
      uniforms.barRadius = Float(fields.milkyWay.barHalfLengthMpc / fields.milkyWay.radiusMpc)
      uniforms.dustStrength = 0.9
    } else if let cloudKind = light.cloud {
      kind = .cloud(cloudKind)
      cloud = try fields.cloudTexture(renderer, cloudKind)
      uniforms.dustStrength = 0.85
      uniforms.cloudKind = cloudKind == .lmc ? 0 : 1
    }
    self.kind = kind; self.density = density; self.cloud = cloud
    // Arm/knot samples: spiral recipes, irregular clumps, or the cloud's own field samples.
    var samples: GalaxySamples? = nil
    if let cloudKind = light.cloud {
      let field = fields.cloudField(cloudKind)
      let s = cloudLightSamples(cloudKind, field: field, count: light.knotCount ?? 4096)
      var positions = s.positions, colors = [Float](repeating: 0, count: s.positions.count)
      let emission = light.colors?.emission ?? RGB(0.86, 0.57, 0.64)
      for i in 0..<s.sizes.count {
        positions[i * 3 + 2] *= Float(axes.thickness)
        let c = s.emission[i] != 0 ? emission : disk
        colors[i * 3] = Float(c.r); colors[i * 3 + 1] = Float(c.g); colors[i * 3 + 2] = Float(c.b)
      }
      samples = GalaxySamples(positions: positions, colors: colors, sizes: s.sizes)
    } else if let spiral = light.spiral {
      samples = spiralSamples(spiral, count: light.knotCount ?? 24000, palette: light.colors)
    } else if family == .irregular {
      samples = irregularSamples(seed: light.seed, count: light.knotCount ?? 12000, palette: light.colors)
    }
    if var s = samples, s.sizes.count > 0 {
      for i in stride(from: 0, to: s.positions.count, by: 3) {
        let p = (axes.major * Double(s.positions[i]) + axes.minor * Double(s.positions[i + 1]) + axes.normal * Double(s.positions[i + 2])) * radius
        s.positions[i] = Float(p.x); s.positions[i + 1] = Float(p.y); s.positions[i + 2] = Float(p.z)
      }
      let device = renderer.device
      func buffer(_ values: [Float]) throws -> MTLBuffer { try values.withUnsafeBytes { raw in guard let b = device.makeBuffer(bytes: raw.baseAddress!, length: raw.count, options: .storageModeShared) else { throw AtlasError("Out of GPU memory") }; return b } }
      arms = Arms(positions: try buffer(s.positions), colors: try buffer(s.colors), sizes: try buffer(s.sizes), count: s.sizes.count, bytes: (s.positions.count + s.colors.count + s.sizes.count) * 4 * 2)
    } else { arms = nil }
  }

  /// Managed bytes as the web counts them: home texture with mips, cloud field ×2, arm buffers ×2.
  public var memoryBytes: Int {
    var bytes = 0
    if case .milkyWay = kind { bytes += HOME_FIELD_SIZE * HOME_FIELD_SIZE * 4 + 4 * (4 * HOME_FIELD_SIZE * HOME_FIELD_SIZE - 1) / 3 }
    if cloud != nil { bytes += CLOUD_FIELD_SIZE * CLOUD_FIELD_SIZE * CLOUD_FIELD_SIZE * 2 * 2 }
    if let arms { bytes += arms.bytes }
    return bytes
  }

  /// Per-frame visibility, crossfade and uniforms (GalaxyVolume.update). `heightPx` is the CSS-pixel viewport height.
  public func update(camera: Camera, heightPx: Double, pixelRatio: Double = 1, focused: Bool = false, display: ModelDisplay = .automatic, presence: Double = 1) {
    let relative = center - camera.position
    let distance = simd_length(relative), tanHalf = camera.tanHalfFov
    blend = modelBlend(radius * heightPx / (2 * tanHalf * max(distance, 1e-10)), shortSide: min(heightPx, heightPx * camera.aspect), focused: focused, display: display) * presence
    visible = blend > 0
    if !visible { return }
    let view = simd_double3x3(camera.orientation.inverse) * relative
    let z = -view.z, bound = 8 * radius
    if z < -bound { visible = false; blend = 0; return }
    var bounds = SIMD4<Float>(-1, -1, 1, 1)
    if z > bound {
      // Conservative projected bounds: include the sphere's near and far depths, including off-axis centres.
      func edge(_ v: Double, _ aspect: Double) -> (Double, Double) {
        let values = [(v - bound) / (z - bound), (v - bound) / (z + bound), (v + bound) / (z - bound), (v + bound) / (z + bound)]
        return (max(-1, values.min()! / (tanHalf * aspect)), min(1, values.max()! / (tanHalf * aspect)))
      }
      let (left, right) = edge(view.x, camera.aspect), (bottom, top) = edge(view.y, 1)
      if left >= right || bottom >= top { visible = false; blend = 0; return }
      bounds = SIMD4(Float(left), Float(bottom), Float(right), Float(top))
    }
    uniforms.bounds = bounds
    uniforms.origin = SIMD3<Float>(toModel * (-relative / radius))
    uniforms.forward = SIMD3<Float>(camera.forward); uniforms.right = SIMD3<Float>(camera.right); uniforms.up = SIMD3<Float>(camera.cameraUp)
    uniforms.projection = SIMD2(Float(tanHalf * camera.aspect), Float(tanHalf))
    uniforms.mix = Float(blend)
    uniforms.pixelRatio = Float(pixelRatio)
    armUniforms.projection = camera.projection; armUniforms.viewRotation = camera.viewRotation
    armUniforms.origin = SIMD3<Float>(relative)
    armUniforms.scale = Float(radius * heightPx * pixelRatio / (2 * tanHalf))
    armUniforms.mix = Float(blend)
  }

  /// Select the visible body (out to 4 R_e), including from inside the model. `ndc` is the tap in [-1,1] with +y up.
  public func hitTest(ndc: SIMD2<Double>, camera: Camera) -> Bool {
    if !visible || blend < 0.1 { return false }
    let direction = camera.orientation.act(simd_normalize(SIMD3(ndc.x * camera.tanHalfFov * camera.aspect, ndc.y * camera.tanHalfFov, -1)))
    let origin = toModel * ((camera.position - center) / radius)
    let ray = simd_normalize(toModel * direction)
    let along = -simd_dot(origin, ray)
    let closest = origin + ray * max(0, along)
    return simd_length_squared(closest) < 16
  }
}

/// The immutable CPU fields and their GPU textures, built once and shared by every model that needs them.
/// ponytail: used from one actor (the session or a test); unchecked rather than locked.
public final class FieldCache: @unchecked Sendable {
  public let milkyWay: MilkyWayReference
  private var milkyWayField: [UInt8]?
  private var cloudFields: [MagellanicCloudKind: [UInt8]] = [:]
  private var textures: [String: MTLTexture] = [:]
  public init(milkyWay: MilkyWayReference) { self.milkyWay = milkyWay }

  public func cloudField(_ kind: MagellanicCloudKind) -> [UInt8] { if let f = cloudFields[kind] { return f }; let f = cloudDensityField(kind); cloudFields[kind] = f; return f }
  func texture2D(_ renderer: AtlasRenderer, key: String, size: Int, data: [UInt8]) throws -> MTLTexture {
    if let t = textures[key] { return t }
    let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: size, height: size, mipmapped: true)
    d.usage = [.shaderRead]; d.storageMode = .shared
    guard let texture = renderer.device.makeTexture(descriptor: d) else { throw AtlasError("Out of GPU memory") }
    data.withUnsafeBytes { texture.replace(region: MTLRegionMake2D(0, 0, size, size), mipmapLevel: 0, withBytes: $0.baseAddress!, bytesPerRow: size * 4) }
    if let commandBuffer = renderer.queue.makeCommandBuffer(), let blit = commandBuffer.makeBlitCommandEncoder() { blit.generateMipmaps(for: texture); blit.endEncoding(); commandBuffer.commit(); commandBuffer.waitUntilCompleted() }
    texture.label = key; textures[key] = texture
    return texture
  }
  public func milkyWayTexture(_ renderer: AtlasRenderer) throws -> MTLTexture {
    if milkyWayField == nil { milkyWayField = milkyWayDensityField(milkyWay) }
    return try texture2D(renderer, key: "milky-way", size: HOME_FIELD_SIZE, data: milkyWayField!)
  }
  public func cloudTexture(_ renderer: AtlasRenderer, _ kind: MagellanicCloudKind) throws -> MTLTexture {
    let key = "cloud-\(kind.rawValue)"
    if let t = textures[key] { return t }
    let field = cloudField(kind)
    let d = MTLTextureDescriptor()
    d.textureType = .type3D; d.pixelFormat = .rg8Unorm; d.width = CLOUD_FIELD_SIZE; d.height = CLOUD_FIELD_SIZE; d.depth = CLOUD_FIELD_SIZE
    d.usage = [.shaderRead]; d.storageMode = .shared
    guard let texture = renderer.device.makeTexture(descriptor: d) else { throw AtlasError("Out of GPU memory") }
    field.withUnsafeBytes { texture.replace(region: MTLRegionMake3D(0, 0, 0, CLOUD_FIELD_SIZE, CLOUD_FIELD_SIZE, CLOUD_FIELD_SIZE), mipmapLevel: 0, slice: 0, withBytes: $0.baseAddress!, bytesPerRow: CLOUD_FIELD_SIZE * 2, bytesPerImage: CLOUD_FIELD_SIZE * CLOUD_FIELD_SIZE * 2) }
    texture.label = key; textures[key] = texture
    return texture
  }
}
