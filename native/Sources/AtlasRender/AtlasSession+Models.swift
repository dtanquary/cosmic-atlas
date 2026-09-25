import Foundation
import simd
import AtlasCore
import AtlasShaderTypes

// The model scheduler (src/explorer.ts updateModels/ensureModel/bindModels) and the visits that drive it.
extension AtlasSession {
  func updateModel(_ model: GalaxyModel) {
    let id = model.id
    let display: ModelDisplay = model.data.map { uncertainLocalPosition($0.galaxy) } == true ? .points : modelDisplay
    model.update(camera: camera, heightPx: viewportPoints.y, pixelRatio: scale, focused: id == focusedGalaxyId, display: display, presence: modelPresence[id]?.value ?? 1)
  }

  /// Slot every resident chunk's rows that belong to resident models, so those points snap to the model centre and fade with it.
  func bindModels(only: ChunkBuffers? = nil) {
    let identities = resolvedGalaxies.map(\.id)
    for chunk in only.map({ [$0] }) ?? Array(cache.values) {
      for row in chunk.modelRows { chunk.setSlot(row: row, value: 0) }
      chunk.modelRows = []
      guard let rows = try? chunk.lookup.resolve(chunk.ids, identities) else { continue }
      for (i, row) in rows.enumerated() where row >= 0 { chunk.setSlot(row: row, value: UInt8(i + 1)); chunk.modelRows.append(row) }
    }
  }

  func removeModel(_ model: GalaxyModel) {
    modelLocations[model.id] = nil; modelPresence[model.id] = nil
    resolvedGalaxies.removeAll { $0 === model }
  }

  /// Resolve (or reuse) a model for a catalog record. Priority requests come from selection and visits; automatic
  /// ones from the scan and can be dropped when the galaxy is no longer wanted.
  func ensureModel(_ galaxy: Galaxy, node: CatalogNode, row: Int, priority: Bool = false) async throws -> GalaxyModel {
    if uncertainLocalPosition(galaxy) { throw AtlasError("Uncertain local distance: physical galaxy model withheld.") }
    if let existing = resolvedFor(galaxy.id) {
      if priority { modelPresence[galaxy.id] = (1, 1) }
      modelLocations[galaxy.id] = (node.id, row)
      return existing
    }
    if let pending = modelRequests[galaxy.id] { return try await pending.value }
    guard let manifest = modelManifest else { throw AtlasError("The model catalog is unavailable") }
    let task = Task<GalaxyModel, Error> { [self] in
      let chunk = try await readProfile(node)
      if !priority && !wantedModels.contains(galaxy.id) { throw CancellationError() }
      if let existing = resolvedFor(galaxy.id) { return existing }
      if resolvedGalaxies.count >= MODEL_LIMIT {
        let removable = resolvedGalaxies.filter { !pinnedModels.contains($0.id) && $0.id != selected?.id && $0.id != focusedGalaxyId && (priority || $0.blend == 0) }
          .max { simd_length_squared($0.center - camera.position) / ($0.radius * $0.radius) < simd_length_squared($1.center - camera.position) / ($1.radius * $1.radius) }
        guard let removable else { throw CancellationError() } // waiting for a model to fade out
        removeModel(removable)
      }
      let model = try GalaxyModel(renderer: renderer, data: try decodeModel(manifest, chunk: chunk, row: row, galaxy: galaxy), appearance: galaxyAppearance, fields: fields)
      modelPresence[galaxy.id] = (priority ? 1 : 0, 1); updateModel(model)
      resolvedGalaxies.append(model); modelLocations[galaxy.id] = (node.id, row); bindModels()
      if selected?.id == galaxy.id { onSelection(selected) }
      invalidate(); return model
    }
    modelRequests[galaxy.id] = task
    defer { if modelRequests[galaxy.id] == task { modelRequests[galaxy.id] = nil } }
    return try await task.value
  }

  /// Rank nearby catalog rows by projected radius and keep the twelve best resident; called every 250 ms while moving.
  func updateModels() {
    guard let manifest = modelManifest, modelDisplay == .automatic else { return }
    let scale = viewportPoints.y / (2 * camera.tanHalfFov)
    let cam = camera.position, forward = camera.forward
    var candidates: [(id: Int, node: CatalogNode, row: Int, score: Double)] = []
    var protectedIds = pinnedModels
    if let selected, selected.id >= 0 { protectedIds.insert(selected.id) }
    if let focused = focusedGalaxyId, focused >= 0 { protectedIds.insert(focused) }
    let available = max(0, MODEL_LIMIT - protectedIds.count)
    func consider(_ id: Int, _ node: CatalogNode, _ row: Int, _ score: Double) {
      if available == 0 || candidates.contains(where: { $0.id == id }) || (candidates.count >= available && score <= candidates.last!.score) { return }
      let index = candidates.firstIndex { score > $0.score } ?? candidates.count
      candidates.insert((id, node, row, score), at: index)
      if candidates.count > available { candidates.removeLast() }
    }
    // Resident models keep their exact centre/shape when the point frontier changes; a 30% margin prevents trading places.
    for model in resolvedGalaxies {
      let id = model.id
      guard !protectedIds.contains(id), let location = modelLocations[id], let node = nodes[location.node] else { continue }
      let relative = model.center - cam, score = model.radius * model.radius * scale * scale / max(simd_length_squared(relative), 1e-20)
      if score < 0.25 * 0.25 || simd_dot(relative, forward) < -8 * model.radius { continue }
      consider(id, node, location.row, score * 1.3)
    }
    var requests = 0
    for nodeId in drawn {
      guard let item = cache[nodeId], let asset = manifest.nodes[nodeId] else { continue }
      if boxDistance(min: item.node.min, max: item.node.max, to: cam) > asset.maxRadiusMpc * scale / 0.35 { continue }
      guard let chunk = profiles[nodeId] else {
        if !profileFailed.contains(nodeId) && !profilePending.contains(nodeId) && profilePending.count < 4 && requests < 4 {
          requests += 1
          Task { [weak self] in do { _ = try await self?.readProfile(item.node) } catch { if !(error is CancellationError) { self?.onMessage(Strings.shapesLoadFailed) } } }
        }
        continue
      }
      let positions = item.positions, ids = item.ids, c = item.node.center, fallback = manifest.fallbackRadiusMpc
      let scale2 = scale * scale, guard2 = LOCAL_REDSHIFT_GUARD_MPC * LOCAL_REDSHIFT_GUARD_MPC
      chunk.withRows { values, flags in
        for row in 0..<item.node.storedCount {
          let id = Int(ids[row]); if protectedIds.contains(id) { continue }
          let x = Double(positions[row * 3]) + c.x, y = Double(positions[row * 3 + 1]) + c.y, z = Double(positions[row * 3 + 2]) + c.z
          let r2 = x * x + y * y + z * z
          if r2 < guard2 { continue }
          let dx = x - cam.x, dy = y - cam.y, dz = z - cam.z, distanceSq = dx * dx + dy * dy + dz * dz
          let radius = measuredShape(values: values, flags: flags, row: row) ? Double(values[row * 5]) * r2.squareRoot() * .pi / (180 * 3600) : fallback
          if dx * forward.x + dy * forward.y + dz * forward.z < -8 * radius { continue }
          let score = radius * radius * scale2 / max(distanceSq, 1e-20)
          if score >= 0.35 * 0.35 { consider(id, item.node, row, score) }
        }
      }
    }
    wantedModels = Set(candidates.map(\.id))
    var changed = false
    for model in resolvedGalaxies {
      let id = model.id, wanted = protectedIds.contains(id) || wantedModels.contains(id)
      if var presence = modelPresence[id] { presence.target = wanted ? 1 : 0; modelPresence[id] = presence }
      if !wanted && modelRequests[id] == nil && (modelPresence[id] == nil || modelPresence[id]!.value == 0 || model.blend == 0) { removeModel(model); changed = true }
    }
    if changed { bindModels() }
    for candidate in candidates {
      if resolvedFor(candidate.id) != nil || modelRequests[candidate.id] != nil || modelRequests.count >= 4 || resolvedGalaxies.count + modelRequests.count >= MODEL_LIMIT { continue }
      let (id, node, row, _) = candidate
      let pending = Task<GalaxyModel, Error> { [self] in
        let metadata = try await metadataFor(node)
        modelRequests[id] = nil
        if !wantedModels.contains(id) { throw CancellationError() }
        return try await ensureModel(try decodeGalaxy(metadata, row: row, id: id), node: node, row: row)
      }
      modelRequests[id] = pending
      Task { [weak self] in
        do { _ = try await pending.value } catch { if !(error is CancellationError) { self?.onMessage(Strings.modelLoadFailed) } }
        if let self, self.modelRequests[id] == pending { self.modelRequests[id] = nil }
        self?.invalidate()
      }
    }
  }

  // MARK: Visits

  public func focusSelected(seconds: Double = 0, completion: @escaping (Bool) -> Void = { _ in }) {
    if homeSelected { visitMilkyWay(seconds: seconds, completion: completion); return }
    guard let selected else { return }
    if !catalogPositionVisible(selected) { onMessage("This uncertain local position is hidden. Show uncertain local positions in Settings to inspect it."); return }
    focusAt(target: selected.position, distance: resolvedFor(selected.id).map { $0.radius * 12 } ?? 25, galaxyId: selected.id, seconds: seconds, completion: completion)
  }
  /// Observer-facing view of a resolved model; returns false when no model exists for the id.
  @discardableResult
  public func visitGalaxy(_ id: Int, seconds: Double = 0, completion: @escaping (Bool) -> Void = { _ in }) -> Bool {
    guard ready, let model = resolvedFor(id), let data = model.data, let frame = model.frame else { return false }
    selectionSerial += 1; selectGalaxy(data.galaxy, address: modelLocations[id])
    focusAt(target: model.center, distance: model.radius * 12, direction: -frame.radial, galaxyId: id, seconds: seconds, completion: completion)
    onMessage("\(data.name) · observer-facing view. Drag to explore its inferred 3D shape.")
    return true
  }
  @discardableResult
  public func visitNearby(_ id: Int, seconds: Double = 0, completion: @escaping (Bool) -> Void = { _ in }) -> Bool {
    guard nearbyGalaxies.contains(where: { $0.id == id }) else { return false }
    return visitGalaxy(id, seconds: seconds, completion: completion)
  }
  @discardableResult
  public func focusObserver(seconds: Double = 0, completion: @escaping (Bool) -> Void = { _ in }) -> Bool {
    guard ready, let frame = milkyWay.milkyWayFrame else { return false }
    focusAt(target: .zero, distance: 0.06, direction: frame.approachDirection, home: true, seconds: seconds, completion: completion)
    inspectHome(); onMessage("Sun / Observer · zoom and orbit around our position in the disk.")
    return true
  }
  @discardableResult
  public func visitMilkyWay(seconds: Double = 0, completion: @escaping (Bool) -> Void = { _ in }) -> Bool {
    guard ready, let frame = milkyWay.milkyWayFrame else { return false }
    focusAt(target: milkyWay.center, distance: 0.06, direction: frame.approachDirection, home: true, seconds: seconds, completion: completion)
    inspectHome()
    onMessage(modelDisplay == .points ? "Milky Way · points-only display is on. Enable models in Settings to see its shape." : "Milky Way · zoom and orbit around the Galactic core.")
    return true
  }
  /// Visit a verified name-index entry. Returns nil when it bails before navigating; the completion reports arrival.
  public func visitCatalog(_ entry: CatalogEntry, canNavigate: @escaping () -> Bool = { true }, seconds: Double = 0, completion: @escaping (Bool) -> Void = { _ in }) async throws -> Bool? {
    if !canNavigate() { return nil }
    selectionSerial += 1; let serial = selectionSerial
    guard let node = nodes[entry.node], entry.row >= 0, entry.row < node.storedCount else { throw AtlasError("This named observation is unavailable.") }
    let metadata = try await metadataFor(node)
    if !canNavigate() || serial != selectionSerial { return nil }
    let galaxy = try decodeGalaxy(metadata, row: entry.row, id: entry.id)
    if galaxy.targetId != entry.targetId { throw AtlasError("The name index does not match this catalog.") }
    if !catalogPositionVisible(galaxy) { throw AtlasError("This name has an uncertain local position. Enable Show uncertain local positions in Settings to inspect the record.") }
    if modelManifest != nil && !uncertainLocalPosition(galaxy) {
      do { _ = try await ensureModel(galaxy, node: node, row: entry.row, priority: true) }
      catch { if canNavigate() && serial == selectionSerial { onMessage("The shape could not load; showing the catalog position. Retry missing detail to try again.") } }
    }
    if !canNavigate() || serial != selectionSerial { return nil }
    modelLocations[galaxy.id] = (node.id, entry.row)
    if resolvedFor(galaxy.id) != nil { return visitGalaxy(galaxy.id, seconds: seconds, completion: completion) }
    selectGalaxy(galaxy, address: (node.id, entry.row)); focusSelected(seconds: seconds, completion: completion)
    return true
  }

  /// Focus a decoded link: the identity is re-verified and the link's camera offset applied from the exact position;
  /// an unverifiable identity falls back to the camera alone. Returns false when superseded.
  public func applyView(_ state: ViewState, seconds: Double = 0, preserveTarget: Bool = false, canNavigate: @escaping () -> Bool = { true }, completion: @escaping (Bool) -> Void = { _ in }) async -> Bool {
    if !canNavigate() { return false }
    selectionSerial += 1; let serial = selectionSerial
    let offset = state.camera - state.target
    let distance = min(orbit.maxDistance, max(orbit.minDistance, simd_length(offset)))
    let direction = simd_length_squared(offset) > 0 ? simd_normalize(offset) : -camera.forward
    var exact: (target: SIMD3<Double>, galaxyId: Int?, home: Bool)? = nil
    do { exact = try await locate(state.identity, serial: serial, canNavigate: canNavigate) }
    catch is CancellationError { return false }
    catch { if !canNavigate() || serial != selectionSerial { return false }; onMessage(Strings.linkUnknownGalaxy) }
    if !canNavigate() || serial != selectionSerial { return false }
    if exact == nil { clearSelection() }
    if let exact { focusAt(target: preserveTarget ? state.target : exact.target, distance: distance, direction: direction, galaxyId: exact.galaxyId, home: exact.home, seconds: seconds, completion: completion); if exact.home { inspectHome() } }
    else { focusAt(target: state.target, distance: distance, direction: direction, seconds: seconds, completion: completion) }
    return true
  }
  func locate(_ identity: ViewIdentity?, serial: Int, canNavigate: () -> Bool) async throws -> (target: SIMD3<Double>, galaxyId: Int?, home: Bool)? {
    guard let identity else { return nil }
    switch identity {
    case .core: return (milkyWay.center, nil, true)
    case .sun: return (.zero, nil, true)
    case .nearby(let key):
      guard let model = nearbyGalaxies.first(where: { $0.data?.galaxy.targetId == "nearby:\(key)" }), let data = model.data else { throw AtlasError("Unknown nearby galaxy") }
      selectGalaxy(data.galaxy, address: nil); return (model.center, data.galaxy.id, false)
    case .desi(let nodeId, let row, let targetId):
      let galaxy = try await verify(entry: CatalogEntry(id: -1, node: nodeId, row: row, targetId: targetId))
      if !canNavigate() || serial != selectionSerial { throw CancellationError() }
      guard let node = nodes[nodeId] else { throw AtlasError("Unknown catalog address") }
      if !catalogPositionVisible(galaxy) { onMessage("This uncertain local position is hidden. Show uncertain local positions in Settings to inspect it."); return nil }
      if modelManifest != nil && !uncertainLocalPosition(galaxy) { _ = try? await ensureModel(galaxy, node: node, row: row, priority: true) }
      if !canNavigate() || serial != selectionSerial { throw CancellationError() }
      selectGalaxy(galaxy, address: (nodeId, row))
      return (resolvedFor(galaxy.id)?.center ?? galaxy.position, galaxy.id, false)
    }
  }

  /// A bounded check of the destination representation, independent of unrelated pending requests (tourDestinationReady).
  public func destinationReady(_ stop: TourStop) -> Bool {
    if !ready { return false }
    func inView(_ world: SIMD3<Double>, _ marginX: Double = 0.8, _ marginY: Double = 0.65) -> Bool {
      let v = simd_double3x3(camera.orientation.inverse) * (world - camera.position)
      let depth = -v.z
      if depth <= camera.near || depth >= camera.far { return false }
      let px = v.x / (depth * camera.tanHalfFov * camera.aspect), py = v.y / (depth * camera.tanHalfFov)
      return abs(px) < marginX && abs(py) < marginY
    }
    let kind = stop.target.kind
    if kind == .view { return true }
    if kind == .cmb { return cosmicHorizon }
    if kind == .sun || kind == .core { return modelDisplay == .points || milkyWay.visible }
    if kind == .nearby || kind == .catalog {
      guard let selected, inView(selected.position) else { return false }
      let model = resolvedFor(selected.id)
      if modelDisplay != .points, let model, model.visible, model.blend > 0.1 { return true }
      if selected.id < 0 { return true }
      return drawn.contains { cache[$0]?.ids.contains(UInt32(selected.id)) ?? false }
    }
    if kind == .localgroup { return nearbyGalaxies.filter { inView($0.center, 0.99, 0.99) }.count >= 3 }
    // Spend the bounded sample on the destination region, not unrelated faint-background chunks. This is coverage, never membership.
    let reach = orbitDistance * 0.6
    let candidates = kind == .cluster ? drawn.filter { id in cache[id].map { boxDistance(min: $0.node.min, max: $0.node.max, to: orbit.target) <= reach } ?? false } : drawn
    let total = candidates.reduce(0) { $0 + (cache[$1]?.node.storedCount ?? 0) }, stride = max(1, Int(ceil(Double(total) / 32768)))
    var found = 0
    for id in candidates {
      guard let item = cache[id] else { continue }
      let p = item.positions, c = item.node.center
      var row = 0
      while row < item.node.storedCount {
        let world = SIMD3<Double>(Double(p[row * 3]) + c.x, Double(p[row * 3 + 1]) + c.y, Double(p[row * 3 + 2]) + c.z)
        row += stride
        if !showUncertainLocal && simd_length(world) < LOCAL_REDSHIFT_GUARD_MPC { continue }
        if kind == .cluster && simd_distance(world, orbit.target) > reach { continue }
        if inView(world) { found += 1; if found >= (kind == .cluster ? 6 : 32) { return true } }
      }
    }
    return false
  }
}

extension Array { subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil } }
