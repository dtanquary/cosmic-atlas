import XCTest
import simd
import AtlasTestSupport
@testable import AtlasCore
@testable import AtlasRender

/// The session streams the development subset from disk: the overview draws the root, approaching Coma refines the
/// frontier, nothing visible is evicted, and picking through the session selects a real record.
@MainActor
final class SessionTests: XCTestCase {
  static let reference = try! ReferenceData(directory: RepoPaths.file("src/data"))
  static let manifestData = try! RepoPaths.data("public/data/development/manifest.json")

  func makeSession() throws -> AtlasSession {
    let renderer = try AtlasRenderer()
    let loader = ChunkLoader(fetch: { url, asset, kind, count in
      let data = try Data(contentsOf: url)
      return try AssetVerifier.verify(compressed: data, asset: asset, kind: kind, count: count)
    })
    let session = try AtlasSession(renderer: renderer, reference: Self.reference, loader: loader)
    session.viewportPoints = [800, 500]; session.scale = 1
    try session.load(release: CatalogRelease(manifestURL: RepoPaths.file("public/data/development/manifest.json")), manifestData: Self.manifestData)
    return session
  }
  func settle(_ session: AtlasSession, frames: Int = 60, step: Double = 0.05) async {
    var now = 1.0
    for _ in 0..<frames { _ = session.tick(now: now); now += step; for _ in 0..<50 { await Task.yield() } }
  }

  func testOverviewDrawsRootThenRefinesTowardComa() async throws {
    guard RepoPaths.exists("public/data/development/0.points.bin") else { throw XCTSkip("Development chunks not present locally") }
    let session = try makeSession()
    await settle(session)
    XCTAssertTrue(session.ready)
    // Like the web overview (142 draws, ~2M points), the adaptive budget refines the root into many chunks.
    let overview = session.drawn
    XCTAssertGreaterThan(overview.count, 8)
    XCTAssertFalse(overview.contains("0"))
    XCTAssertLessThanOrEqual(session.stats.drawn, session.stats.budget)
    XCTAssertGreaterThan(session.stats.drawn, 65536)
    XCTAssertGreaterThan(session.stats.managedMiB, 1)
    // Coma cluster stop from the road trip: a close view must load descendants and draw more than the root.
    let coma = Self.reference.tours.first { $0.key == "road-trip" }!.stops.first { $0.target.kind == .cluster }!
    let at = SIMD3<Double>(coma.target.positionMpc![0], coma.target.positionMpc![1], coma.target.positionMpc![2])
    session.focusAt(target: at, distance: coma.distanceMpc!, direction: -simd_normalize(at), seconds: 0)
    await settle(session, frames: 120)
    XCTAssertNotEqual(Set(session.drawn), Set(overview), "a close view chooses a different frontier")
    XCTAssertLessThanOrEqual(session.stats.drawn, session.stats.budget)
    XCTAssertEqual(session.visibleEvictions, 0)
    XCTAssertFalse(session.stats.blocked)
    let frame = session.tick(now: 100)
    let target = OffscreenTarget(renderer: session.renderer, width: 800, height: 500)
    let stats = target.render(frame)
    XCTAssertEqual(stats.draws, frame.chunks.count + frame.markers.count)
    session.didDraw(stats)
    XCTAssertEqual(session.stats.calls, stats.draws)
  }

  func testTravelArrivesAndInputTakesOver() async throws {
    let session = try makeSession()
    var arrived: [Bool] = []
    let direction = simd_normalize(SIMD3<Double>(0, 1, 1)) // off the pole, where OrbitControls' makeSafe would nudge
    session.focusAt(target: [1, 2, 3], distance: 5, direction: direction, seconds: 1, completion: { arrived.append($0) })
    _ = session.tick(now: 10); _ = session.tick(now: 10.5)
    XCTAssertEqual(arrived, [])
    session.userInputBegan()
    XCTAssertEqual(arrived, [false])
    session.focusAt(target: [1, 2, 3], distance: 5, direction: direction, seconds: 1, completion: { arrived.append($0) })
    _ = session.tick(now: 20); _ = session.tick(now: 21.5)
    XCTAssertEqual(arrived, [false, true])
    XCTAssertEqual(simd_distance(session.camera.position, SIMD3<Double>(1, 2, 3) + direction * 5), 0, accuracy: 1e-9)
    // Placement goes through the orbit's spherical round trip, so compare decoded values (the web's share probe allows 1e-9).
    let link = try XCTUnwrap(ViewLink.encode(session.viewState)), decoded = try XCTUnwrap(ViewLink.decode(link))
    XCTAssertEqual(simd_distance(decoded.target, [1, 2, 3]), 0, accuracy: 1e-9)
    XCTAssertEqual(simd_distance(decoded.camera - decoded.target, direction * 5), 0, accuracy: 1e-9)
    XCTAssertNil(decoded.identity)
  }

  func testPickThroughTheSessionSelectsARealRecord() async throws {
    guard RepoPaths.exists("public/data/development/0.points.bin") else { throw XCTSkip("Development chunks not present locally") }
    let session = try makeSession()
    session.viewportPoints = [512, 512]
    await settle(session)
    let chunk = try XCTUnwrap(session.cache["0"])
    let row = 4321, p = chunk.positions
    let world = chunk.node.center + SIMD3<Double>(Double(p[row * 3]), Double(p[row * 3 + 1]), Double(p[row * 3 + 2]))
    session.focusAt(target: world, distance: 0.5, direction: OVERVIEW_DIRECTION, seconds: 0)
    await settle(session, frames: 30)
    _ = session.tick(now: 50)
    var selections: [Galaxy?] = []
    session.onSelection = { selections.append($0) }
    await session.pick(drawableX: 256, drawableY: 256)
    let galaxy = try XCTUnwrap(selections.last ?? nil)
    XCTAssertEqual(simd_distance(galaxy.position, world), 0, accuracy: 0.001)
    XCTAssertNotNil(galaxy.targetId.wholeMatch(of: /^-?\d+$/))
    // The refined frontier drew this record from a descendant chunk; the address names that chunk's row.
    let address = try XCTUnwrap(session.selectedAddress)
    XCTAssertEqual(session.viewState.identity, .desi(node: address.node, row: address.row, targetId: galaxy.targetId))
    let verified = try await session.verify(entry: CatalogEntry(id: galaxy.id, node: address.node, row: address.row, targetId: galaxy.targetId))
    XCTAssertEqual(verified, galaxy)
    // The same record through the root sample (row 4321 of node 0) verifies to the same identity.
    let viaRoot = try await session.verify(entry: CatalogEntry(id: galaxy.id, node: "0", row: row, targetId: galaxy.targetId))
    XCTAssertEqual(viaRoot.targetId, galaxy.targetId)
    do { _ = try await session.verify(entry: CatalogEntry(id: galaxy.id, node: "0", row: row, targetId: "1")); XCTFail("wrong id accepted") } catch { XCTAssertEqual((error as? AtlasError)?.message, Strings.linkUnknownGalaxy) }
  }
}
