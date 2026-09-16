import Foundation
import simd

// Port of src/tour.ts. Visits report through completions and timers through an injected scheduler instead of promises and
// setTimeout, so the runner is deterministic under test; every state transition, notice and camera pose matches the web.

public let DWELL_SECONDS: Double = 8
public enum TourPace: String, Sendable { case quick, relaxed, manual }
public enum TourStatus: String, Sendable { case idle, travelling, preparing, partial, dwelling, paused, finished }
public struct TourState: Sendable, Equatable {
  public var index: Int, status: TourStatus, stop: TourStop?, autoplay: Bool
  public init(index: Int, status: TourStatus, stop: TourStop?, autoplay: Bool) { self.index = index; self.status = status; self.stop = stop; self.autoplay = autoplay }
}
// `CatalogEntry` is the verified visit reference from GalaxySearch.swift.

public enum VisitOutcome: Sendable, Equatable { case arrived, interrupted, failed(String) }
public typealias VisitCompletion = (VisitOutcome) -> Void
/// Schedules `action` after `seconds` and returns its cancel; the runner keeps at most one pending.
public typealias Scheduler = @MainActor (_ seconds: Double, _ action: @escaping @MainActor () -> Void) -> (() -> Void)

/// The explorer surface a tour drives. Each visit returns false when it could not start (then completion is never called);
/// otherwise it later calls completion exactly once: .arrived, .interrupted (input, flight or a newer focus took over), or .failed(message).
@MainActor public protocol TourAtlas: AnyObject {
  var catalogCount: Int { get }
  var cameraPosition: SIMD3<Double> { get }
  var orbitTarget: SIMD3<Double> { get }
  /// milkyWay.approachDirection
  var approachDirection: SIMD3<Double> { get }
  func reset(seconds: Double, completion: @escaping VisitCompletion) -> Bool
  func viewCosmicHorizon(seconds: Double, completion: @escaping VisitCompletion) -> Bool
  func visitMilkyWay(seconds: Double, completion: @escaping VisitCompletion) -> Bool
  func visitNearby(id: Int, seconds: Double, completion: @escaping VisitCompletion) -> Bool
  func visitCatalog(entry: CatalogEntry, canNavigate: @escaping () -> Bool, seconds: Double, completion: @escaping VisitCompletion) -> Bool
  func applyView(_ state: ViewState, seconds: Double, preserveTarget: Bool, canNavigate: (() -> Bool)?, completion: @escaping VisitCompletion) -> Bool
  func stopTravel()
  /// Optional speculative preparation of the next catalog stop; returns a cancel closure, or nil when unsupported.
  func prepareCatalog(entry: CatalogEntry) -> (() -> Void)?
  /// nil when the atlas has no readiness contract (treated as ready).
  func tourDestinationReady(_ stop: TourStop) -> Bool?
}
public extension TourAtlas {
  func prepareCatalog(entry: CatalogEntry) -> (() -> Void)? { nil }
  func tourDestinationReady(_ stop: TourStop) -> Bool? { nil }
}

public struct TourHooks {
  /// `true` shows the CMB shell for the stop without saving the setting; `false` RESTORES the user's saved choice and never force-hides.
  public var showCosmicHorizon: (Bool) -> Void
  /// The loaded name index's verified visit reference, or nil when the name is unmatched or the index is unavailable (subsets).
  public var resolveCatalog: (String) -> CatalogEntry?
  public var onChange: (TourState) -> Void
  public var notify: (String) -> Void
  public init(showCosmicHorizon: @escaping (Bool) -> Void, resolveCatalog: @escaping (String) -> CatalogEntry?, onChange: @escaping (TourState) -> Void, notify: @escaping (String) -> Void) {
    self.showCosmicHorizon = showCosmicHorizon; self.resolveCatalog = resolveCatalog; self.onChange = onChange; self.notify = notify
  }
}

public extension JSNumber {
  /// `Number.prototype.toLocaleString('en-US')`: grouped thousands, at most three fraction digits.
  static func localeString(_ value: Double) -> String {
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: "en_US")
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = 3
    return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
  }
}

/**
 Plays one route over the explorer's animated visits: travel → dwell → next, with a single timer. Every stop uses its
 own travelSeconds, including the first one from wherever the camera happens to be. The tour never moves the camera
 itself; input that takes over a travel pauses it, and a pose change during the dwell pauses instead of hopping.
 */
@MainActor public final class Tour {
  public private(set) var state = TourState(index: -1, status: .idle, stop: nil, autoplay: false)
  public private(set) var pace: TourPace = .quick
  /// The web's module-level `tourClock.speed`: one shared divisor for the development probes; production leaves it at 1.
  public var clockSpeed: Double = 1
  public let tour: TourData
  private let atlas: any TourAtlas
  private let nearby: [NearbyReference.Entry]
  private let hooks: TourHooks
  private let scheduler: Scheduler
  private var timer: (() -> Void)?
  private var serial = 0
  private var preparation: (() -> Void)?
  private var arrival: (target: SIMD3<Double>, camera: SIMD3<Double>)?
  /// 0 or 1: the web's single `timer` field, for tests that pin `vi.getTimerCount()`.
  public var pendingTimers: Int { timer == nil ? 0 : 1 }

  public init(atlas: any TourAtlas, tour: TourData, nearby: [NearbyReference.Entry], hooks: TourHooks, scheduler: @escaping Scheduler = Tour.mainScheduler) {
    self.atlas = atlas; self.tour = tour; self.nearby = nearby; self.hooks = hooks; self.scheduler = scheduler
  }

  /// `setTimeout` on the main queue.
  public static let mainScheduler: Scheduler = { seconds, action in
    let item = DispatchWorkItem { MainActor.assumeIsolated(action) }
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: item)
    return { item.cancel() }
  }

  public func start(_ index: Int = 0) {
    guard tour.stops.indices.contains(index) else { return }
    set { $0.autoplay = pace != .manual }
    goTo(index)
  }
  public func setPace(_ pace: TourPace) {
    self.pace = pace
    if pace == .manual { pause() } else if state.status == .dwelling { schedule() }
  }
  /// Chapter navigation and return both land paused, ready for exploration.
  public func jump(_ id: String) {
    guard let index = tour.stops.firstIndex(where: { $0.id == id }) else { return }
    pause(); goTo(index)
  }
  public func returnToStop() { if let stop = state.stop { jump(stop.id) } }
  public func next() { if state.index + 1 < tour.stops.count { goTo(state.index + 1) } else { finish() } }
  public func previous() { goTo(state.index - 1, step: -1) }
  public func play() {
    if pace == .manual { return }
    if state.status == .idle || state.status == .finished { return start(0) }
    set { $0.autoplay = true }
    if state.status != .paused && state.status != .partial { return } // travelling or dwelling: arrival (or the running timer) continues
    if arrival != nil && !moved() { if state.status == .partial { dwell() } else { awaitReady(serial) } }
    else { goTo(state.index) } // taken over mid-travel or moved since: travel back to the stop
  }
  public func pause() {
    clearTimer(); cancelPreparation()
    let travelling = state.status == .travelling
    if travelling {
      // A catalog stop may still be awaiting data, with no animation for stopTravel() to cancel.
      serial += 1; arrival = nil; atlas.stopTravel()
    }
    set { $0.autoplay = false; $0.status = travelling || $0.status == .dwelling || $0.status == .preparing ? .paused : $0.status }
  }
  public func exit() {
    clearTimer(); cancelPreparation(); serial += 1
    if state.status == .travelling { atlas.stopTravel() }
    if state.stop?.target.kind == .cmb { hooks.showCosmicHorizon(false) }
    arrival = nil; set { $0 = TourState(index: -1, status: .idle, stop: nil, autoplay: false) }
  }
  private func finish() { clearTimer(); cancelPreparation(); serial += 1; set { $0.status = .finished; $0.autoplay = false } }
  private func set(_ patch: (inout TourState) -> Void) { patch(&state); hooks.onChange(state) }
  private func clearTimer() { timer?(); timer = nil }
  private func pose() -> (target: SIMD3<Double>, camera: SIMD3<Double>) { (atlas.orbitTarget, atlas.cameraPosition) }
  /// Any orbit, pan or wheel during the dwell changes the pose by far more than 1e-6 of the orbit distance.
  private func moved() -> Bool {
    guard let then = arrival else { return false }
    let now = pose(), scale = 1e-6 * simd_length(now.camera - now.target)
    return simd_length(now.camera - then.camera) > scale || simd_length(now.target - then.target) > scale
  }
  private func schedule() {
    clearTimer(); if pace == .manual { return }
    prepareNext()
    timer = scheduler((state.stop!.dwellSeconds ?? DWELL_SECONDS) * (pace == .relaxed ? 2 : 1) / clockSpeed) { [weak self] in
      guard let self else { return }
      timer = nil; if moved() { pause() } else { next() }
    }
  }
  /// The stop as the panel should show it: the caption's `{catalogCount}` is the active dataset's accepted count.
  private func present(_ stop: TourStop) -> TourStop {
    var shown = stop
    shown.caption = stop.caption.replacingOccurrences(of: "{catalogCount}", with: JSNumber.localeString(Double(atlas.catalogCount)))
    return shown
  }

  /// One attempt to reach a stop; `step` is the direction an unavailable stop is skipped in: forward for start/next/play, backward for previous.
  private struct Leg { var index: Int, step: Int, skipped: [String], serial: Int, stop: TourStop }
  private enum Arrival { case arrived, paused, skipped }
  private func goTo(_ index: Int, step: Int = 1, skipped: [String] = []) {
    guard tour.stops.indices.contains(index) else { return }
    let stop = tour.stops[index]
    clearTimer(); serial += 1
    let leg = Leg(index: index, step: step, skipped: skipped, serial: serial, stop: stop)
    if state.stop?.target.kind == .cmb, stop.target.kind != .cmb { hooks.showCosmicHorizon(false) }
    set { $0.index = index; $0.stop = present(stop); $0.status = .travelling }
    // The web awaits the visit, so an outcome the atlas reports synchronously is handled only after this bookkeeping.
    var parked: VisitOutcome?, returned = false
    let visit = visit(stop, serial: leg.serial) { outcome in if returned { self.resolve(leg, outcome) } else { parked = outcome } }
    cancelPreparation(); returned = true
    switch visit {
    case .pending: if let parked { resolve(leg, parked) }
    case .notStarted: conclude(leg, .paused)
    case .skipped: conclude(leg, .skipped)
    case .failed(let message): fail(leg, message)
    }
  }
  private func resolve(_ leg: Leg, _ outcome: VisitOutcome) {
    switch outcome {
    case .arrived: conclude(leg, .arrived)
    case .interrupted: conclude(leg, .paused)
    case .failed(let message): fail(leg, message)
    }
  }
  private func fail(_ leg: Leg, _ message: String) {
    cancelPreparation()
    if leg.serial == serial { hooks.notify("\(leg.stop.title): \(message) Skipping.") }
    conclude(leg, .skipped)
  }
  private func conclude(_ leg: Leg, _ arrival: Arrival) {
    if leg.serial != serial { return } // superseded by a newer stop, exit or finish
    switch arrival {
    case .skipped:
      let following = leg.index + leg.step
      if tour.stops.indices.contains(following) { return goTo(following, step: leg.step, skipped: leg.skipped + [leg.stop.title]) }
      set { $0.status = leg.step > 0 ? .finished : .paused; $0.autoplay = false }
    case .paused: set { $0.status = .paused; $0.autoplay = false } // input, flight or another focus took over, or the visit could not start
    case .arrived:
      self.arrival = pose(); awaitReady(leg.serial)
      if !leg.skipped.isEmpty { hooks.notify("Skipped unavailable stops: \(leg.skipped.joined(separator: ", ")).") }
    }
  }
  private func cancelPreparation() { preparation?(); preparation = nil }
  private func prepareNext() {
    cancelPreparation()
    guard state.index + 1 < tour.stops.count, tour.stops[state.index + 1].target.kind == .catalog else { return }
    // ponytail: the web skips this lookup when the atlas has no prepareCatalog; here support is only known from its nil return, so the
    // lookup always runs. Add a capability flag to TourAtlas if resolveCatalog ever stops being a cheap dictionary read.
    guard let entry = hooks.resolveCatalog(tour.stops[state.index + 1].target.name!) else { return }
    preparation = atlas.prepareCatalog(entry: entry) // Speculation never changes the current stop or reports a visit failure.
  }
  private func dwell() {
    set { $0.status = $0.autoplay ? .dwelling : .paused }
    if state.autoplay { schedule() }
  }
  private func awaitReady(_ serial: Int, attempt: Int = 0) {
    clearTimer(); if serial != self.serial { return }
    if moved() { pause(); return }
    if atlas.tourDestinationReady(state.stop!) ?? true { dwell(); return }
    if attempt >= 40 { set { $0.status = .partial; $0.autoplay = false }; return }
    if state.status != .preparing { set { $0.status = .preparing } }
    timer = scheduler(0.2) { [weak self] in
      guard let self else { return }
      timer = nil; awaitReady(serial, attempt: attempt + 1)
    }
  }
  /// What a visit call produced before the web's `await` boundary: `.pending` means the completion will report the outcome.
  private enum Visit { case pending, notStarted, skipped, failed(String) }
  private func visit(_ stop: TourStop, serial: Int, completion: @escaping VisitCompletion) -> Visit {
    let target = stop.target, distanceMpc = stop.distanceMpc, s = stop.travelSeconds / clockSpeed, approach = atlas.approachDirection
    let live = { [weak self] in self?.serial == serial }
    func started(_ ok: Bool) -> Visit { ok ? .pending : .notStarted }
    func apply(_ view: ViewState) -> Visit { started(atlas.applyView(view, seconds: s, preserveTarget: target.kind == .view, canNavigate: live, completion: completion)) }
    func vec(_ a: [Double]) -> SIMD3<Double> { SIMD3(a[0], a[1], a[2]) }
    switch target.kind {
    case .view: return apply(target.view!)
    case .sun: return apply(ViewState(target: [0, 0, 0], camera: SIMD3<Double>(repeating: 0) + approach * (distanceMpc ?? 0.06), identity: .sun))
    case .core: return started(atlas.visitMilkyWay(seconds: s, completion: completion))
    case .overview: return started(atlas.reset(seconds: s, completion: completion))
    case .cmb: hooks.showCosmicHorizon(true); return started(atlas.viewCosmicHorizon(seconds: s, completion: completion))
    case .localgroup: let at = vec(target.positionMpc!); return apply(ViewState(target: at, camera: at + approach * distanceMpc!, identity: nil))
    // Look outward along the observed sky direction: a Milky Way angle looks across the cluster's redshift elongation.
    case .cluster: let at = vec(target.positionMpc!); return apply(ViewState(target: at, camera: at + at * (-distanceMpc! / simd_length(at)), identity: nil))
    case .nearby:
      guard let entry = nearby.first(where: { $0.key == target.key }) else { return .failed("Unknown nearby galaxy.") }
      guard let distanceMpc else { return started(atlas.visitNearby(id: entry.id, seconds: s, completion: completion)) }
      // Observer-facing like visitGalaxy, pulled back to the stop's own distance so the satellites stay in frame.
      let at = cartesian(ra: entry.raDeg, dec: entry.decDeg, distance: entry.distanceMpc)
      return apply(ViewState(target: at, camera: at + at * (-distanceMpc / entry.distanceMpc), identity: .nearby(entry.key)))
    case .catalog:
      guard let entry = hooks.resolveCatalog(target.name!) else { hooks.notify("\(stop.title) is not available in this dataset; skipping."); return .skipped }
      return started(atlas.visitCatalog(entry: entry, canNavigate: live, seconds: s, completion: completion))
    }
  }
}
