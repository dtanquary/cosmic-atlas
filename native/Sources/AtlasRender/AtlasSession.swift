import Foundation
import Metal
import simd
import AtlasCore
import AtlasShaderTypes

/// Mirror of the web's AtlasStats: what the footer, diagnostics overlay and device tests read.
public struct AtlasStats: Sendable, Equatable {
  public var drawn = 0, loaded = 0, represented = 0, pending = 0, failed = 0
  public var mode: DetailMode = .adaptive, complete = false
  public var fps = 0.0, p95 = 0.0, calls = 0, managedMiB = 0.0, blocked = false
  public var focusDistance = 0.0, focusFromObserver = 0.0, budget = 0, models = 0
  public init() {}
}

let OVERVIEW_DIRECTION = simd_normalize(SIMD3<Double>(0.85, -1, 0.58))
let OVERVIEW_FACTOR = 2.1

/// Double-precision frustum planes in world space (GL clip convention), for chunk culling far from the origin.
struct Frustum {
  var planes: [SIMD4<Double>] = []
  init(camera: Camera) {
    let f = 1 / tan(camera.fovDegrees * .pi / 360), n = camera.near, fa = camera.far
    let p = simd_double4x4(columns: (
      SIMD4(f / camera.aspect, 0, 0, 0), SIMD4(0, f, 0, 0),
      SIMD4(0, 0, (fa + n) / (n - fa), -1), SIMD4(0, 0, 2 * fa * n / (n - fa), 0)))
    let r = simd_double3x3(camera.orientation.inverse)
    let t = -(r * camera.position)
    let v = simd_double4x4(columns: (SIMD4(r.columns.0, 0), SIMD4(r.columns.1, 0), SIMD4(r.columns.2, 0), SIMD4(t, 1)))
    let m = p * v
    func row(_ i: Int) -> SIMD4<Double> { SIMD4(m.columns.0[i], m.columns.1[i], m.columns.2[i], m.columns.3[i]) }
    let r3 = row(3)
    for plane in [r3 + row(0), r3 - row(0), r3 + row(1), r3 - row(1), r3 + row(2), r3 - row(2)] {
      let length = simd_length(SIMD3(plane.x, plane.y, plane.z))
      planes.append(plane / length)
    }
  }
  func intersectsBox(min: SIMD3<Double>, max: SIMD3<Double>) -> Bool {
    for plane in planes {
      let corner = SIMD3(plane.x > 0 ? max.x : min.x, plane.y > 0 ? max.y : min.y, plane.z > 0 ? max.z : min.z)
      if simd_dot(SIMD3(plane.x, plane.y, plane.z), corner) + plane.w < 0 { return false }
    }
    return true
  }
}

func boxDistance(min: SIMD3<Double>, max: SIMD3<Double>, to p: SIMD3<Double>) -> Double {
  simd_length(simd_max(simd_max(min - p, p - max), .zero))
}

/// The explorer's streaming and frame logic (src/explorer.ts) for the point catalog: frontier selection, bounded
/// loading, LRU eviction under a memory budget, camera travel, picking and stats. Builds a `FrameState` per tick.
@MainActor
public final class AtlasSession {
  public let renderer: AtlasRenderer
  public let reference: ReferenceData
  public private(set) var manifest: Manifest?
  public private(set) var release: CatalogRelease?
  let loader: ChunkLoader
  public var mode: DetailMode = .adaptive { didSet { budget = MemoryBudget(mode: mode); dirty = true; invalidate() } }
  public var budget = MemoryBudget(mode: .adaptive)
  public var camera = Camera()
  public var orbit = Orbit()
  public var depthCues = true { didSet { dirty = true; invalidate() } }
  public var enlargePoints = false { didSet { invalidate() } }
  public var showUncertainLocal = false { didSet { invalidate() } }
  public var minOpacity = DEFAULT_MINIMUM_OPACITY { didSet { dirty = true; invalidate() } }
  /// CSS-pixel viewport (points) and the drawable scale (capped at 1.5 like the web).
  public var viewportPoints = SIMD2<Double>(1, 1)
  public var scale = 1.0
  public var drawableSize: SIMD2<Int> { SIMD2(Int((viewportPoints.x * scale).rounded()), Int((viewportPoints.y * scale).rounded())) }

  var nodes: [String: CatalogNode] = [:]
  var parents: [String: String] = [:]
  var spheres: [String: (center: SIMD3<Double>, radius: Double)] = [:]
  var cache: [String: ChunkBuffers] = [:]
  var pending: Set<String> = []
  public private(set) var failed: [String: String] = [:]
  var required: Set<String> = [], desired: Set<String> = []
  public private(set) var drawn: [String] = []
  var references: [UInt8] = []
  var loadedUnique = 0
  var metadata: [(id: String, data: Data)] = []
  var root = "0"
  public private(set) var ready = false
  public private(set) var blocked = false
  var adaptive = AdaptiveBudget()
  var timings = FrameTimings()
  var wasContinuous = false
  public private(set) var overviewTarget = SIMD3<Double>.zero
  public private(set) var overviewRadius = 1.0
  var fadeRange = SIMD2<Double>(100, 1000)
  var lastLOD = -1.0, lastStats = 0.0, lastTime = 0.0
  var dirty = true
  var lastDraw = DrawStats()
  var lastFrame: FrameState?
  /// Visible evictions would be a bug: the web pins zero; tests read this.
  public private(set) var visibleEvictions = 0

  struct Travel { var from: Pose, to: Pose, seconds: Double, start: Double?, completion: (Bool) -> Void }
  var travel: Travel?
  public private(set) var autoFly = false
  public var flight = false
  public var speed = Flight.defaultSpeed
  var focusDistance = 1.0
  public var reduceMotion = false

  public private(set) var selected: Galaxy?
  public private(set) var selectedAddress: (node: String, row: Int)?
  public private(set) var measuring = false
  public private(set) var measurement: [Galaxy] = []
  var selectionSerial = 0
  var picking = false
  let pickPass: PickPass

  public var onMessage: (String) -> Void = { _ in }
  public var onSelection: (Galaxy?) -> Void = { _ in }
  public var onMeasure: ([Galaxy], Bool) -> Void = { _, _ in }
  public var onReady: () -> Void = {}
  public var onError: (String) -> Void = { _ in }
  public var onStats: (AtlasStats) -> Void = { _ in }
  public var onAutoFly: (Bool) -> Void = { _ in }
  /// Schedule a frame (MTKView.setNeedsDisplay). Idle frames are never drawn.
  public var invalidate: () -> Void = {}

  public init(renderer: AtlasRenderer, reference: ReferenceData, loader: ChunkLoader = ChunkLoader()) {
    self.renderer = renderer; self.reference = reference; self.loader = loader
    pickPass = PickPass(renderer: renderer)
    orbit.minDistance = 0.00001; orbit.zoomSpeed = 0.9; orbit.dampingFactor = 0.09
  }

  // MARK: Loading

  /// Opens a release from its origin: `catalog.json`, then the manifest.
  public func open(origin: URL) async throws {
    let (index, _) = try await URLSession.shared.data(from: URL(string: "data/catalog.json", relativeTo: origin)!.absoluteURL)
    let release = try CatalogRelease.resolve(catalogJSON: index, origin: origin)
    let (data, response) = try await URLSession.shared.data(from: release.manifestURL)
    if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) { throw AtlasError("The galaxy catalog could not be opened (\(http.statusCode)).") }
    try load(release: release, manifestData: data)
  }

  public func load(release: CatalogRelease, manifestData: Data) throws {
    let manifest = try Manifest.decode(manifestData)
    self.manifest = manifest; self.release = release; root = manifest.root
    references = [UInt8](repeating: 0, count: manifest.count)
    nodes = [:]; parents = [:]; spheres = [:]
    for node in manifest.nodes {
      nodes[node.id] = node
      spheres[node.id] = ((node.min + node.max) / 2, simd_length(node.max - node.min) / 2)
      for child in node.children { parents[child] = node.id }
    }
    guard let rootNode = nodes[root] else { throw AtlasError("Catalog root is missing") }
    overviewTarget = (rootNode.min + rootNode.max) / 2
    overviewRadius = simd_length(rootNode.max - rootNode.min) / 2
    orbit.maxDistance = max(overviewRadius * 10, reference.cmbRadiusMpc * 6)
    camera.far = max(overviewRadius * 30, reference.cmbRadiusMpc * 12)
    reset()
    invalidate()
  }

  func request(_ node: CatalogNode) {
    guard let release, cache[node.id] == nil, !pending.contains(node.id), failed[node.id] == nil else { return }
    let reservation = node.points.decodedBytes * 3 + node.points.bytes * 2
    evict(requiredBytes: reservation)
    if memoryBytes + reservation > budget.limit { blocked = true; return }
    pending.insert(node.id)
    let manifestCount = manifest!.count
    Task { [weak self] in
      guard let self else { return }
      do {
        let data = try await loader.load(key: "p:\(node.id)", url: release.nodeURL(node.points.url), asset: node.points, kind: .points, count: node.storedCount)
        try data.withUnsafeBytes { raw in
          let ids = raw.bindMemory(to: UInt32.self)[(BINARY_HEADER_BYTES + node.storedCount * 12) / 4 ..< (BINARY_HEADER_BYTES + node.storedCount * 16) / 4]
          if ids.contains(where: { Int($0) >= manifestCount }) { throw AtlasError("Invalid catalog object reference") }
        }
        let localChunk = boxDistance(min: node.min, max: node.max, to: .zero) < LOCAL_REDSHIFT_GUARD_MPC
        let chunk = try renderer.makeChunk(node: node, decoded: data, localChunk: localChunk)
        received(chunk)
      } catch is CancellationError {
      } catch {
        let message = (error as? AtlasError)?.message ?? error.localizedDescription
        failed[node.id] = message
        if node.id == root && !ready { onError(Strings.firstDataFailed) }
        onMessage("Some detail could not load: \(message)")
      }
      pending.remove(node.id); dirty = true; invalidate()
    }
  }

  func received(_ chunk: ChunkBuffers) {
    chunk.used = ProcessInfo.processInfo.systemUptime
    cache[chunk.node.id] = chunk
    for id in chunk.ids { let i = Int(id); if references[i] == 0 { loadedUnique += 1 }; references[i] &+= 1 }
    if !ready { ready = true; onReady() }
  }

  public var memoryBytes: Int {
    var bytes = references.count + PickPass.size * PickPass.size * 8
    for chunk in cache.values { bytes += chunk.memoryBytes }
    for entry in metadata { bytes += entry.data.count }
    for id in pending { if let node = nodes[id] { bytes += node.points.bytes * 2 + node.points.decodedBytes * 3 } }
    return bytes
  }

  func evict(requiredBytes: Int = 0) {
    let removable = cache.values.filter { $0.node.id != root && !required.contains($0.node.id) && !drawn.contains($0.node.id) }.sorted { $0.used < $1.used }
    for chunk in removable {
      if memoryBytes + requiredBytes < budget.evictTarget() { break }
      cache[chunk.node.id] = nil
      for id in chunk.ids { let i = Int(id); references[i] &-= 1; if references[i] == 0 { loadedUnique -= 1 } }
    }
    // Metadata is needed only during an inspection. Selected values have already been copied.
    while metadata.count > 4 { metadata.removeFirst() }
  }

  public func retry() { failed = [:]; blocked = false; dirty = true; invalidate() }

  func updateLOD(now: Double) {
    guard manifest != nil else { return }
    let frustum = Frustum(camera: camera)
    let height = viewportPoints.y
    let cam = camera.position, cues = depthCues, floor = minOpacity, fade = fadeRange, tanHalf = camera.tanHalfFov, spheres = spheres
    let wanted = chooseFrontier(FrontierOptions(root: root, nodes: nodes, mode: mode, budget: adaptive.points,
      visible: { node in frustum.intersectsBox(min: node.min, max: node.max) && (!cues || floor > 0 || boxDistance(min: node.min, max: node.max, to: cam) <= fade.y) },
      projectedSize: { node in let s = spheres[node.id]!; let distance = max(0.0001, simd_length(cam - s.center) - s.radius); return s.radius / distance * height / tanHalf }))
    desired = Set(wanted); required = Set(wanted)
    for id in wanted { var parent = parents[id]; while let p = parent { required.insert(p); parent = parents[p] } }
    let retain = Set(required.map { "p:\($0)" } + ["p:\(root)"])
    Task { await loader.retain(retain) }
    // Root first, followed by breadth-first coverage; never queue the entire catalog.
    var queue = [root]
    while !queue.isEmpty && pending.count < 12 {
      let id = queue.removeFirst()
      guard let node = nodes[id] else { continue }
      if required.contains(id) || id == root { request(node); queue.append(contentsOf: node.children.filter { required.contains($0) }) }
    }
    let previous = Set(drawn)
    drawn = coveredFrontier(root: root, nodes: nodes, desired: desired, required: required, loaded: { cache[$0] != nil })
    for id in drawn { cache[id]?.used = now }
    evict()
    for id in previous where cache[id] == nil && drawn.contains(id) { visibleEvictions += 1 }
  }

  func updateDepthCues() {
    // Expand the fade horizon smoothly outside the survey; use a neighborhood range inside it.
    let outside = simd_length(camera.position - overviewTarget) - overviewRadius
    let far = max(1500, overviewRadius * 0.4 + max(0, outside) * 3)
    // ponytail: focused-model and local-horizon terms arrive with the volume passes
    fadeRange = SIMD2(far * 0.08, far)
  }

  // MARK: Camera

  public var orbitDistance: Double { simd_length(camera.position - orbit.target) }

  /// Instant when seconds is 0. Otherwise a frame-loop travel that completes true on arrival, or false when superseded or taken over.
  public func focusAt(target: SIMD3<Double>, distance: Double = 25, direction: SIMD3<Double>? = nil, seconds: Double = 0, completion: @escaping (Bool) -> Void = { _ in }) {
    stopTravel()
    selectionSerial += 1
    setAutoFly(false); flight = false
    let unit = simd_normalize(direction ?? -camera.forward)
    orbit.clearMomentum()
    if seconds > 0 && !reduceMotion {
      let offset = camera.position - orbit.target
      let from = Pose(target: orbit.target, distance: max(orbit.minDistance, simd_length(offset)), direction: simd_length_squared(offset) > 0 ? simd_normalize(offset) : unit)
      let to = Pose(target: target, distance: min(orbit.maxDistance, max(orbit.minDistance, distance)), direction: unit)
      travel = Travel(from: from, to: to, seconds: seconds, start: nil, completion: completion)
      invalidate(); return
    }
    place(target: target, distance: distance, direction: unit)
    dirty = true; invalidate()
    completion(true)
  }
  func place(target: SIMD3<Double>, distance: Double, direction: SIMD3<Double>) {
    orbit.place(&camera, target: target, distance: distance, direction: direction)
    focusDistance = distance
  }
  /// Halt an in-flight travel where it is, without repositioning; its completion receives false.
  public func stopTravel() { guard let t = travel else { return }; travel = nil; t.completion(false) }
  public func reset(seconds: Double = 0, completion: @escaping (Bool) -> Void = { _ in }) {
    focusAt(target: overviewTarget, distance: overviewRadius * OVERVIEW_FACTOR, direction: OVERVIEW_DIRECTION, seconds: seconds, completion: completion)
  }
  /// Any orbit input (drag, pinch, wheel) takes over from a travel the same frame.
  public func userInputBegan() { stopTravel(); dirty = true; invalidate() }
  public func setAutoFly(_ enabled: Bool) {
    if enabled && !ready || autoFly == enabled { return }
    if enabled { stopTravel(); flight = false; orbit.clearMomentum() }
    autoFly = enabled; lastTime = 0; onAutoFly(enabled); invalidate()
  }

  func move(dt: Double, now: Double) -> Bool {
    if var t = travel {
      if t.start == nil { t.start = now; travel = t }
      let s = (now - t.start!) / t.seconds
      if s >= 1 { travel = nil; place(target: t.to.target, distance: t.to.distance, direction: t.to.direction); t.completion(true) }
      else { let pose = interpolatePose(from: t.from, to: t.to, s); orbit.target = pose.target; camera.position = pose.target + pose.direction * pose.distance; camera.lookAt(pose.target); focusDistance = pose.distance }
      dirty = true; return true
    }
    if autoFly { Flight.autoFly(&camera, target: &orbit.target, speed: speed, dt: dt); dirty = true; return true }
    return false
  }

  // MARK: Frame

  public var viewState: ViewState {
    var identity: ViewIdentity? = nil
    if let selected, let address = selectedAddress, selected.id >= 0 { identity = .desi(node: address.node, row: address.row, targetId: selected.targetId) }
    return ViewState(target: orbit.target, camera: camera.position, identity: identity)
  }

  func catalogPositionVisible(_ galaxy: Galaxy) -> Bool { !uncertainLocalPosition(galaxy) || showUncertainLocal }

  /// One frame: advance motion, choose the frontier, and describe what to draw. `now` in seconds.
  public func tick(now: Double) -> FrameState {
    let elapsed = lastTime > 0 ? now - lastTime : 1 / 60
    lastTime = now
    let dt = min(elapsed, 0.05)
    let moved = move(dt: dt, now: now)
    let orbitMoved = !flight && !autoFly && orbit.update(&camera, deltaTime: dt, allowAutoRotate: true)
    let automaticOrbit = !flight && !autoFly && orbit.autoRotate
    camera.aspect = viewportPoints.x / viewportPoints.y
    camera.retuneNear(orbitDistance: orbitDistance)
    if (moved || orbitMoved || automaticOrbit) && wasContinuous { timings.record(elapsed * 1000) }
    updateDepthCues()
    if dirty || now - lastLOD > 0.2 { updateLOD(now: now); lastLOD = now; dirty = false }
    var frame = FrameState(uniforms: FrameUniforms.make(camera: camera, viewportHeightPx: viewportPoints.y, pointSizePx: 1.6 * scale, fadeRange: fadeRange, minOpacity: minOpacity,
                                                        depthCues: depthCues, enlargePoints: enlargePoints, hideUncertainLocal: !showUncertainLocal))
    for id in drawn {
      guard let chunk = cache[id] else { continue }
      var u = AtlasChunkUniforms()
      u.origin = SIMD3<Float>(chunk.node.center - camera.position)
      u.worldOrigin = SIMD3<Float>(chunk.node.center)
      u.nodeCode = UInt32(Int(chunk.node.id)! + 1)
      u.localChunk = chunk.localChunk ? 1 : 0
      frame.chunks.append(ChunkDraw(chunk: chunk, uniforms: u))
    }
    frame.markers.append(MarkerDraw(origin: SIMD3<Float>(-camera.position), sizePx: Float(7 * scale), color: color(0x7299ad)))
    if let selected, catalogPositionVisible(selected) { frame.markers.append(MarkerDraw(origin: SIMD3<Float>(selected.position - camera.position), sizePx: Float(15 * scale), color: color(0xb6f1fa))) }
    for galaxy in measurement where catalogPositionVisible(galaxy) { frame.markers.append(MarkerDraw(origin: SIMD3<Float>(galaxy.position - camera.position), sizePx: Float(13 * scale), color: color(0x9ee4f1))) }
    if measurement.count == 2, measurement.allSatisfy(catalogPositionVisible) {
      frame.line = LineDraw(origin: SIMD3<Float>(measurement[0].position - camera.position), end: SIMD3<Float>(measurement[1].position - measurement[0].position))
    }
    lastFrame = frame
    if now - lastStats > 0.25 || !(moved || orbitMoved) { onStats(stats); lastStats = now }
    if adaptive.record(mode: mode, moving: moved || orbitMoved, pending: pending.count, p95: timings.p95) { dirty = true }
    wasContinuous = moved || orbitMoved || automaticOrbit || dirty || orbit.isSettling
    return frame
  }
  /// Record the draw the view actually submitted for the last tick.
  public func didDraw(_ stats: DrawStats) { lastDraw = stats; if wasContinuous { invalidate() } }
  public var continuous: Bool { wasContinuous }
  func color(_ hex: UInt32) -> SIMD3<Float> { SIMD3(Float((hex >> 16) & 255) / 255, Float((hex >> 8) & 255) / 255, Float(hex & 255) / 255) }

  public var stats: AtlasStats {
    var s = AtlasStats()
    s.drawn = drawn.reduce(0) { $0 + (nodes[$1]?.storedCount ?? 0) }
    s.loaded = loadedUnique
    s.represented = drawn.reduce(0) { $0 + (nodes[$1]?.count ?? 0) }
    s.pending = pending.count; s.failed = failed.count; s.mode = mode
    s.complete = ready && !drawn.isEmpty && desired.count == drawn.count && drawn.allSatisfy { desired.contains($0) } && drawn.allSatisfy { nodes[$0]?.children.isEmpty ?? false }
    s.fps = timings.fps; s.p95 = timings.p95; s.calls = lastDraw.draws
    s.managedMiB = Double(memoryBytes) / 1_048_576; s.blocked = blocked
    s.focusDistance = orbitDistance; s.focusFromObserver = simd_length(orbit.target); s.budget = adaptive.points; s.models = 0
    return s
  }

  // MARK: Selection

  func metadataFor(_ node: CatalogNode) async throws -> Data {
    if let index = metadata.firstIndex(where: { $0.id == node.id }) { let entry = metadata.remove(at: index); metadata.append(entry); return entry.data }
    guard let release else { throw AtlasError("No catalog") }
    let data = try await loader.load(key: "m:\(node.id)", url: release.nodeURL(node.metadata.url), asset: node.metadata, kind: .metadata, count: node.storedCount, priority: true)
    metadata.append((node.id, data)); while metadata.count > 4 { metadata.removeFirst() }
    return data
  }

  public func selectGalaxy(_ galaxy: Galaxy, address: (node: String, row: Int)?) {
    selected = galaxy; selectedAddress = address; onSelection(galaxy)
    if measuring {
      if measurement.count == 2 { measurement = [] }
      if measurement.isEmpty || measurement[0].id != galaxy.id { measurement.append(galaxy) }
      onMeasure(measurement, true)
    }
    invalidate()
  }
  public func clearSelection() { selectionSerial += 1; selected = nil; selectedAddress = nil; onSelection(nil); invalidate() }
  public func setMeasuring(_ enabled: Bool) { measuring = enabled; measurement = []; onMeasure(measurement, enabled); invalidate() }
  public var measurementDistance: Double? { measurement.count == 2 ? separation(measurement[0].position, measurement[1].position) : nil }

  /// Tap-to-pick at a drawable pixel with a bottom-left origin (the web's readback convention).
  public func pick(drawableX: Int, drawableY: Int) async {
    guard !picking, ready, let frame = lastFrame else { return }
    picking = true; selectionSerial += 1; let serial = selectionSerial
    defer { picking = false; invalidate() }
    let size = drawableSize
    let window = PickPass.Window(x: drawableX, y: drawableY, drawableWidth: size.x, drawableHeight: size.y)
    var pickFrame = frame
    pickFrame.uniforms.pointSizePx = Float(7 * scale)
    // ponytail: the readback waits for the GPU on the main actor; a completion handler if taps ever feel late
    let code = pickPass.pick(pickFrame, window: window, drawableWidth: size.x, drawableHeight: size.y)
    if code == 0 { if !measuring { clearSelection() }; return }
    if serial != selectionSerial { return }
    if code >> 16 == 65535 { return } // nearby layer arrives with the models
    let nodeId = String(Int(code >> 16) - 1), row = Int(code & 65535)
    guard let item = cache[nodeId], row < item.node.storedCount else { return }
    let id = Int(item.ids[row]), node = item.node
    do {
      let data = try await metadataFor(node)
      if serial != selectionSerial { return }
      let galaxy = try decodeGalaxy(data, row: row, id: id)
      if !catalogPositionVisible(galaxy) { return }
      selectGalaxy(galaxy, address: (nodeId, row))
    } catch { onMessage("Could not inspect this point. \((error as? AtlasError)?.message ?? "Try again.")") }
  }

  /// A DESI identity from a link or the name index, re-verified against the catalog: the exact target id must match.
  public func verify(entry: CatalogEntry) async throws -> Galaxy {
    guard let node = nodes[entry.node], entry.row >= 0, entry.row < node.storedCount else { throw AtlasError(Strings.linkUnknownGalaxy) }
    let id: Int
    if let resident = cache[node.id] { id = Int(resident.ids[entry.row]) }
    else {
      guard let release else { throw AtlasError("No catalog") }
      // ponytail: whole chunk for one id; an id sidecar if links into non-resident chunks become common
      let data = try await loader.load(key: "l:\(node.id)", url: release.nodeURL(node.points.url), asset: node.points, kind: .points, count: node.storedCount, priority: true)
      id = data.withUnsafeBytes { Int($0.loadUnaligned(fromByteOffset: BINARY_HEADER_BYTES + node.storedCount * 12 + entry.row * 4, as: UInt32.self)) }
    }
    let galaxy = try decodeGalaxy(try await metadataFor(node), row: entry.row, id: id)
    guard galaxy.targetId == entry.targetId else { throw AtlasError(Strings.linkUnknownGalaxy) }
    return galaxy
  }
}
