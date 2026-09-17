import Foundation
import simd
import AtlasCore

// The name index (src/galaxy-search.ts load/find) and the tour surface the runner drives (src/tour.ts TourAtlas).
extension AtlasSession {
  /// Loads galaxy-search.json once, verified against this manifest and merged with the nearby layer. Subsets and
  /// failures leave only the nearby names, as the web does; callers await it before starting a tour.
  public func openNameIndex() async {
    if nameIndexTask == nil {
      nameIndexTask = Task { [weak self] in
        guard let self, let release, let manifest else { return }
        var entries: [NamedGalaxy] = []
        if manifest.subset == nil {
          do {
            let (data, response) = try await URLSession.shared.data(from: release.catalogAsset("galaxy-search.json"))
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) { throw AtlasError("Galaxy names could not load.") }
            let index = try JSONDecoder().decode(NameIndex.self, from: data)
            try index.validate(against: manifest)
            entries = index.entries
          } catch { onMessage("DESI names unavailable; nearby galaxies remain available.") }
        }
        names = mergeNearbyNames(entries, reference: reference.nearby)
      }
    }
    await nameIndexTask?.value
  }
  /// GalaxySearch.find: an exact catalog name with a verified visit reference, or nil.
  public func findName(_ name: String) -> CatalogEntry? { names.first { $0.name == name && $0.id != nil && $0.node != nil }?.catalogEntry }
}

/// The tour runner's view of the session: every visit starts synchronously and reports once through its completion.
@MainActor public final class SessionTourAtlas: TourAtlas {
  public let session: AtlasSession
  public init(_ session: AtlasSession) { self.session = session }
  public var catalogCount: Int { session.manifest?.count ?? 0 }
  public var cameraPosition: SIMD3<Double> { session.camera.position }
  public var orbitTarget: SIMD3<Double> { session.orbit.target }
  public var approachDirection: SIMD3<Double> { session.milkyWay.milkyWayFrame?.approachDirection ?? OVERVIEW_DIRECTION }
  /// A focus completion: true on arrival, false when input or a newer focus took over.
  private func outcome(_ completion: @escaping VisitCompletion) -> (Bool) -> Void { { completion($0 ? .arrived : .interrupted) } }
  public func reset(seconds: Double, completion: @escaping VisitCompletion) -> Bool { session.reset(seconds: seconds, completion: outcome(completion)); return true }
  public func viewCosmicHorizon(seconds: Double, completion: @escaping VisitCompletion) -> Bool {
    guard session.manifest != nil else { return false }
    session.viewCosmicHorizon(seconds: seconds, completion: outcome(completion)); return true
  }
  public func visitMilkyWay(seconds: Double, completion: @escaping VisitCompletion) -> Bool { session.visitMilkyWay(seconds: seconds, completion: outcome(completion)) }
  public func visitNearby(id: Int, seconds: Double, completion: @escaping VisitCompletion) -> Bool { session.visitNearby(id, seconds: seconds, completion: outcome(completion)) }
  public func visitCatalog(entry: CatalogEntry, canNavigate: @escaping () -> Bool, seconds: Double, completion: @escaping VisitCompletion) -> Bool {
    let session = session, arrival = outcome(completion)
    Task {
      do { if try await session.visitCatalog(entry, canNavigate: canNavigate, seconds: seconds, completion: arrival) == nil { completion(.interrupted) } }
      catch { completion(.failed((error as? AtlasError)?.message ?? error.localizedDescription)) }
    }
    return true
  }
  public func applyView(_ state: ViewState, seconds: Double, preserveTarget: Bool, canNavigate: (() -> Bool)?, completion: @escaping VisitCompletion) -> Bool {
    let session = session, arrival = outcome(completion), live = canNavigate ?? { true }
    Task { if await !session.applyView(state, seconds: seconds, preserveTarget: preserveTarget, canNavigate: live, completion: arrival) { completion(.interrupted) } }
    return true
  }
  public func stopTravel() { session.stopTravel() }
  public func tourDestinationReady(_ stop: TourStop) -> Bool? { session.destinationReady(stop) }
}
