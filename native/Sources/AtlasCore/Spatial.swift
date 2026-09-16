import Foundation

// Port of src/spatial.ts. Order of results matches the web (insertion order), which tests pin.

public enum DetailMode: String, Sendable { case adaptive, full }

public struct FrontierOptions {
  public var root: String
  public var nodes: [String: CatalogNode]
  public var mode: DetailMode
  public var budget: Int
  public var visible: (CatalogNode) -> Bool
  public var projectedSize: (CatalogNode) -> Double
  public init(root: String, nodes: [String: CatalogNode], mode: DetailMode, budget: Int, visible: @escaping (CatalogNode) -> Bool, projectedSize: @escaping (CatalogNode) -> Double) {
    self.root = root; self.nodes = nodes; self.mode = mode; self.budget = budget; self.visible = visible; self.projectedSize = projectedSize
  }
}

/// A non-overlapping frontier of real source points. No density reconstruction.
public func chooseFrontier(_ o: FrontierOptions) -> [String] {
  guard let first = o.nodes[o.root], o.visible(first) else { return [] }
  if o.mode == .full {
    var result: [String] = []
    func visit(_ id: String) {
      guard let node = o.nodes[id], o.visible(node) else { return }
      if node.children.isEmpty { result.append(id) } else { node.children.forEach(visit) }
    }
    visit(o.root)
    return result
  }
  var frontier: [String] = [o.root]
  var cost = first.storedCount
  var candidates = [first]
  while !candidates.isEmpty {
    // Stable sort by projected size, largest first (JS Array.sort is stable).
    candidates = candidates.enumerated().sorted { a, b in
      let (sa, sb) = (o.projectedSize(a.element), o.projectedSize(b.element))
      return sa != sb ? sa > sb : a.offset < b.offset
    }.map(\.element)
    let node = candidates.removeFirst()
    if node.children.isEmpty || o.projectedSize(node) < 130 { continue }
    let children = node.children.compactMap { o.nodes[$0] }.filter(o.visible)
    let nextCost = cost - node.storedCount + children.reduce(0) { $0 + $1.storedCount }
    if nextCost > o.budget { continue }
    frontier.removeAll { $0 == node.id }
    cost = nextCost
    for child in children { frontier.append(child.id); candidates.append(child) }
  }
  return frontier
}

/// Ancestor fallbacks until every needed child has usable coverage: a parent sample or its covered descendants, never both.
public func coveredFrontier(root: String, nodes: [String: CatalogNode], desired: Set<String>, required: Set<String>, loaded: (String) -> Bool) -> [String] {
  func visit(_ id: String) -> [String]? {
    if !required.contains(id) { return [] }
    if desired.contains(id) { return loaded(id) ? [id] : nil }
    let children = (nodes[id]?.children ?? []).filter { required.contains($0) }
    let parts = children.map(visit)
    if parts.allSatisfy({ $0 != nil }) { return parts.flatMap { $0! } }
    return loaded(id) ? [id] : nil
  }
  return visit(root) ?? []
}
