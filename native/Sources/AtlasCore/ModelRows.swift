import Foundation

/// Row lookup for a bounded set of resident models in one immutable point chunk.
/// Caches misses too: most models do not occur in any given chunk. (Port of src/model-rows.ts.)
public struct ModelRows: Sendable {
  private var keys: [Int32]
  private var rows: [Int32]
  /// Full-chunk scans performed; tests pin that repeated lookups do not rescan.
  public private(set) var scans = 0
  public init(limit: Int) { keys = Array(repeating: -1, count: limit); rows = Array(repeating: 0, count: limit) }
  public var memoryBytes: Int { (keys.count + rows.count) * MemoryLayout<Int32>.size }
  public mutating func resolve(_ ids: UnsafeBufferPointer<UInt32>, _ models: [Int]) throws -> [Int] {
    if models.count > keys.count { throw AtlasError("Model row lookup exceeds residency limit") }
    for i in keys.indices where !models.contains(Int(keys[i])) { keys[i] = -1 }
    return models.map { id in
      var index = keys.firstIndex(of: Int32(id))
      if index == nil {
        index = keys.firstIndex(of: -1)!
        keys[index!] = Int32(id)
        scans += 1
        rows[index!] = Int32(ids.firstIndex(of: UInt32(id)) ?? -1)
      }
      return Int(rows[index!])
    }
  }
  public mutating func resolve(_ ids: [UInt32], _ models: [Int]) throws -> [Int] {
    try ids.withUnsafeBufferPointer { try resolve($0, models) }
  }
}
