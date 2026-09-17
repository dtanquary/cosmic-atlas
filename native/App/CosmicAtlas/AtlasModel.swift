import Foundation
import Observation
import UIKit
import AtlasCore
import AtlasRender

/// App state around the session: loading, stats, selection and toasts for SwiftUI.
@MainActor
@Observable
final class AtlasModel {
  let session: AtlasSession
  var stats = AtlasStats()
  var selected: Galaxy?
  var toast: String?
  var loadError: String?
  var ready = false
  var diagnostics = false
  var units: Units = .ly
  var settings = Settings.load(from: UserDefaults.standard)
  var showSettings = false
  var ringLabels: [AtlasSession.RingLabel] = []
  var showTours = false
  var tour: Tour?
  var tourState = TourState(index: -1, status: .idle, stop: nil, autoplay: false)
  var tourPace: TourPace = .quick
  var pausedByInput = false
  var tourActive: Bool { tour != nil && tourState.status != .idle }
  private var tourStartSerial = 0
  private var toastTask: Task<Void, Never>?

  init() throws {
    let renderer = try AtlasRenderer()
    let dataDir = Bundle.main.url(forResource: "data", withExtension: nil)!
    let reference = try ReferenceData(directory: dataDir)
    session = try AtlasSession(renderer: renderer, reference: reference)
    session.onStats = { [weak self] in self?.stats = $0 }
    session.onSelection = { [weak self] in self?.selected = $0 }
    session.onReady = { [weak self] in self?.ready = true }
    session.onError = { [weak self] in self?.loadError = $0 }
    session.onMessage = { [weak self] in self?.notify($0) }
    session.reduceMotion = UIAccessibility.isReduceMotionEnabled
    session.onRings = { [weak self] in self?.ringLabels = $0 }
    session.onUserInput = { [weak self] in self?.pauseTourByInput() }
    // Native default (Dave, 2026-09-16): the CMB shell starts on until the user chooses otherwise; the web keeps its off default.
    if UserDefaults.standard.string(forKey: Settings.keys.cosmicHorizon) == nil { settings.cosmicHorizon = true }
    // Saved settings apply before the catalog opens, as the web restores them at startup.
    session.cosmicHorizon = settings.cosmicHorizon; session.lookbackRings = settings.lookbackRings
    session.showUncertainLocal = settings.showUncertainLocal; session.enlargePoints = settings.enlargePoints
    session.minOpacity = settings.minimumOpacity
  }
  /// The footprint sidecar needs the manifest, so its saved state applies once the catalog is open.
  func applyDeferredSettings() { session.surveyFootprint = settings.surveyFootprint }

  func open() async {
    loadError = nil
    do {
      try await session.open(origin: AtlasModel.origin); applyDeferredSettings()
      // Launch argument `-tour road-trip`: the web's #tour= link for simulator checks and screenshots.
      if let key = UserDefaults.standard.string(forKey: "tour"), let route = session.reference.tours.first(where: { $0.key == key }) { startTour(route) }
    }
    catch { loadError = (error as? AtlasError)?.message ?? error.localizedDescription }
  }
  static var origin: URL { URL(string: Bundle.main.object(forInfoDictionaryKey: "AtlasOrigin") as? String ?? "https://cosmic-atlas-754.pages.dev/")! }

  func notify(_ message: String) {
    toast = message
    toastTask?.cancel()
    toastTask = Task { try? await Task.sleep(for: .seconds(4)); if !Task.isCancelled { toast = nil } }
  }
  func setMode(_ mode: DetailMode) { session.mode = mode; stats = session.stats }

  // MARK: Tours (src/app.ts startRoute and the tour panel handlers)

  /// Input wins while a chosen tour waits for catalog names; the shell shown for a stop restores the saved choice afterwards.
  func startTour(_ route: TourData) {
    tourStartSerial += 1; let serial = tourStartSerial
    showTours = false; tour?.exit(); pausedByInput = false
    Task {
      await session.openNameIndex()
      guard serial == tourStartSerial else { return }
      let hooks = TourHooks(
        showCosmicHorizon: { [weak self] visible in guard let self else { return }; session.cosmicHorizon = visible || settings.cosmicHorizon },
        resolveCatalog: { [weak self] in self?.session.findName($0) },
        onChange: { [weak self] in self?.tourState = $0 },
        notify: { [weak self] in self?.notify($0) })
      let tour = Tour(atlas: SessionTourAtlas(session), tour: route, nearby: session.reference.nearby.entries, hooks: hooks)
      tour.setPace(tourPace); self.tour = tour; tour.start()
    }
  }
  func pauseTourByInput() { tourStartSerial += 1; if tourActive { pausedByInput = true; tour?.pause() } }
  func exitTour() { tourStartSerial += 1; tour?.exit(); tour = nil }
  func setTourPace(_ pace: TourPace) { tourPace = pace; tour?.setPace(pace); if let tour { tourState = tour.state } }
}
