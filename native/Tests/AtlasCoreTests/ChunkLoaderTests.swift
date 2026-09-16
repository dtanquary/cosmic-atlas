import XCTest
@testable import AtlasCore

/// Port of tests/loader.test.ts with a controllable fake network in place of the worker. The worker-crash case has no native analogue.
actor FakeNetwork {
  var started: [String] = []
  private var waiting: [String: [CheckedContinuation<Data, Error>]] = [:]
  private var aborted: Set<String> = []
  func fetch(_ url: URL) async throws -> Data {
    let key = url.lastPathComponent
    started.append(key)
    return try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { (c: CheckedContinuation<Data, Error>) in waiting[key, default: []].append(c) }
    } onCancel: { Task { await self.abort(key) } }
  }
  func abort(_ key: String) { aborted.insert(key); for c in waiting.removeValue(forKey: key) ?? [] { c.resume(throwing: CancellationError()) } }
  func resolve(_ key: String, _ data: Data = Data(count: 16)) { for c in waiting.removeValue(forKey: key) ?? [] { c.resume(returning: data) } }
  var startedKeys: [String] { started }
  func hasWaiter(_ key: String) -> Bool { !(waiting[key] ?? []).isEmpty }
}

final class ChunkLoaderTests: XCTestCase {
  let asset = Asset(url: "x", bytes: 8, decodedBytes: 16, sha256: "a")
  var network: FakeNetwork!
  var loader: ChunkLoader!

  override func setUp() async throws {
    network = FakeNetwork()
    let net = network!
    loader = ChunkLoader(fetch: { url, _, _, _ in try await net.fetch(url) })
  }
  override func tearDown() async throws { await loader.dispose() }

  func load(_ key: String, lease: Bool = false, priority: Bool = false) -> Task<Data, Error> {
    let loader = loader!, asset = asset
    return Task { try await loader.load(key: key, url: URL(string: "https://example.invalid/\(key)")!, asset: asset, kind: .points, count: 1, priority: priority, lease: lease) }
  }
  func settle() async { for _ in 0..<20 { await Task.yield() } }
  func isCancelled(_ task: Task<Data, Error>) async -> Bool { do { _ = try await task.value; return false } catch is CancellationError { return true } catch { return false } }

  func testReleasesOneLeaseWithoutCancellingAnotherOrDuplicatingWork() async throws {
    let a = load("a", lease: true), b = load("a", lease: true)
    await settle()
    a.cancel()
    let v1 = await isCancelled(a)
    XCTAssertTrue(v1)
    let v2 = await network.startedKeys
    XCTAssertEqual(v2, ["a"])
    let bytes = Data([1, 2, 3])
    await network.resolve("a", bytes)
    let v101 = try await b.value
    XCTAssertEqual(v101, bytes)
    let v3 = await loader.pending
    XCTAssertEqual(v3, 0)
  }

  func testKeepsASpeculativeFetchWhenExplicitNavigationJoinsIt() async throws {
    let a = load("a", lease: true)
    await settle()
    let required = load("a", priority: true)
    await settle()
    a.cancel()
    await loader.retain([])
    let v4 = await isCancelled(a)
    XCTAssertTrue(v4)
    let v5 = await network.startedKeys.count
    XCTAssertEqual(v5, 1)
    let bytes = Data([9])
    await network.resolve("a", bytes)
    let v102 = try await required.value
    XCTAssertEqual(v102, bytes)
  }

  func testFrontierReleasePreservesALeaseThenCancelsWhenTheLastOwnerLeaves() async throws {
    let required = load("a"), lease = load("a", lease: true)
    await settle()
    await loader.retain([])
    await settle()
    let v6 = await network.startedKeys.count
    XCTAssertEqual(v6, 1)
    let v7 = await network.hasWaiter("a")
    XCTAssertTrue(v7)
    lease.cancel()
    let v8 = await isCancelled(required)
    XCTAssertTrue(v8)
    let v9 = await isCancelled(lease)
    XCTAssertTrue(v9)
  }

  func testDoesNotDeliverACancelledReplyToANewRequiredRequest() async throws {
    let lease = load("a", lease: true)
    await settle()
    lease.cancel()
    let required = load("a")
    let v10 = await isCancelled(lease)
    XCTAssertTrue(v10)
    await settle()
    let v11 = await network.startedKeys
    XCTAssertEqual(v11, ["a", "a"])
    let fresh = Data([7])
    await network.resolve("a", fresh)
    let v103 = try await required.value
    XCTAssertEqual(v103, fresh)
  }

  func testBoundsReservationsAndPrioritisesVisibleWork() async throws {
    let work = (0..<6).map { load(String($0)) }
    await settle()
    let lease = load("spec", lease: true)
    await settle()
    let next = load("visible")
    await settle()
    let v12 = await loader.pending
    XCTAssertEqual(v12, 8)
    let v13 = await loader.reservedBytes
    XCTAssertEqual(v13, 8 * (8 * 2 + 16 * 3))
    await network.resolve("0")
    _ = try await work[0].value
    await settle()
    let v14 = await network.startedKeys.last
    XCTAssertEqual(v14, "visible")
    lease.cancel()
    let v15 = await isCancelled(lease)
    XCTAssertTrue(v15)
    let v16 = await loader.pending
    XCTAssertEqual(v16, 6)
    await loader.dispose()
    for task in work.dropFirst() + [next] { _ = await isCancelled(task) }
    let v17 = await loader.reservedBytes
    XCTAssertEqual(v17, 0)
  }
}
