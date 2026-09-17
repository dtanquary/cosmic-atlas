import XCTest
import simd
import AtlasTestSupport
@testable import AtlasCore
@testable import AtlasRender

/// The session over the full local dr1 release with its model sidecars: pinned previews, a name visit, automatic
/// residency within the 12-model pool and 4 in-flight requests, body picking, the nearby layer and home identities.
@MainActor
final class ModelSessionTests: XCTestCase {
  static let reference = try! ReferenceData(directory: RepoPaths.file("src/data"))

  static func makeSession() throws -> AtlasSession {
    let disk = ChunkLoader(fetch: { url, asset, kind, count in try AssetVerifier.verify(compressed: try Data(contentsOf: url), asset: asset, kind: kind, count: count) })
    let profiles = ChunkLoader(fetch: { url, asset, kind, count in try AssetVerifier.verify(compressed: try Data(contentsOf: url), asset: asset, kind: kind, count: count) })
    let session = try AtlasSession(renderer: try AtlasRenderer(), reference: Self.reference, loader: disk, profileLoader: profiles)
    session.viewportPoints = [800, 500]; session.scale = 1
    try session.load(release: CatalogRelease(manifestURL: RepoPaths.file("public/data/dr1/manifest.json")), manifestData: try RepoPaths.data("public/data/dr1/manifest.json"))
    return session
  }
  var maxInFlight = 0
  func settle(_ session: AtlasSession, frames: Int = 60, step: Double = 0.05, from start: Double = 1) async -> Double {
    var now = start
    for _ in 0..<frames { _ = session.tick(now: now); now += step; maxInFlight = max(maxInFlight, session.modelRequests.count); for _ in 0..<50 { await Task.yield() } }
    return now
  }

  func testPreviewsVisitsResidencyPickingAndIdentities() async throws {
    guard RepoPaths.exists("public/data/dr1/0.points.bin"), RepoPaths.exists("public/data/models/0.bin") else { throw XCTSkip("Full catalog not present locally") }
    let session = try Self.makeSession()
    var now = await settle(session, frames: 40)
    XCTAssertNotNil(session.modelManifest, "the model catalog opens for the full release")
    XCTAssertEqual(session.resolvedGalaxies.count, 2, "two pinned previews")
    XCTAssertEqual(session.nearbyGalaxies.count, 6)
    // Visit NGC 3982 by name: the pinned preview is that galaxy, so the visit is observer-facing at 12 radii.
    let index = try JSONDecoder().decode(NameIndex.self, from: RepoPaths.data("public/data/galaxy-search.json"))
    let entry = try XCTUnwrap(index.entries.first { $0.name == "NGC 3982" }?.catalogEntry)
    var arrived: Bool? = nil
    let started = try await session.visitCatalog(entry, seconds: 0, completion: { arrived = $0 })
    XCTAssertEqual(started, true); XCTAssertEqual(arrived, true)
    XCTAssertEqual(session.selected?.targetId, "39633325333155389")
    let model = try XCTUnwrap(session.resolvedFor(entry.id))
    XCTAssertEqual(session.orbitDistance, model.radius * 12, accuracy: 1e-9)
    now = await settle(session, frames: 40, from: now)
    XCTAssertTrue(model.visible); XCTAssertEqual(model.blend, 1, accuracy: 1e-9)
    let frame = session.tick(now: now)
    XCTAssertTrue(frame.models.contains { $0 === model })
    let target = OffscreenTarget(renderer: session.renderer, width: 800, height: 500)
    let stats = target.render(frame)
    XCTAssertGreaterThanOrEqual(stats.models, 1)
    // Tapping the body selects it analytically, without the GPU pass.
    session.clearSelection()
    await session.pick(drawableX: 400, drawableY: 250)
    XCTAssertEqual(session.selected?.id, entry.id)
    XCTAssertEqual(session.viewState.identity, .desi(node: entry.node, row: entry.row, targetId: entry.targetId))
    // Automatic residency a few Mpc out: neighbours resolve within the pool and request limits.
    session.focusAt(target: model.center, distance: 3, direction: OVERVIEW_DIRECTION, seconds: 0)
    now = await settle(session, frames: 200, from: now)
    XCTAssertGreaterThan(session.resolvedGalaxies.count, 2, "automatic models resolved near NGC 3982")
    XCTAssertLessThanOrEqual(session.resolvedGalaxies.count, MODEL_LIMIT)
    XCTAssertLessThanOrEqual(maxInFlight, 4)
    XCTAssertEqual(session.visibleEvictions, 0)
    XCTAssertGreaterThan(session.stats.managedMiB, 0)
    // The nearby layer and home carry their own identities.
    XCTAssertTrue(session.visitNearby(-1))
    XCTAssertEqual(session.selected?.targetId, "nearby:m31")
    XCTAssertEqual(session.viewState.identity, .nearby("m31"))
    _ = await session.applyView(ViewState(target: .zero, camera: [0, 0, 0.06], identity: .sun))
    XCTAssertTrue(session.homeSelected); XCTAssertEqual(session.viewState.identity, .sun)
    XCTAssertTrue(session.visitMilkyWay())
    XCTAssertEqual(session.viewState.identity, .core)
    now = await settle(session, frames: 10, from: now)
    XCTAssertTrue(session.milkyWay.visible)
    XCTAssertTrue(session.destinationReady(Self.reference.tours[0].stops.first { $0.target.kind == .core }!))
  }
}
