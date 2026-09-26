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

/// Draw every loaded required node whose ancestors are loaded. Ancestors stay drawn and each node adds only the rows
/// they lack (`sharedPrefix`), so refining or coarsening never removes a point already on screen. `surface` is the
/// non-overlapping coverage: a parent stands in for its children until every required child has loaded.
public func layeredFrontier(root: String, nodes: [String: CatalogNode], required: Set<String>, loaded: (String) -> Bool) -> (layers: [String], surface: [String]) {
  var layers: [String] = []
  func visit(_ id: String) -> [String]? {
    if !required.contains(id) || !loaded(id) { return nil }
    layers.append(id)
    let parts = (nodes[id]?.children ?? []).filter { required.contains($0) }.map(visit)
    return !parts.isEmpty && parts.allSatisfy({ $0 != nil }) ? parts.flatMap { $0! } : [id]
  }
  let surface = visit(root) ?? []
  return (layers, surface)
}

/// Every node stores its rows in one global hash order, so an ancestor's rows inside a node are exactly a prefix of that
/// node's rows. One merge walk returns the prefix length.
public func sharedPrefix<Rows: RandomAccessCollection<UInt32>, Ancestor: RandomAccessCollection<UInt32>>(_ rows: Rows, _ ancestor: Ancestor) -> Int
where Rows.Index == Int, Ancestor.Index == Int {
  var j = ancestor.startIndex
  for (i, row) in rows.enumerated() {
    while j < ancestor.endIndex && ancestor[j] != row { j += 1 }
    if j == ancestor.endIndex { return i }
    j += 1
  }
  return rows.count
}
