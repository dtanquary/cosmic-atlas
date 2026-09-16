import XCTest
import Metal
import UIKit
import simd
import AtlasCore
import AtlasRender

/// On-device journey: streams the public release, flies a scripted road-trip route (overview, LMC, SMC, M31, M33, Coma,
/// overview) rendering offscreen at the screen's drawable size, then attempts Full detail at the overview. Records raw
/// frame durations (CPU tick + GPU wait, not vsync intervals), first coarse view, memory footprint and thermal state as a
/// JSON attachment with physicalDevice: true. Skips on the simulator.
final class PerformanceJourneyTests: XCTestCase {
  struct Metrics: Codable {
    var physicalDevice = true
    var machine = "", os = "", bundleVersion = "", batteryState = "", batteryLevel = -1.0
    var thermalStart = "", thermalEnd = ""
    var drawableWidth = 0, drawableHeight = 0, scale = 0.0
    var firstCoarseViewMs = 0.0
    var frames = 0, meanMs = 0.0, p95Ms = 0.0, p99Ms = 0.0, over50ms = 0
    var peakFootprintMiB = 0.0, peakManagedMiB = 0.0, availableStartMiB = 0.0, availableMinMiB = 0.0
    var visibleEvictions = 0, blocked = false, memoryLimitMiB = 0.0
    var fullDetail = FullDetail()
    struct FullDetail: Codable { var attempted = false, complete = false, blocked = false, seconds = 0.0, managedMiB = 0.0, footprintMiB = 0.0, submitted = 0, drawCalls = 0 }
    var stops: [String] = []
  }

  static func footprintBytes() -> Int {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
    let result = withUnsafeMutablePointer(to: &info) { $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count) } }
    return result == KERN_SUCCESS ? Int(info.phys_footprint) : 0
  }
  static func thermal() -> String {
    switch ProcessInfo.processInfo.thermalState { case .nominal: "nominal"; case .fair: "fair"; case .serious: "serious"; case .critical: "critical"; @unknown default: "unknown" }
  }
  static var machine: String { var u = utsname(); uname(&u); return withUnsafeBytes(of: &u.machine) { String(cString: $0.bindMemory(to: CChar.self).baseAddress!) } }

  @MainActor
  func testRoadTripJourney() async throws {
    #if targetEnvironment(simulator)
    throw XCTSkip("Device journey runs on physical hardware only")
    #else
    let mib = 1_048_576.0
    var m = Metrics()
    m.machine = Self.machine; m.os = ProcessInfo.processInfo.operatingSystemVersionString
    m.bundleVersion = "\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") ?? "")+\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") ?? "")"
    UIDevice.current.isBatteryMonitoringEnabled = true
    m.batteryState = ["unknown", "unplugged", "charging", "full"][UIDevice.current.batteryState.rawValue]; m.batteryLevel = Double(UIDevice.current.batteryLevel)
    m.thermalStart = Self.thermal()
    m.availableStartMiB = Double(MemoryBudget.availableBytes() ?? 0) / mib; m.availableMinMiB = m.availableStartMiB

    let renderer = try AtlasRenderer()
    let reference = try ReferenceData(directory: Bundle.main.url(forResource: "data", withExtension: nil)!)
    let session = AtlasSession(renderer: renderer, reference: reference)
    let screen = UIScreen.main
    session.viewportPoints = SIMD2(Double(screen.bounds.width), Double(screen.bounds.height))
    session.scale = min(Double(screen.nativeScale), 1.5)
    m.scale = session.scale
    let size = session.drawableSize
    m.drawableWidth = size.x; m.drawableHeight = size.y
    m.memoryLimitMiB = Double(session.budget.limit) / mib
    let target = OffscreenTarget(renderer: renderer, width: size.x, height: size.y)

    let opened = CACurrentMediaTime()
    try await session.open(origin: AtlasModel.origin)
    var frames: [Double] = []
    var peakFootprint = 0, peakManaged = 0.0
    func sample() {
      peakFootprint = max(peakFootprint, Self.footprintBytes())
      peakManaged = max(peakManaged, session.stats.managedMiB)
      m.availableMinMiB = min(m.availableMinMiB, Double(MemoryBudget.availableBytes() ?? 0) / mib)
    }
    // Render frames until `until` returns true or the deadline passes; only continuous frames count as movement.
    func run(seconds: Double, record: Bool, until: () -> Bool = { false }) async {
      let deadline = CACurrentMediaTime() + seconds
      while CACurrentMediaTime() < deadline && !until() {
        let start = CACurrentMediaTime()
        let frame = session.tick(now: start)
        let stats = target.render(frame)
        session.didDraw(stats)
        if record && session.continuous { frames.append((CACurrentMediaTime() - start) * 1000) }
        sample()
        await Task.yield()
      }
    }
    await run(seconds: 30, record: false, until: { session.stats.drawn > 0 })
    m.firstCoarseViewMs = (CACurrentMediaTime() - opened) * 1000
    XCTAssertGreaterThan(session.stats.drawn, 0, "the catalog never became navigable")

    // The road trip's shape: nearby stops are observer-facing at the tour's own distance, Coma looks outward.
    let roadTrip = reference.tours.first { $0.key == "road-trip" }!
    var route: [(name: String, target: SIMD3<Double>, distance: Double, direction: SIMD3<Double>, seconds: Double)] = []
    for stop in roadTrip.stops {
      switch stop.target.kind {
      case .overview: route.append(("Overview", session.overviewTarget, session.overviewRadius * 2.1, OVERVIEW_DIRECTION, stop.travelSeconds))
      case .nearby:
        guard let entry = reference.nearby.entries.first(where: { $0.key == stop.target.key }) else { continue }
        let at = cartesian(ra: entry.raDeg, dec: entry.decDeg, distance: entry.distanceMpc)
        route.append((stop.title, at, stop.distanceMpc ?? entry.distanceMpc * 0.02, -simd_normalize(at), stop.travelSeconds))
      case .cluster:
        let p = stop.target.positionMpc!, at = SIMD3<Double>(p[0], p[1], p[2])
        route.append((stop.title, at, stop.distanceMpc!, -simd_normalize(at), stop.travelSeconds))
      default: continue // core and catalog stops need the Milky Way model and the name index (later phases)
      }
    }
    for stop in route {
      m.stops.append(stop.name)
      var arrived = false
      session.focusAt(target: stop.target, distance: stop.distance, direction: stop.direction, seconds: stop.seconds) { arrived = $0 }
      await run(seconds: stop.seconds + 5, record: true, until: { arrived })
      await run(seconds: 2, record: false) // dwell: let loads settle
    }
    let sorted = frames.sorted()
    m.frames = sorted.count
    if !sorted.isEmpty {
      m.meanMs = sorted.reduce(0, +) / Double(sorted.count)
      m.p95Ms = sorted[Int(Double(sorted.count) * 0.95)]; m.p99Ms = sorted[Int(Double(sorted.count) * 0.99)]
      m.over50ms = sorted.filter { $0 > 50 }.count
    }
    m.visibleEvictions = session.visibleEvictions; m.blocked = session.stats.blocked
    XCTAssertGreaterThan(m.frames, 100)
    XCTAssertEqual(m.visibleEvictions, 0)

    // Full detail at the overview: does the complete catalog fit and finish?
    m.fullDetail.attempted = true
    session.reset(seconds: 0)
    session.mode = .full
    let fullStart = CACurrentMediaTime()
    await run(seconds: 180, record: false, until: { session.stats.complete || session.stats.blocked })
    m.fullDetail.seconds = CACurrentMediaTime() - fullStart
    let fullStats = session.stats
    m.fullDetail.complete = fullStats.complete; m.fullDetail.blocked = fullStats.blocked
    m.fullDetail.managedMiB = fullStats.managedMiB; m.fullDetail.footprintMiB = Double(Self.footprintBytes()) / mib
    m.fullDetail.submitted = fullStats.drawn; m.fullDetail.drawCalls = fullStats.calls

    m.peakFootprintMiB = Double(peakFootprint) / mib; m.peakManagedMiB = peakManaged
    m.thermalEnd = Self.thermal()
    let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    let json = try encoder.encode(m)
    let attachment = XCTAttachment(data: json, uniformTypeIdentifier: "public.json"); attachment.name = "journey-\(m.machine).json"; attachment.lifetime = .keepAlways
    add(attachment)
    print("ATLAS_JOURNEY " + String(data: json, encoding: .utf8)!)
    #endif
  }
}
