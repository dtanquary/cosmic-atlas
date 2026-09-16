import Foundation

/// Shared, cancellable chunk fetches (port of src/loader.ts). Current-view work precedes speculative leases; an in-flight
/// shared fetch is never duplicated. A speculative caller passes `lease: true` and cancels its Task to release the lease;
/// a plain caller promotes the shared load to required work.
public actor ChunkLoader {
  public typealias Fetch = @Sendable (_ url: URL, _ asset: Asset, _ kind: BinaryKind, _ count: Int) async throws -> Data

  /// One caller awaiting an entry; a cancelled lease is released immediately while the shared fetch continues.
  private final class Waiter { var continuation: CheckedContinuation<Data, Error>? = nil; var cancelled = false }
  private final class Entry {
    let key: String, url: URL, asset: Asset, kind: BinaryKind, count: Int
    var priority: Bool, required: Bool, owners = 0, cancelled = false, active: Task<Void, Never>? = nil
    var waiters: [Waiter] = []
    var settled: [CheckedContinuation<Void, Never>] = []
    init(key: String, url: URL, asset: Asset, kind: BinaryKind, count: Int, priority: Bool, required: Bool) {
      self.key = key; self.url = url; self.asset = asset; self.kind = kind; self.count = count; self.priority = priority; self.required = required
    }
  }

  private let fetch: Fetch
  private let concurrency: Int
  private var queue: [Entry] = []
  private var tasks: [String: Entry] = [:]
  private var disposed = false
  public var onChange: @Sendable () -> Void = {}

  public init(fetch: @escaping Fetch = ChunkLoader.network, concurrency: Int = 6) { self.fetch = fetch; self.concurrency = concurrency }

  /// Production fetch: HTTP, then the worker's verification order. `Accept-Encoding: identity` keeps the pre-gzipped bytes exact.
  public static let network: Fetch = { url, asset, kind, count in
    var request = URLRequest(url: url)
    request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
    let (data, response) = try await URLSession.shared.data(for: request)
    if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) { throw AtlasError("Data request failed (\(http.statusCode))") }
    return try AssetVerifier.verify(compressed: data, asset: asset, kind: kind, count: count)
  }

  public var pending: Int { tasks.values.filter { !$0.cancelled }.count }
  public var reservedBytes: Int { tasks.values.reduce(0) { $0 + $1.asset.bytes * 2 + $1.asset.decodedBytes * 3 } }
  public func setOnChange(_ handler: @escaping @Sendable () -> Void) { onChange = handler }

  public func load(key: String, url: URL, asset: Asset, kind: BinaryKind, count: Int, priority: Bool = false, lease: Bool = false) async throws -> Data {
    if disposed || Task.isCancelled { throw CancellationError() }
    if let old = tasks[key], old.cancelled {
      // Wait for the cancelled fetch to settle before reusing its key: its result must never settle a newer request.
      await withCheckedContinuation { old.settled.append($0) }
      return try await load(key: key, url: url, asset: asset, kind: kind, count: count, priority: priority, lease: lease)
    }
    let entry: Entry
    if let existing = tasks[key] {
      entry = existing
      if !lease { entry.required = true; entry.priority = entry.priority || priority }
    } else {
      entry = Entry(key: key, url: url, asset: asset, kind: kind, count: count, priority: priority, required: !lease)
      tasks[key] = entry; queue.append(entry)
    }
    if lease { entry.owners += 1 }
    pump()
    let waiter = Waiter()
    entry.waiters.append(waiter)
    let entryId = ObjectIdentifier(entry), waiterId = ObjectIdentifier(waiter)
    return try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
        if waiter.cancelled { continuation.resume(throwing: CancellationError()) } else { waiter.continuation = continuation }
      }
    } onCancel: {
      if lease { Task { await self.release(entryId: entryId, waiterId: waiterId) } }
    }
  }

  private func release(entryId: ObjectIdentifier, waiterId: ObjectIdentifier) {
    guard let entry = tasks.values.first(where: { ObjectIdentifier($0) == entryId }), let waiter = entry.waiters.first(where: { ObjectIdentifier($0) == waiterId }) else { return }
    waiter.cancelled = true
    if let continuation = waiter.continuation { waiter.continuation = nil; continuation.resume(throwing: CancellationError()) }
    entry.waiters.removeAll { $0 === waiter }
    entry.owners = max(0, entry.owners - 1)
    cancelUnused(entry)
  }

  private func cancelUnused(_ entry: Entry) {
    if entry.required || entry.owners > 0 || entry.cancelled || tasks[entry.key] !== entry { return }
    entry.cancelled = true
    if let active = entry.active { active.cancel() }
    else { queue.removeAll { $0 === entry }; finish(entry, .failure(CancellationError())) }
  }

  private func finish(_ entry: Entry, _ result: Result<Data, Error>) {
    if tasks[entry.key] === entry { tasks[entry.key] = nil }
    let waiters = entry.waiters; entry.waiters = []
    for waiter in waiters { if let c = waiter.continuation { waiter.continuation = nil; c.resume(with: entry.cancelled ? .failure(CancellationError()) : result) } }
    let settled = entry.settled; entry.settled = []
    for s in settled { s.resume() }
    onChange()
  }

  private func pump() {
    // Stable sort: required before speculative, priority before ordinary.
    queue = queue.enumerated().sorted { a, b in
      let ka = (a.element.required ? 1 : 0, a.element.priority ? 1 : 0), kb = (b.element.required ? 1 : 0, b.element.priority ? 1 : 0)
      return ka != kb ? ka > kb : a.offset < b.offset
    }.map(\.element)
    while !disposed, tasks.values.filter({ $0.active != nil }).count < concurrency, !queue.isEmpty {
      let entry = queue.removeFirst()
      entry.active = Task { [fetch] in
        let result: Result<Data, Error>
        do { result = .success(try await fetch(entry.url, entry.asset, entry.kind, entry.count)) } catch { result = .failure(error) }
        await self.complete(entry, result)
      }
    }
  }

  private func complete(_ entry: Entry, _ result: Result<Data, Error>) {
    entry.active = nil
    finish(entry, result)
    pump()
  }

  /// Demote speculative point leases outside the current view; a lease still owned survives until its owner leaves.
  public func retain(_ keys: Set<String>) {
    for entry in Array(tasks.values) where !keys.contains(entry.key) && entry.kind == .points && !entry.priority {
      entry.required = false
      cancelUnused(entry)
    }
  }

  public func dispose() {
    disposed = true
    for entry in Array(tasks.values) { entry.cancelled = true; entry.active?.cancel(); finish(entry, .failure(CancellationError())) }
    queue = []; tasks = [:]
  }
}
