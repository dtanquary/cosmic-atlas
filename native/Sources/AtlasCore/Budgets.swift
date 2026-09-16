import Foundation
#if canImport(Darwin)
import Darwin
#endif

/// Managed-allocation ceiling. The web fixes 768 MiB adaptive / 1536 MiB full; on a device the ceiling also respects
/// what the process can actually get. (Eviction itself lives with the chunk cache.)
public struct MemoryBudget: Sendable, Equatable {
  public static let mebibyte = 1_048_576
  public static func webLimit(_ mode: DetailMode) -> Int { (mode == .full ? 1536 : 768) * mebibyte }
  public private(set) var limit: Int
  public var evictTargetFraction = 0.9

  public init(mode: DetailMode, availableBytes: Int? = MemoryBudget.availableBytes()) {
    // ponytail: one safety factor; tune from Phase 2 device numbers
    if let available = availableBytes, available > 0 { limit = min(Self.webLimit(mode), max(256 * Self.mebibyte, Int(Double(available) * 0.45))) }
    else { limit = Self.webLimit(mode) }
  }
  public static func availableBytes() -> Int? {
    #if os(iOS) || os(tvOS) || os(visionOS)
    return Int(os_proc_available_memory())
    #else
    return nil
    #endif
  }
  /// A memory warning halves the ceiling for the session and asks the cache to evict to half of it.
  public mutating func didReceiveMemoryWarning() { limit = max(256 * Self.mebibyte, limit / 2); evictTargetFraction = 0.5 }
  public func evictTarget() -> Int { Int(Double(limit) * evictTargetFraction) }
}

/// Frame-interval samples while moving (240-sample ring), as the web's stats use them.
public struct FrameTimings: Sendable {
  private var samples: [Double] = []
  public init() {}
  public mutating func record(_ milliseconds: Double) { samples.append(milliseconds); if samples.count > 240 { samples.removeFirst() } }
  public var mean: Double { samples.isEmpty ? 0 : samples.reduce(0, +) / Double(samples.count) }
  public var fps: Double { mean > 0 ? 1000 / mean : 0 }
  public var p95: Double { let sorted = samples.sorted(); return sorted.isEmpty ? 0 : sorted[Int(Double(sorted.count) * 0.95)] }
}

/// Adaptive point budget tuning (src/explorer.ts tick): after more than 120 moving frames with nothing pending,
/// p95 > 22 ms shrinks ×0.8 (floor 250k) and 0 < p95 < 17 ms grows ×1.1 (ceiling 2M).
public struct AdaptiveBudget: Sendable, Equatable {
  public private(set) var points = 1_000_000
  private var frames = 0
  public init() {}
  /// Returns true when the budget changed (the caller marks the frontier dirty).
  public mutating func record(mode: DetailMode, moving: Bool, pending: Int, p95: Double) -> Bool {
    guard mode == .adaptive, moving, pending == 0 else { return false }
    frames += 1
    guard frames > 120 else { return false }
    frames = 0
    if p95 > 22 { points = max(250_000, Int(floor(Double(points) * 0.8))); return true }
    if p95 > 0 && p95 < 17 { points = min(2_000_000, Int(floor(Double(points) * 1.1))); return true }
    return true
  }
}
