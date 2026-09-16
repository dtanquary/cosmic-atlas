import Foundation

// Port of src/galaxy-search.ts (index, normalisation, ranking). The dialog is app UI.

/// A verified visit reference: dense id plus the node/row that names it and the exact DESI target id to re-check.
public struct CatalogEntry: Sendable, Equatable, Hashable {
  public var id: Int, node: String, row: Int, targetId: String
  public init(id: Int, node: String, row: Int, targetId: String) { self.id = id; self.node = node; self.row = row; self.targetId = targetId }
}

public struct NamedGalaxy: Codable, Sendable, Equatable {
  public enum Kind: String, Codable, Sendable { case observer, nearby }
  public var name: String, aliases: [String], sgaId: Int?, id: Int?, node: String?, row: Int?, targetId: String?, distance: Double?, kind: Kind?
  public init(name: String, aliases: [String], sgaId: Int? = nil, id: Int? = nil, node: String? = nil, row: Int? = nil, targetId: String? = nil, distance: Double? = nil, kind: Kind? = nil) {
    self.name = name; self.aliases = aliases; self.sgaId = sgaId; self.id = id; self.node = node; self.row = row; self.targetId = targetId; self.distance = distance; self.kind = kind
  }
  /// The verified visit reference, when the index names one.
  public var catalogEntry: CatalogEntry? {
    guard let id, let node, let row, let targetId else { return nil }
    return CatalogEntry(id: id, node: node, row: row, targetId: targetId)
  }
}
public struct NameIndex: Codable, Sendable {
  public var version: Int, catalogId: String, catalogSourceSha256: String, matched: Int, entries: [NamedGalaxy]
  /// Name search is available with the full DESI DR1 atlas only.
  public func validate(against manifest: Manifest) throws {
    guard version == 1, catalogId == manifest.id, catalogSourceSha256 == manifest.source.sha256, manifest.subset == nil else { throw AtlasError("Name search is available with the full DESI DR1 atlas.") }
  }
}

public func normalizeName(_ value: String) -> String {
  var text = value.lowercased().replacingOccurrences(of: "messier", with: "m")
  text = text.replacingOccurrences(of: #"\b(ngc|ic|ugc|pgc|m)\s*0*(\d+)"#, with: "$1$2", options: .regularExpression)
  return text.replacingOccurrences(of: "[^a-z0-9]", with: "", options: .regularExpression)
}

public let observerEntry = NamedGalaxy(name: "Milky Way", aliases: ["Observer", "Home", "Our galaxy"], distance: 0, kind: .observer)
public func nearbyEntries(_ reference: NearbyReference) -> [NamedGalaxy] {
  reference.entries.map { NamedGalaxy(name: $0.name, aliases: $0.aliases, id: $0.id, distance: $0.distanceMpc, kind: .nearby) }
}
public func mergeNearbyNames(_ entries: [NamedGalaxy], reference: NearbyReference) -> [NamedGalaxy] {
  let nearby = nearbyEntries(reference)
  let aliases = Set(nearby.flatMap { [$0.name] + $0.aliases }.map(normalizeName))
  return nearby + entries.filter { entry in !([entry.name] + entry.aliases).contains { aliases.contains(normalizeName($0)) } }
}
let favorites = ["NGC 3982", "NGC 5107", "NGC 4026", "NGC 4121", "NGC 3738", "NGC 3992"]
public func isVisitable(_ entry: NamedGalaxy) -> Bool { entry.kind == .observer || entry.id != nil }

public func namedSuggestions(_ entries: [NamedGalaxy], query: String, limit: Int = 8) -> [NamedGalaxy] {
  let needle = normalizeName(query)
  if needle.isEmpty {
    return Array(([observerEntry] + entries.filter { $0.kind == .nearby } + favorites.flatMap { name in entries.filter { $0.name == name && $0.id != nil } }).prefix(limit))
  }
  var results: [(entry: NamedGalaxy, rank: Double, order: Int)] = []
  for (order, entry) in ([observerEntry] + entries).enumerated() {
    var rank = Double.infinity
    for name in [entry.name] + entry.aliases {
      let normalized = normalizeName(name)
      rank = min(rank, normalized == needle ? 0 : normalized.hasPrefix(needle) ? 1 : normalized.contains(needle) ? 2 : .infinity)
    }
    if rank.isFinite { results.append((entry, rank * 10 + (entry.id == nil && entry.kind != .observer ? 1 : 0), order)) }
  }
  let locale = Locale(identifier: "en")
  return results.sorted { a, b in
    if a.rank != b.rank { return a.rank < b.rank }
    let da = a.entry.distance ?? .infinity, db = b.entry.distance ?? .infinity
    if da != db { return da < db }
    let names = a.entry.name.compare(b.entry.name, locale: locale)
    return names != .orderedSame ? names == .orderedAscending : a.order < b.order
  }.prefix(limit).map(\.entry)
}
