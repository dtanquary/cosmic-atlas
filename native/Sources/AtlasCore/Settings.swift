import Foundation

/// Persisted preferences with the web's localStorage keys, defaults and validation (src/app.ts). Distance fading,
/// units and tour pace are session-only there and stay session-only here.
public protocol KeyValueStore: AnyObject {
  func string(forKey key: String) -> String?
  func write(_ value: String?, forKey key: String)
}
extension UserDefaults: KeyValueStore {
  public func write(_ value: String?, forKey key: String) { if let value { set(value, forKey: key) } else { removeObject(forKey: key) } }
}
public final class MemoryStore: KeyValueStore, @unchecked Sendable {
  public var values: [String: String] = [:]
  public var throwsOnWrite = false
  public init() {}
  public func string(forKey key: String) -> String? { values[key] }
  public func write(_ value: String?, forKey key: String) { if throwsOnWrite { return }; values[key] = value }
}

public let DEFAULT_MINIMUM_OPACITY = 0.005

public struct Settings: Sendable, Equatable {
  public var cosmicHorizon = false, lookbackRings = false, surveyFootprint = false
  public var galaxyAppearance: GalaxyAppearance = .spiral
  public var modelDisplay: ModelDisplay = .automatic
  public var showUncertainLocal = false, enlargePoints = false
  /// Percent, 0…100, half-percent steps in the UI; the shader uses the fraction.
  public var minimumOpacityPercent = DEFAULT_MINIMUM_OPACITY * 100
  public var minimumOpacity: Double { minimumOpacityPercent / 100 }
  public init() {}

  public static let keys = (cosmicHorizon: "atlas-cosmic-horizon", lookbackRings: "atlas-lookback-rings", surveyFootprint: "atlas-survey-footprint",
                            galaxyAppearance: "atlas-galaxy-appearance", modelDisplay: "atlas-model-display", showUncertainLocal: "atlas-show-uncertain-local",
                            enlargePoints: "atlas-enlarge-points", minimumOpacity: "atlas-minimum-opacity")

  /// Unknown or malformed stored values leave the default in place, as the web's guarded reads do.
  public static func load(from store: KeyValueStore) -> Settings {
    var s = Settings()
    s.cosmicHorizon = store.string(forKey: keys.cosmicHorizon) == "true"
    s.lookbackRings = store.string(forKey: keys.lookbackRings) == "true"
    s.surveyFootprint = store.string(forKey: keys.surveyFootprint) == "true"
    if let v = store.string(forKey: keys.galaxyAppearance), let a = GalaxyAppearance(rawValue: v) { s.galaxyAppearance = a }
    if let v = store.string(forKey: keys.modelDisplay), let d = ModelDisplay(rawValue: v) { s.modelDisplay = d }
    s.showUncertainLocal = store.string(forKey: keys.showUncertainLocal) == "true"
    s.enlargePoints = store.string(forKey: keys.enlargePoints) == "true"
    if let raw = store.string(forKey: keys.minimumOpacity)?.trimmingCharacters(in: .whitespaces), !raw.isEmpty, let v = Double(raw), v.isFinite, v >= 0, v <= 100 { s.minimumOpacityPercent = v }
    return s
  }
  public func save(to store: KeyValueStore) {
    store.write(String(cosmicHorizon), forKey: Self.keys.cosmicHorizon)
    store.write(String(lookbackRings), forKey: Self.keys.lookbackRings)
    store.write(String(surveyFootprint), forKey: Self.keys.surveyFootprint)
    store.write(galaxyAppearance.rawValue, forKey: Self.keys.galaxyAppearance)
    store.write(modelDisplay.rawValue, forKey: Self.keys.modelDisplay)
    store.write(String(showUncertainLocal), forKey: Self.keys.showUncertainLocal)
    store.write(String(enlargePoints), forKey: Self.keys.enlargePoints)
    store.write(JSNumber.toString(minimumOpacityPercent), forKey: Self.keys.minimumOpacity)
  }
}

/// Saved views: `{version:1,views:[{name,hash,savedAt}]}`, newest first, at most 50; unreadable or off-grammar entries are dropped on read.
public struct SavedView: Codable, Sendable, Equatable {
  public var name: String, hash: String, savedAt: String
  public init(name: String, hash: String, savedAt: String) { self.name = name; self.hash = hash; self.savedAt = savedAt }
}
public enum SavedViews {
  public static let key = "atlas-saved-views", limit = 50
  struct Blob: Codable { var version: Int; var views: [SavedView] }
  /// Per-entry leniency: one malformed entry is dropped, not the whole list.
  struct Lenient<T: Decodable>: Decodable { let value: T?; init(from decoder: Decoder) throws { value = try? T(from: decoder) } }
  struct LenientBlob: Decodable { var version: Int; var views: [Lenient<SavedView>] }
  public static func read(from store: KeyValueStore) -> [SavedView] {
    guard let raw = store.string(forKey: key), let data = raw.data(using: .utf8), let blob = try? JSONDecoder().decode(LenientBlob.self, from: data), blob.version == 1 else { return [] }
    return Array(blob.views.compactMap(\.value).filter { ViewLink.decode($0.hash) != nil }.prefix(limit))
  }
  public static func write(_ views: [SavedView], to store: KeyValueStore) -> Bool {
    guard let data = try? JSONEncoder().encode(Blob(version: 1, views: Array(views.prefix(limit)))), let text = String(data: data, encoding: .utf8) else { return false }
    store.write(text, forKey: key)
    return store.string(forKey: key) == text
  }
}
