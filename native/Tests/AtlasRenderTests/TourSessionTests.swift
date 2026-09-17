import XCTest
import simd
import AtlasTestSupport
@testable import AtlasCore
@testable import AtlasRender

/// The road trip over the local full release through the session's tour surface: every stop is reached, none is
/// skipped, and the runner finishes (the web's ?tourtest journey, with a simulated clock).
@MainActor
final class TourSessionTests: XCTestCase {
  func testRoadTripReachesEveryStopOverTheLocalCatalog() async throws {
    guard RepoPaths.exists("public/data/dr1/0.points.bin"), RepoPaths.exists("public/data/models/0.bin"), RepoPaths.exists("public/data/galaxy-search.json") else { throw XCTSkip("Full catalog not present locally") }
    let session = try ModelSessionTests.makeSession()
    var now = 1.0
    func frames(_ count: Int) async { for _ in 0..<count { _ = session.tick(now: now); now += 1 / 30; for _ in 0..<50 { await Task.yield() } } }
    await frames(40)
    XCTAssertNotNil(session.modelManifest)
    await session.openNameIndex()
    XCTAssertNotNil(session.findName("NGC 3982"), "catalog stops resolve by exact name")
    XCTAssertNil(session.findName("Andromeda"), "nearby names carry no catalog reference")

    var timers: [(id: Int, due: Double, action: @MainActor () -> Void)] = [], nextTimer = 0
    var states: [TourState] = [], notices: [String] = []
    let route = try XCTUnwrap(session.reference.tours.first { $0.key == "road-trip" })
    let hooks = TourHooks(showCosmicHorizon: { session.cosmicHorizon = $0 }, resolveCatalog: { session.findName($0) }, onChange: { states.append($0) }, notify: { notices.append($0) })
    let tour = Tour(atlas: SessionTourAtlas(session), tour: route, nearby: session.reference.nearby.entries, hooks: hooks,
                    scheduler: { seconds, action in let id = nextTimer; nextTimer += 1; timers.append((id, now + seconds, action)); return { timers.removeAll { $0.id == id } } })
    tour.clockSpeed = 20
    tour.start()
    var count = 0
    while tour.state.status != .finished && count < 6000 {
      await frames(1); count += 1
      for timer in timers where timer.due <= now { timers.removeAll { $0.id == timer.id }; timer.action() }
    }
    XCTAssertEqual(tour.state.status, .finished, "statuses: \(states.map(\.status))")
    XCTAssertEqual(Set(states.compactMap { $0.stop?.id }), Set(route.stops.map(\.id)), "every stop was presented")
    XCTAssertTrue(notices.allSatisfy { !$0.lowercased().contains("skipp") }, notices.description)
    XCTAssertEqual(states.filter { $0.status == .dwelling }.count, route.stops.count, "each stop dwelled once")
    XCTAssertEqual(session.selected?.targetId, nil, "the overview clears the selection")
  }
}
