import XCTest
import simd
import AtlasTestSupport
@testable import AtlasCore

// Port of tests/tour.test.ts and tests/trip-tour.test.ts. Visits settle through completions and timers through a manual clock,
// so `await settle()` / `flush()` become plain calls and `vi.getTimerCount()` is `runner.pendingTimers`.

/// One recorded atlas call; `.identity` on the expected side matches any view with that identity (`expect.objectContaining`).
enum Arg: Equatable {
  case n(Double), i(Int), entry(CatalogEntry), view(ViewState), identity(ViewIdentity?)
  static func == (a: Arg, b: Arg) -> Bool {
    switch (a, b) {
    case (.n(let x), .n(let y)): x == y
    case (.i(let x), .i(let y)): x == y
    case (.entry(let x), .entry(let y)): x == y
    case (.view(let x), .view(let y)): x == y
    case (.identity(let x), .identity(let y)): x == y
    case (.view(let v), .identity(let i)), (.identity(let i), .view(let v)): v.identity == i
    default: false
    }
  }
}
struct Call: Equatable {
  var method: String, args: [Arg]
  init(_ method: String, _ args: [Arg]) { self.method = method; self.args = args }
  var view: ViewState? { if case .view(let v) = args[0] { v } else { nil } }
}

@MainActor final class FakeAtlas: TourAtlas {
  var catalogCount = 1_000_000
  var cameraPosition = SIMD3<Double>(0, 0, 1), orbitTarget = SIMD3<Double>(), approachDirection = SIMD3<Double>(0.6, 0, 0.8)
  var calls: [Call] = []
  var canNavigate: (() -> Bool)? = nil
  var preserveTarget: Bool? = nil
  var stops = 0
  /// `Object.assign(atlas, {tourDestinationReady})` / `{prepareCatalog}`.
  var ready: (() -> Bool)? = nil
  var prepare: ((CatalogEntry) -> (() -> Void)?)? = nil
  /// `visitMilkyWay = () => undefined`.
  var startable = true
  /// `visitCatalog = () => Promise.reject(new Error(message))`.
  var catalogFailure: String? = nil
  /// `visitCatalog` replaced by a promise the test completes itself, outside `pending` so `stopTravel` cannot settle it.
  var detachedCatalog = false
  var catalogCompletion: VisitCompletion? = nil
  private var pending: VisitCompletion? = nil

  /// Like the explorer: a running travel resolves false; nothing pending is a no-op.
  func stopTravel() { stops += 1; if let resolve = pending { pending = nil; resolve(.interrupted) } }
  private func visit(_ method: String, _ args: [Arg], _ completion: @escaping VisitCompletion) -> Bool {
    guard startable else { return false }
    calls.append(Call(method, args)); pending = completion; return true
  }
  func reset(seconds: Double, completion: @escaping VisitCompletion) -> Bool { visit("reset", [.n(seconds)], completion) }
  func viewCosmicHorizon(seconds: Double, completion: @escaping VisitCompletion) -> Bool { visit("viewCosmicHorizon", [.n(seconds)], completion) }
  func visitMilkyWay(seconds: Double, completion: @escaping VisitCompletion) -> Bool { visit("visitMilkyWay", [.n(seconds)], completion) }
  func visitNearby(id: Int, seconds: Double, completion: @escaping VisitCompletion) -> Bool { visit("visitNearby", [.i(id), .n(seconds)], completion) }
  func visitCatalog(entry: CatalogEntry, canNavigate: @escaping () -> Bool, seconds: Double, completion: @escaping VisitCompletion) -> Bool {
    if let catalogFailure { completion(.failed(catalogFailure)); return true }
    self.canNavigate = canNavigate
    if detachedCatalog { catalogCompletion = completion; return true }
    return visit("visitCatalog", [.entry(entry), .n(seconds)], completion)
  }
  func applyView(_ state: ViewState, seconds: Double, preserveTarget: Bool, canNavigate: (() -> Bool)?, completion: @escaping VisitCompletion) -> Bool {
    self.preserveTarget = preserveTarget; self.canNavigate = canNavigate
    return visit("applyView", [.view(state), .n(seconds)], completion)
  }
  func prepareCatalog(entry: CatalogEntry) -> (() -> Void)? { prepare?(entry) }
  func tourDestinationReady(_ stop: TourStop) -> Bool? { ready?() }
  func settle(_ outcome: VisitOutcome) { let resolve = pending; pending = nil; resolve?(outcome) }
  func settle(arrived: Bool) { settle(arrived ? .arrived : .interrupted) }
  var last: Call { calls.last! }
}

/// Fake timers: due actions fire in order, including ones scheduled while advancing, like `vi.advanceTimersByTimeAsync`.
@MainActor final class ManualClock {
  private var nowMs = 0, nextId = 0
  private var timers: [(due: Int, id: Int, action: @MainActor () -> Void)] = []
  var count: Int { timers.count }
  func schedule(seconds: Double, action: @escaping @MainActor () -> Void) -> () -> Void {
    let id = nextId; nextId += 1
    timers.append((nowMs + Int((seconds * 1000).rounded()), id, action))
    return { self.timers.removeAll { $0.id == id } }
  }
  func advance(ms: Int) {
    let target = nowMs + ms
    while let i = timers.indices.min(by: { timers[$0].due < timers[$1].due }), timers[i].due <= target {
      let timer = timers.remove(at: i); nowMs = timer.due; timer.action()
    }
    nowMs = target
  }
  func advance(seconds: Double) { advance(ms: Int((seconds * 1000).rounded())) }
}

final class AbortSignal { var aborted = false }

@MainActor final class Harness {
  let atlas = FakeAtlas(), clock = ManualClock()
  var shell: [Bool] = [], notices: [String] = [], states: [TourState] = []
  var runner: Tour!
  init(_ tour: TourData = TourTests.roadTrip, available: Bool = true) {
    let hooks = TourHooks(showCosmicHorizon: { [unowned self] in shell.append($0) }, resolveCatalog: { _ in available ? TourTests.entry : nil },
                          onChange: { [unowned self] in states.append($0) }, notify: { [unowned self] in notices.append($0) })
    runner = Tour(atlas: atlas, tour: tour, nearby: TourTests.reference.nearby.entries, hooks: hooks, scheduler: clock.schedule)
  }
  func dwell() { clock.advance(seconds: runner.state.stop!.dwellSeconds ?? DWELL_SECONDS) }
  func advance(ms: Int) { clock.advance(ms: ms) }
}

@MainActor final class TourTests: XCTestCase {
  static let reference = try! ReferenceData(directory: RepoPaths.file("src/data"))
  static let entry = CatalogEntry(id: 13426480, node: "512", row: 20296, targetId: "39633325333155389")
  static let roadTrip = reference.tours.first(where: { $0.key == "road-trip" })!
  static let zoomOut = reference.tours.first(where: { $0.key == "zoom-out" })!
  static func nearbyId(_ key: String) -> Int { reference.nearby.entries.first { $0.key == key }!.id }
  let roadTrip = TourTests.roadTrip, zoomOut = TourTests.zoomOut, entry = TourTests.entry

  func expectState(_ runner: Tour, index: Int? = nil, status: TourStatus? = nil, autoplay: Bool? = nil, line: UInt = #line) {
    if let index { XCTAssertEqual(runner.state.index, index, line: line) }
    if let status { XCTAssertEqual(runner.state.status, status, line: line) }
    if let autoplay { XCTAssertEqual(runner.state.autoplay, autoplay, line: line) }
  }

  func testStartsDwellOnlyAfterDestinationReadinessWithOneCancellableTimer() {
    let h = Harness(), atlas = h.atlas, runner = h.runner!; var ready = false; atlas.ready = { ready }
    runner.start(); atlas.settle(arrived: true); XCTAssertEqual(runner.state.status, .preparing); XCTAssertEqual(runner.pendingTimers, 1)
    h.advance(ms: 1000); XCTAssertEqual(runner.state.index, 0)
    ready = true; h.advance(ms: 200); XCTAssertEqual(runner.state.status, .dwelling); XCTAssertEqual(runner.pendingTimers, 1)
    h.advance(ms: Int(DWELL_SECONDS * 1000) - 1); XCTAssertEqual(runner.state.index, 0)
    runner.pause(); XCTAssertEqual(runner.pendingTimers, 0)
  }
  func testTimesOutPartialDataAndPermitsExplicitContinuationOrAnotherStop() {
    let h = Harness(), atlas = h.atlas, runner = h.runner!; atlas.ready = { false }
    runner.start(); atlas.settle(arrived: true); h.advance(ms: 8000)
    expectState(runner, status: .partial, autoplay: false); XCTAssertEqual(runner.pendingTimers, 0)
    runner.play(); XCTAssertEqual(runner.state.status, .dwelling); h.dwell(); XCTAssertEqual(runner.state.index, 1)
    atlas.settle(arrived: true); runner.next(); XCTAssertEqual(runner.state.index, 2); XCTAssertEqual(runner.pendingTimers, 0)
    h.advance(ms: 20000); XCTAssertEqual(runner.state.status, .travelling)
  }
  func testPreparesOnlyTheNextCatalogStopDuringAutomaticDwellAndReleasesItOnPauseJumpAndExit() {
    let h = Harness(), atlas = h.atlas, runner = h.runner!; var signals: [AbortSignal] = []
    atlas.prepare = { _ in let signal = AbortSignal(); signals.append(signal); return { signal.aborted = true } }
    runner.jump("triangulum"); atlas.settle(arrived: true); XCTAssertEqual(signals.count, 0)
    runner.play(); XCTAssertEqual(signals.count, 1); XCTAssertFalse(signals[0].aborted); runner.pause(); XCTAssertTrue(signals[0].aborted)
    runner.play(); runner.jump("andromeda"); XCTAssertTrue(signals[1].aborted); atlas.settle(arrived: true)
    runner.start(5); atlas.settle(arrived: true); runner.exit(); XCTAssertTrue(signals[2].aborted); XCTAssertEqual(runner.pendingTimers, 0)
  }
  func testCannotResumeAStaleReadinessCheckAfterInputOrExit() {
    let h = Harness(), atlas = h.atlas, runner = h.runner!; var ready = false; atlas.ready = { ready }
    runner.start(); atlas.settle(arrived: true); runner.pause(); ready = true; h.advance(ms: 20000)
    XCTAssertEqual(runner.state.status, .paused); XCTAssertEqual(runner.state.index, 0); runner.play(); XCTAssertEqual(runner.state.status, .dwelling)
    runner.exit(); h.advance(ms: 20000); XCTAssertEqual(runner.state.status, .idle); XCTAssertEqual(runner.pendingTimers, 0)
  }
  func testUsesStableChapterIdsAndLandsPausedWhenJumpingOrReturningAfterExploration() {
    let h = Harness(), atlas = h.atlas, runner = h.runner!; runner.start(); atlas.settle(arrived: true)
    runner.jump("andromeda"); expectState(runner, index: 3, status: .travelling, autoplay: false)
    XCTAssertEqual(atlas.last.method, "visitNearby"); atlas.settle(arrived: true)
    XCTAssertEqual(runner.state.status, .paused); XCTAssertEqual(runner.pendingTimers, 0)
    atlas.cameraPosition.x += 1; runner.returnToStop(); XCTAssertEqual(runner.state.index, 3); atlas.settle(arrived: true)
    XCTAssertEqual(runner.state.status, .paused)
    let calls = atlas.calls.count; runner.jump("unknown"); XCTAssertEqual(atlas.calls.count, calls)
  }
  func testRelaxedPacingDoublesDwellWithoutChangingTravelTimeOrAddingTimers() {
    let h = Harness(), atlas = h.atlas, runner = h.runner!; runner.setPace(.relaxed); runner.start()
    XCTAssertEqual(atlas.last.args, [.n(4)]); atlas.settle(arrived: true)
    h.advance(ms: Int(DWELL_SECONDS * 1000)); XCTAssertEqual(runner.state.index, 0); XCTAssertEqual(runner.pendingTimers, 1)
    h.advance(ms: Int(DWELL_SECONDS * 1000)); XCTAssertEqual(runner.state.index, 1)
    atlas.settle(arrived: true); runner.setPace(.quick); XCTAssertEqual(runner.pendingTimers, 1)
    h.dwell(); XCTAssertEqual(runner.state.index, 2)
  }
  func testManualPacingCancelsPendingTravelAndNeverAdvancesAutomaticallyIncludingAfterPlay() {
    let h = Harness(), atlas = h.atlas, runner = h.runner!; runner.start(); runner.setPace(.manual)
    expectState(runner, status: .paused, autoplay: false); XCTAssertEqual(runner.pendingTimers, 0)
    runner.start(3); atlas.settle(arrived: true); runner.play(); h.advance(ms: 120000)
    expectState(runner, index: 3, status: .paused, autoplay: false); XCTAssertEqual(runner.pendingTimers, 0)
    runner.next(); atlas.settle(arrived: true); XCTAssertEqual(runner.state.index, 4); XCTAssertEqual(runner.pendingTimers, 0)
    runner.setPace(.quick); XCTAssertEqual(runner.state.status, .paused); runner.play(); XCTAssertEqual(runner.pendingTimers, 1)
  }
  func testPlaysTheRoadTripChoosingTheVisitPerKindWithEachStopsTravelSeconds() throws {
    let h = Harness(), atlas = h.atlas, runner = h.runner!
    runner.start()
    let expected: [(String, [Arg])] = [
      ("visitMilkyWay", [.n(4)]), ("visitNearby", [.i(Self.nearbyId("lmc")), .n(5)]), ("visitNearby", [.i(Self.nearbyId("smc")), .n(5)]), ("visitNearby", [.i(Self.nearbyId("m31")), .n(5)]),
      ("applyView", [.identity(.nearby("m31")), .n(4)]), ("visitNearby", [.i(Self.nearbyId("m33")), .n(5)]),
      ("visitCatalog", [.entry(entry), .n(6)]), ("visitCatalog", [.entry(entry), .n(5)]), ("applyView", [.identity(nil), .n(6)]), ("reset", [.n(6)]),
    ]
    for (i, (method, args)) in expected.enumerated() {
      expectState(runner, index: i, status: .travelling, autoplay: true); XCTAssertEqual(runner.state.stop!.title, roadTrip.stops[i].title)
      XCTAssertEqual(atlas.calls.count, i + 1); XCTAssertEqual(atlas.last.method, method); XCTAssertEqual(atlas.last.args, args)
      atlas.settle(arrived: true)
      XCTAssertEqual(runner.state.status, .dwelling); XCTAssertEqual(runner.pendingTimers, 1)
      h.dwell()
    }
    expectState(runner, index: 9, status: .finished, autoplay: false)
    XCTAssertEqual(runner.pendingTimers, 0); XCTAssertEqual(atlas.calls.count, 10); XCTAssertEqual(h.shell, [])
    // The overview caption names the active dataset's accepted count, not the full-release figure.
    XCTAssertTrue(roadTrip.stops[9].caption.contains("{catalogCount}"))
    XCTAssertTrue(runner.state.stop!.caption.contains("1,000,000 accepted DESI DR1 observations in this dataset"))
    XCTAssertFalse(runner.state.stop!.caption.contains("{catalogCount}"))
    // Satellite framing: observer-facing from Andromeda, pulled back to the stop's 0.16 Mpc.
    let m31 = Self.reference.nearby.entries.first { $0.key == "m31" }!, at = cartesian(ra: m31.raDeg, dec: m31.decDeg, distance: m31.distanceMpc)
    let satellites = try XCTUnwrap(atlas.calls[4].view)
    XCTAssertEqual(satellites.target, at)
    for i in 0..<3 { XCTAssertEqual(satellites.camera[i], at[i] * (1 - 0.16 / 0.785), accuracy: 1e-12) }
    // Cluster framing: retain the NED center, looking outward from the observer side instead of back toward the Sun.
    let coma = roadTrip.stops[8], cluster = try XCTUnwrap(atlas.calls[8].view), position = try XCTUnwrap(coma.target.positionMpc)
    XCTAssertEqual([cluster.target.x, cluster.target.y, cluster.target.z], position)
    let center = cluster.target, camera = cluster.camera, forward = simd_normalize(center - camera)
    XCTAssertLessThan(simd_dot(-camera, forward), 0) // Sun is behind the camera
    XCTAssertEqual(simd_dot(forward, simd_normalize(center)), 1, accuracy: 1e-12)
    XCTAssertEqual(simd_distance(camera, center), try XCTUnwrap(coma.distanceMpc), accuracy: 1e-12)
  }
  func testFramesTheZoomOutSunViewFromTheOriginLocalGroupMidpointOverviewResetAndTheCMBShellHook() throws {
    let h = Harness(zoomOut), atlas = h.atlas, runner = h.runner!
    runner.start()
    XCTAssertEqual(atlas.last, Call("applyView", [.view(ViewState(target: [0, 0, 0], camera: [0.6 * 0.003, 0, 0.8 * 0.003], identity: .sun)), .n(4)]))
    atlas.settle(arrived: true); h.dwell()
    XCTAssertEqual(atlas.last, Call("visitMilkyWay", [.n(5)]))
    atlas.settle(arrived: true); h.dwell()
    let group = zoomOut.stops[2], view = try XCTUnwrap(atlas.last.view), position = try XCTUnwrap(group.target.positionMpc)
    XCTAssertEqual(atlas.last.method, "applyView"); XCTAssertEqual(atlas.last.args[1], .n(6))
    XCTAssertNil(view.identity); XCTAssertEqual([view.target.x, view.target.y, view.target.z], position)
    for i in 0..<3 { XCTAssertEqual(view.camera[i], position[i] + [0.6, 0, 0.8][i] * 1.2, accuracy: 1e-12) }
    atlas.settle(arrived: true); h.dwell()
    XCTAssertEqual(atlas.last, Call("reset", [.n(6)])); XCTAssertEqual(h.shell, [])
    atlas.settle(arrived: true); h.dwell()
    XCTAssertEqual(h.shell, [true]); XCTAssertEqual(atlas.last, Call("viewCosmicHorizon", [.n(6)]))
    atlas.settle(arrived: true); h.dwell()
    XCTAssertEqual(runner.state.status, .finished); XCTAssertEqual(h.shell, [true]) // the shell stays until exit
    runner.exit()
    XCTAssertEqual(h.shell, [true, false]); XCTAssertEqual(runner.state, TourState(index: -1, status: .idle, stop: nil, autoplay: false))
    runner.start(4); atlas.settle(arrived: true); runner.previous()
    XCTAssertEqual(h.shell, [true, false, true, false]); XCTAssertEqual(atlas.last, Call("reset", [.n(6)]))
  }
  func testPausesWhenInputTakesOverATravelAndSchedulesNothingPlayTravelsBack() {
    let h = Harness(), atlas = h.atlas, runner = h.runner!
    runner.start(); atlas.settle(arrived: false)
    expectState(runner, index: 0, status: .paused, autoplay: false); XCTAssertEqual(runner.pendingTimers, 0)
    runner.play()
    expectState(runner, index: 0, status: .travelling, autoplay: true); XCTAssertEqual(atlas.calls.count, 2); XCTAssertEqual(atlas.last.method, "visitMilkyWay")
  }
  func testPlaySchedulesExactlyOneTimerPauseClearsItAndAPauseDuringTravelLandsPaused() {
    let h = Harness(), atlas = h.atlas, runner = h.runner!
    runner.start(); atlas.settle(arrived: true)
    XCTAssertEqual(runner.pendingTimers, 1)
    runner.pause()
    expectState(runner, status: .paused, autoplay: false); XCTAssertEqual(runner.pendingTimers, 0)
    h.advance(ms: 60000); XCTAssertEqual(atlas.calls.count, 1)
    runner.play()
    expectState(runner, status: .dwelling, autoplay: true); XCTAssertEqual(runner.pendingTimers, 1); XCTAssertEqual(atlas.calls.count, 1)
    h.dwell()
    expectState(runner, index: 1, status: .travelling)
    runner.pause() // mid-travel: the explorer's travel is stopped and the cancelled arrival lands paused
    XCTAssertEqual(atlas.stops, 1)
    expectState(runner, index: 1, status: .paused, autoplay: false); XCTAssertEqual(runner.pendingTimers, 0)
    runner.next(); atlas.settle(arrived: true) // stepping with autoplay off lands paused, never dwelling
    expectState(runner, index: 2, status: .paused, autoplay: false); XCTAssertEqual(runner.pendingTimers, 0)
  }
  func testPausesWhenAVisitCouldNotStartInsteadOfDwellingAtTheWrongPose() {
    let h = Harness(), atlas = h.atlas, runner = h.runner!
    atlas.startable = false
    runner.start()
    expectState(runner, index: 0, status: .paused, autoplay: false); XCTAssertEqual(runner.pendingTimers, 0)
  }
  func testDividesTravelAndDwellByTheProbeClockSpeed() {
    let h = Harness(), atlas = h.atlas, runner = h.runner!
    runner.clockSpeed = 4
    runner.start()
    XCTAssertEqual(atlas.last, Call("visitMilkyWay", [.n(1)]))
    atlas.settle(arrived: true)
    h.advance(ms: Int(DWELL_SECONDS * 250) - 1); XCTAssertEqual(runner.state.status, .dwelling)
    h.advance(ms: 1); expectState(runner, index: 1, status: .travelling)
  }
  func testDwellsForTheDefaultEightSecondsUnlessAStopSetsItsOwn() {
    var second = roadTrip.stops[1]; second.dwellSeconds = 2
    let h = Harness(TourData(key: roadTrip.key, title: roadTrip.title, summary: roadTrip.summary, stops: [roadTrip.stops[0], second])), atlas = h.atlas, runner = h.runner!
    runner.start(); atlas.settle(arrived: true)
    h.advance(ms: Int(DWELL_SECONDS * 1000) - 1); XCTAssertEqual(runner.state.status, .dwelling)
    h.advance(ms: 1); expectState(runner, index: 1, status: .travelling)
    atlas.settle(arrived: true)
    h.advance(ms: 1999); XCTAssertEqual(runner.state.status, .dwelling)
    h.advance(ms: 1); XCTAssertEqual(runner.state.status, .finished)
  }
  func testPausesInsteadOfHoppingWhenThePoseChangedDuringTheDwell() {
    let h = Harness(), atlas = h.atlas, runner = h.runner!
    runner.start(); atlas.settle(arrived: true)
    atlas.cameraPosition.x += 1e-8 // below 1e-6 of the 1 Mpc orbit distance: not a user move
    h.dwell()
    expectState(runner, index: 1, status: .travelling); XCTAssertEqual(atlas.calls.count, 2)
    atlas.settle(arrived: true)
    atlas.orbitTarget.y += 1e-5
    h.dwell()
    expectState(runner, index: 1, status: .paused, autoplay: false); XCTAssertEqual(atlas.calls.count, 2)
    runner.play() // still displaced from the arrival pose: travel back instead of hopping
    expectState(runner, index: 1, status: .travelling, autoplay: true); XCTAssertEqual(atlas.calls.count, 3)
  }
  func testSkipsUnresolvedCatalogStopsWithANoticeInTheDirectionOfTravel() {
    let h = Harness(roadTrip, available: false), atlas = h.atlas, runner = h.runner!
    runner.start(6)
    XCTAssertEqual(h.notices, ["NGC 3982 is not available in this dataset; skipping.", "NGC 4026 is not available in this dataset; skipping."])
    expectState(runner, index: 8, status: .travelling); XCTAssertEqual(atlas.calls.map(\.method), ["applyView"])
    atlas.settle(arrived: true)
    XCTAssertEqual(h.notices.last, "Skipped unavailable stops: NGC 3982, NGC 4026.")
    runner.start(6) // a start from a later index still skips forward, not back toward it
    expectState(runner, index: 8, status: .travelling); XCTAssertEqual(atlas.calls.map(\.method), ["applyView", "applyView"]); XCTAssertEqual(h.notices.count, 5)
    atlas.settle(arrived: true)
    runner.previous()
    expectState(runner, index: 5, status: .travelling); XCTAssertEqual(atlas.last, Call("visitNearby", [.i(Self.nearbyId("m33")), .n(5)]))
    XCTAssertEqual(h.notices.filter { $0.contains("not available in this dataset") }.count, 6)
  }
  func testTreatsARejectedVisitLikeAnUnavailableStopAndPassesALiveNavigationGuardToVisitCatalog() throws {
    let h = Harness(), atlas = h.atlas, runner = h.runner!
    runner.start(6)
    let navigate = try XCTUnwrap(atlas.canNavigate); XCTAssertTrue(navigate())
    atlas.catalogFailure = "The name index does not match this catalog."
    runner.next()
    XCTAssertFalse(navigate()) // the superseded NGC 3982 visit must not move the camera
    XCTAssertEqual(h.notices, ["NGC 4026: The name index does not match this catalog. Skipping."])
    expectState(runner, index: 8, status: .travelling); XCTAssertEqual(atlas.last.method, "applyView")
  }
  func testPausesACatalogVisitStillLoadingDataAndIgnoresItsLateCompletion() throws {
    let h = Harness(), atlas = h.atlas, runner = h.runner!
    atlas.detachedCatalog = true
    runner.start(6)
    let navigate = try XCTUnwrap(atlas.canNavigate)
    XCTAssertTrue(navigate())
    runner.pause() // No animation exists yet for stopTravel() to cancel.
    expectState(runner, index: 6, status: .paused, autoplay: false)
    XCTAssertFalse(navigate())
    try XCTUnwrap(atlas.catalogCompletion)(.arrived)
    expectState(runner, index: 6, status: .paused, autoplay: false)
    XCTAssertEqual(runner.pendingTimers, 0)
    runner.play() // Resume retries the same destination with a fresh guard.
    expectState(runner, index: 6, status: .travelling, autoplay: true)
    XCTAssertTrue(try XCTUnwrap(atlas.canNavigate)()); XCTAssertFalse(navigate())
    try XCTUnwrap(atlas.catalogCompletion)(.arrived)
    XCTAssertEqual(runner.state.status, .dwelling)
  }
  func testIgnoresOutOfRangeStopsFinishesAfterTheLastStopAndDropsLateArrivalsAfterExit() {
    let h = Harness(), atlas = h.atlas, runner = h.runner!
    runner.start(99); runner.previous()
    XCTAssertEqual(runner.state.status, .idle); XCTAssertEqual(atlas.calls.count, 0); XCTAssertEqual(h.states.count, 0)
    runner.start(9); atlas.settle(arrived: true)
    runner.next()
    expectState(runner, index: 9, status: .finished, autoplay: false); XCTAssertEqual(runner.pendingTimers, 0)
    runner.play()
    expectState(runner, index: 0, status: .travelling)
    runner.exit() // stops the explorer's travel; the cancelled arrival is ignored
    XCTAssertEqual(atlas.stops, 1); atlas.settle(arrived: true)
    XCTAssertEqual(runner.state.status, .idle); XCTAssertEqual(runner.pendingTimers, 0)
  }

  // tests/trip-tour.test.ts
  func testPreservesTheCreatorCameraAndRevokesAPendingLookupOnPauseOrExit() throws {
    let trip = Trip(title: "Saved route", stops: [.view(id: "saved", name: "Panned galaxy", hash: "#t=1,2,3&c=0.1,0,0&g=desi:512:10:39633325333155389")])
    for action in ["pause", "exit"] {
      let h = Harness(tripRoute(trip, tours: Self.reference.tours)), atlas = h.atlas, tour = h.runner!
      atlas.catalogCount = 1; atlas.cameraPosition = [0, 0, 1]; atlas.orbitTarget = [0, 0, 0]; atlas.approachDirection = [0, 0, 1]
      tour.start(); XCTAssertEqual(atlas.preserveTarget, true); XCTAssertEqual(try XCTUnwrap(atlas.canNavigate)(), true)
      if action == "exit" { tour.exit() } else { tour.pause() }
      XCTAssertEqual(try XCTUnwrap(atlas.canNavigate)(), false); atlas.settle(arrived: false)
      XCTAssertEqual(tour.state.status, action == "exit" ? .idle : .paused); XCTAssertEqual(tour.state.autoplay, false)
    }
  }
}
