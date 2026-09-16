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
  private var toastTask: Task<Void, Never>?

  init() throws {
    let renderer = try AtlasRenderer()
    let dataDir = Bundle.main.url(forResource: "data", withExtension: nil)!
    let reference = try ReferenceData(directory: dataDir)
    session = AtlasSession(renderer: renderer, reference: reference)
    session.onStats = { [weak self] in self?.stats = $0 }
    session.onSelection = { [weak self] in self?.selected = $0 }
    session.onReady = { [weak self] in self?.ready = true }
    session.onError = { [weak self] in self?.loadError = $0 }
    session.onMessage = { [weak self] in self?.notify($0) }
    session.reduceMotion = UIAccessibility.isReduceMotionEnabled
  }

  func open() async {
    loadError = nil
    do { try await session.open(origin: AtlasModel.origin) }
    catch { loadError = (error as? AtlasError)?.message ?? error.localizedDescription }
  }
  static var origin: URL { URL(string: Bundle.main.object(forInfoDictionaryKey: "AtlasOrigin") as? String ?? "https://cosmic-atlas-754.pages.dev/")! }

  func notify(_ message: String) {
    toast = message
    toastTask?.cancel()
    toastTask = Task { try? await Task.sleep(for: .seconds(4)); if !Task.isCancelled { toast = nil } }
  }
  func setMode(_ mode: DetailMode) { session.mode = mode; stats = session.stats }
}
