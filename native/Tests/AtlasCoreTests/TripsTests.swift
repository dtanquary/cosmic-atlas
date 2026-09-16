import XCTest
import simd
import AtlasTestSupport
@testable import AtlasCore

// Port of tests/trips.test.ts. Object-literal edits (`{...trip, version: 2}`) become edits to the trip's untrusted JSON form.
final class TripsTests: XCTestCase {
  static let reference = try! ReferenceData(directory: RepoPaths.file("src/data"))
  let tours = TripsTests.reference.tours
  let trip = Trip(title: "A sky full of ✨", stops: [
    .place(id: "first", route: "road-trip", stop: "andromeda", note: "Look at the dust."),
    .view(id: "second", name: "Our perspective 🌌", hash: "#t=0,0,0&c=0,0,1&g=sun"),
  ])
  /// `{...trip, ...}` on the JSON form.
  func edited(_ edit: (inout [String: Any]) -> Void) -> [String: Any] { var object = trip.jsonObject; edit(&object); return object }
  /// `{...trip, stops: [{...trip.stops[i], ...}]}`.
  func withStop(_ i: Int, _ edit: (inout [String: Any]) -> Void) -> [String: Any] { var stop = trip.stops[i].jsonObject; edit(&stop); return edited { $0["stops"] = [stop] } }
  struct MemoryStorage: TripStorage {
    var get: () throws -> String? = { nil }
    var set: (String) throws -> Void = { _ in }
    func getItem(_ key: String) throws -> String? { try get() }
    func setItem(_ key: String, _ value: String) throws { try set(value) }
  }

  func testRoundTripsExactUnicodeThroughFileAndURLCodecs() throws {
    XCTAssertEqual(decodeTripLink(try XCTUnwrap(encodeTripLink(trip, tours: tours)), tours: tours), trip)
    XCTAssertEqual(parseTripFile(try XCTUnwrap(serializeTrip(trip, tours: tours)), tours: tours), trip)
  }
  func testAcceptsValidJSONFieldOrderAndWhitespaceWhileKeepingBase64urlCanonical() throws {
    let pretty = try XCTUnwrap(serializeTrip(trip, tours: tours)) // JSON.stringify(trip, null, 2)
    let hash = "#trip=1." + Data(pretty.utf8).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacing(/=+$/, with: "")
    XCTAssertEqual(decodeTripLink(hash, tours: tours), trip)
    XCTAssertNil(decodeTripLink(hash + "=", tours: tours))
  }
  func testAcceptsOnlyKnownVersionedPausedStopLinks() throws {
    for t in tours { for s in t.stops {
      let decoded = try XCTUnwrap(decodeStopLink(try XCTUnwrap(encodeStopLink(t.key, s.id, tours: tours)), tours: tours))
      XCTAssertEqual(decoded.route, t.key); XCTAssertEqual(decoded.stop, s.id)
    } }
    for hash in ["#stop=2:road-trip:andromeda", "#stop=1:road-trip:nope", "#stop=1:road-trip:andromeda&x=1", "#stop=1:ROAD-TRIP:andromeda"] { XCTAssertNil(decodeStopLink(hash, tours: tours), hash) }
  }
  func testRejectsMalformedVersionsUnknownFieldsDuplicatesAndUntrustedViewGrammar() {
    let cases: [[String: Any]] = [
      edited { $0["version"] = 2 }, edited { $0["extra"] = "x" }, edited { $0["stops"] = [] as [Any] }, edited { $0["stops"] = [trip.stops[0].jsonObject, trip.stops[0].jsonObject] },
      edited { $0["title"] = "bad\u{0}" }, withStop(0) { $0["stop"] = "made-up" }, withStop(1) { $0["hash"] = "javascript:alert(1)" },
      withStop(1) { $0["hash"] = "#t=0,0,0&c=0,0,1&x=1" }, withStop(1) { $0["hash"] = "#t=0,0,0&c=0,0,1&c=0,0,2" },
    ]
    for (i, value) in cases.enumerated() { XCTAssertNil(validateTrip(value, tours: tours), "case \(i)") }
    // A lone surrogate cannot exist in a Swift String; as JSON text it fails to parse, which is the same rejection.
    XCTAssertNil(parseTripFile(#"{"version":1,"title":"\ud800","stops":[{"id":"first","kind":"place","route":"road-trip","stop":"andromeda"}]}"#, tours: tours))
    for value in ["#trip=2.aaaa", "#trip=1._w", "#trip=1.e30=", "#trip=1.e30", "#trip=1." + String(repeating: "x", count: 8001)] { XCTAssertNil(decodeTripLink(value, tours: tours), value.prefix(20).description) }
  }
  func testBoundsUnicodeByCharactersAndOffersFilesForValidTripsTooLongForAURL() throws {
    let galaxy = { (n: Int) in String(repeating: "🌌", count: n) }
    let long = Trip(title: galaxy(60), stops: (0..<10).map { .view(id: "s\($0)", name: galaxy(60), hash: "#t=0,0,0&c=0,0,1", note: galaxy(180)) })
    XCTAssertNotNil(validateTrip(long, tours: tours)); XCTAssertNil(encodeTripLink(long, tours: tours))
    XCTAssertEqual(parseTripFile(try XCTUnwrap(serializeTrip(long, tours: tours)), tours: tours), long)
    XCTAssertNil(tripHref(trip, base: "https://example.org/" + String(repeating: "x", count: 8000), tours: tours))
    XCTAssertNil(parseTripFile(String(repeating: " ", count: 65537), tours: tours))
    XCTAssertNil(validateTrip(edited { $0["title"] = galaxy(61) }, tours: tours))
    XCTAssertNil(validateTrip(withStop(0) { $0["note"] = galaxy(181) }, tours: tours))
    XCTAssertNil(validateTrip(edited { $0["stops"] = (0..<11).map { i in var s = trip.stops[0].jsonObject; s["id"] = "s\(i)"; return s } }, tours: tours))
  }
  func testRetainsSourceCaptionsIndependentlyOfCreatorNotesAndPreservesSavedCameraTargets() throws {
    let route = tripRoute(trip, tours: tours)
    XCTAssertEqual(route.stops[0].caption, tours.first { $0.key == "road-trip" }!.stops.first { $0.id == "andromeda" }!.caption)
    XCTAssertEqual(route.stops[0].note, "Look at the dust.")
    XCTAssertEqual(route.stops[0].sourceStop, TourStop.SourceStop(route: "road-trip", id: "andromeda"))
    XCTAssertEqual(route.stops[1].target.view, ViewState(target: [0, 0, 0], camera: [0, 0, 1], identity: .sun))
    XCTAssertEqual(route.stops.map(\.id), ["first", "second"])
  }
  func testRetainsPlainMarkupAsTextWithoutInterpretingItOrAllowingSchemaExtensions() {
    XCTAssertTrue(validateTrip(edited { $0["title"] = "<img src=x onerror=alert(1)>" }, tours: tours)?.title.contains("<img") ?? false)
    XCTAssertNil(parseTripFile(#"{"version":1,"title":"x","stops":[],"__proto__":{}}"#, tours: tours))
  }
  func testNormalizesPublicIdentitiesWithoutSerializingDenseInternalIDs() {
    var stop: [String: Any] = ["id": "view", "kind": "view", "name": "DESI", "hash": "#t=1,2,3&c=.1,0,0&g=desi:512:10:39633325333155389"]
    XCTAssertNil(validateTrip(edited { $0["stops"] = [stop] }, tours: tours))
    stop["hash"] = "#t=1,2,3&c=0.1,0,0&g=desi:512:10:39633325333155389"
    XCTAssertEqual(validateTrip(edited { $0["stops"] = [stop] }, tours: tours)?.stops[0], .view(id: "view", name: "DESI", hash: "#t=1,2,3&c=0.1,0,0&g=desi:512:10:39633325333155389"))
    stop["id"] = "42"; stop["denseId"] = 42
    XCTAssertNil(validateTrip(edited { $0["stops"] = [stop] }, tours: tours))
  }
  func testBoundsLocalPersistenceAndHandlesInaccessibleOrCorruptStorage() {
    final class Cell { var raw = "" }
    let cell = Cell(), storage = MemoryStorage(get: { cell.raw }, set: { cell.raw = $0 })
    XCTAssertTrue(writeTrips(storage, [SavedTrip(id: "a", trip: trip)], tours: tours)); XCTAssertEqual(readTrips(storage, tours: tours), [SavedTrip(id: "a", trip: trip)])
    XCTAssertFalse(writeTrips(storage, (0..<11).map { SavedTrip(id: "a\($0)", trip: trip) }, tours: tours))
    XCTAssertFalse(writeTrips(storage, [SavedTrip(id: "a", trip: trip), SavedTrip(id: "a", trip: trip)], tours: tours))
    cell.raw = "broken"; XCTAssertEqual(readTrips(storage, tours: tours), [])
    XCTAssertEqual(readTrips(MemoryStorage(get: { throw AtlasError("blocked") }), tours: tours), [])
    XCTAssertFalse(writeTrips(MemoryStorage(set: { _ in throw AtlasError("full") }), [SavedTrip(id: "a", trip: trip)], tours: tours))
    cell.raw = String(repeating: "x", count: 660000); XCTAssertEqual(readTrips(storage, tours: tours), [])
  }
}

// Port of tests/tours.test.ts: every stop's numbers are pinned to the sourced data the web reads.
final class TourRoutesTests: XCTestCase {
  struct TourSources: Decodable {
    struct Members: Decodable { var count: Int, catalogId: String, catalogSourceSha256: String }
    struct Cluster: Decodable { var key: String, aliases: [String], raDeg: Double, decDeg: Double, redshift: Double, redshiftRefCode: String?, positionRefCode: String?, desiMembers: Members }
    var clusters: [Cluster]
  }
  /// `radiusKpc` is not on `NearbyReference.Entry`; the LMC size claim reads it from the same file.
  struct NearbyRadii: Decodable { struct Entry: Decodable { var key: String, radiusKpc: Double? }; var entries: [Entry] }

  static let reference = try! ReferenceData(directory: RepoPaths.file("src/data"))
  static let index = try! JSONDecoder().decode(NameIndex.self, from: RepoPaths.data("public/data/galaxy-search.json"))
  static let manifest = try! Manifest.decode(RepoPaths.data("public/data/dr1/manifest.json"))
  static let sources = try! JSONDecoder().decode(TourSources.self, from: RepoPaths.data("src/data/tour-sources.json"))
  static let radii = try! JSONDecoder().decode(NearbyRadii.self, from: RepoPaths.data("src/data/nearby-galaxies.json"))
  let reference = TourRoutesTests.reference, index = TourRoutesTests.index, manifest = TourRoutesTests.manifest, sources = TourRoutesTests.sources
  var tours: [TourData] { reference.tours }
  var stops: [TourStop] { tours.flatMap(\.stops) }
  let kinds: [StopKind] = [.sun, .core, .localgroup, .overview, .cmb, .nearby, .catalog, .cluster]
  var nearby: [String: NearbyReference.Entry] { Dictionary(uniqueKeysWithValues: reference.nearby.entries.map { ($0.key, $0) }) }
  var zoomOut: TourData { tours.first { $0.key == "zoom-out" }! }
  var roadTrip: TourData { tours.first { $0.key == "road-trip" }! }
  var cmb: Double { reference.cmbRadiusMpc }
  lazy var lookback = Lookback(reference)
  /// `Number(value.toPrecision(2))`.
  func two(_ value: Double) -> Double { Double(JSNumber.format(value, precision: 2))! }
  /// `Number(value.toPrecision(digits)).toLocaleString('en-US')`.
  func sig(_ value: Double, _ digits: Int) -> String { JSNumber.localeString(Double(JSNumber.format(value, precision: digits))!) }
  // Framing constants mirror Explorer.reset (2.1 × the root half-diagonal) and Explorer.viewCosmicHorizon (50° field, aspect 1,
  // 14% margin) and must move together with them.
  let halfFov = 25 * Double.pi / 180, OVERVIEW_FACTOR = 2.1
  func frame(_ radius: Double) -> Double { radius / sin(halfFov) * 1.14 }
  func position(_ stop: TourStop) -> SIMD3<Double> { let p = stop.target.positionMpc!; return SIMD3(p[0], p[1], p[2]) }
  func at(_ key: String) -> SIMD3<Double> { let e = nearby[key]!; return cartesian(ra: e.raDeg, dec: e.decDeg, distance: e.distanceMpc) }

  /// The distance each caption is about, taken from the data it must agree with; the Sun cites none.
  func citedDistance(_ stop: TourStop) -> Double? {
    switch stop.target.kind {
    case .sun, .view: nil
    case .core: reference.milkyWay.observerDistanceMpc
    case .localgroup, .nearby: nearby[stop.cites ?? stop.target.key!]!.distanceMpc
    case .overview: manifest.maxDistanceMpc
    case .cmb: cmb
    case .catalog: index.entries.first { $0.name == stop.target.name }!.distance!
    case .cluster: simd_length(position(stop))
    }
  }

  func testKeepsTheSchemaKnownKindsPositiveTimingsUniqueKeysShortCaptions() {
    XCTAssertEqual(Set(tours.map(\.key)).count, tours.count)
    XCTAssertEqual(tours.count, 2)
    for tour in tours {
      XCTAssertGreaterThan(tour.title.count, 0); XCTAssertGreaterThan(tour.summary.count, 0); XCTAssertGreaterThan(tour.stops.count, 1)
      XCTAssertEqual(Set(tour.stops.map(\.id)).count, tour.stops.count)
      for stop in tour.stops {
        XCTAssertNotNil(stop.id.wholeMatch(of: /^[a-z][a-z0-9-]{0,31}$/), stop.id)
        XCTAssertGreaterThan(stop.cue.count, 0); XCTAssertLessThanOrEqual(stop.cue.utf16.count, 110)
        XCTAssertFalse(stop.cue.contains(/<|>|\{catalogCount\}|\b\d/.wordBoundaryKind(.simple)), stop.cue) // numeric claims remain in the source-pinned explanation
        XCTAssertTrue(kinds.contains(stop.target.kind))
        XCTAssertGreaterThan(stop.title.count, 0)
        XCTAssertGreaterThan(stop.travelSeconds, 0)
        if let dwell = stop.dwellSeconds { XCTAssertGreaterThan(dwell, 0) }
        if let distance = stop.distanceMpc { XCTAssertGreaterThan(distance, 0) }
        if stop.target.kind == .nearby || stop.target.kind == .cluster { XCTAssertFalse(stop.target.key?.isEmpty ?? true) }
        if stop.target.kind == .nearby { XCTAssertNotNil(nearby[stop.target.key!], stop.title) }
        if stop.target.kind == .catalog { XCTAssertFalse(stop.target.name?.isEmpty ?? true) }
        if stop.target.kind == .localgroup || stop.target.kind == .cluster { XCTAssertEqual(stop.target.positionMpc?.count, 3) }
        if let cites = stop.cites { XCTAssertNotNil(nearby[cites]) }
        XCTAssertLessThanOrEqual(stop.caption.split(separator: /[.!?](?=\s|$)/).count, 2, stop.title)
      }
    }
    XCTAssertEqual(zoomOut.stops.map(\.target.kind), [.sun, .core, .localgroup, .overview, .cmb])
    XCTAssertEqual(roadTrip.stops.map(\.target.kind), [.core, .nearby, .nearby, .nearby, .nearby, .nearby, .catalog, .catalog, .cluster, .overview])
  }
  func testQuotesEachStopsDistanceAndItsLookbackTimeFromTheSourceData() {
    for stop in stops {
      guard let distance = citedDistance(stop) else { XCTAssertEqual(stop.target.kind, .sun); XCTAssertFalse(stop.caption.contains(/\d/)); continue }
      let time = lookback.lookbackForDistance(distance), renderings = [formatLookback(two(time)), formatLookback(time)]
      XCTAssertTrue(renderings.contains { stop.caption.contains($0) }, "\(stop.title): \(renderings.joined(separator: " | "))")
      switch stop.target.kind {
      case .core: XCTAssertTrue(stop.caption.contains("\(sig(distance * 1000, 2)) kpc")); XCTAssertTrue(stop.caption.contains("\(JSNumber.toString(stop.distanceMpc! * 1000)) kpc"))
      case .localgroup, .nearby: XCTAssertTrue(stop.caption.contains("\(sig(distance * 1000, 3)) kpc"), stop.title)
      case .overview: XCTAssertTrue(stop.caption.contains("\(JSNumber.localeString(distance.rounded())) Mpc"), stop.title)
      case .cmb: XCTAssertTrue(stop.caption.contains("\(JSNumber.localeString(distance.rounded())) Mpc")); XCTAssertTrue(stop.caption.contains(formatDistance(distance, units: .ly)))
      default: XCTAssertTrue(stop.caption.contains("\(sig(distance, 3)) Mpc"), stop.title)
      }
    }
  }
  func testResolvesEveryCatalogStopByNameToAVerifiedVisitDestination() throws {
    let catalog = stops.filter { $0.target.kind == .catalog }
    XCTAssertEqual(catalog.count, 2)
    for stop in catalog {
      let entry = try XCTUnwrap(index.entries.first { $0.name == stop.target.name }, stop.title)
      XCTAssertGreaterThan(try XCTUnwrap(entry.id), 0); XCTAssertNotNil(try XCTUnwrap(entry.node).wholeMatch(of: /^\d+$/)); XCTAssertNotNil(entry.row); XCTAssertNotNil(try XCTUnwrap(entry.targetId).wholeMatch(of: /^\d+$/))
    }
  }
  func testFramesTheSatellitesAroundAndromedaAndQuotesM32AndM110FromTheirOwnMeasurements() throws {
    let satellites = try XCTUnwrap(roadTrip.stops.first { $0.title == "M32 and M110" })
    let reach = max(separation(at("m31"), at("m32")), separation(at("m31"), at("m110")))
    XCTAssertEqual(satellites.target.key, "m31"); XCTAssertEqual(satellites.cites, "m110")
    let distance = try XCTUnwrap(satellites.distanceMpc)
    XCTAssertGreaterThanOrEqual(distance, frame(reach))
    XCTAssertLessThan(distance, frame(reach) * 2)
    for key in ["m32", "m110"] { XCTAssertTrue(satellites.caption.contains("\(sig(nearby[key]!.distanceMpc * 1000, 3)) kpc"), key) }
    XCTAssertTrue(nearby["m32"]!.distanceError.contains("80 kpc")); XCTAssertTrue(satellites.caption.contains("roughly 80 kpc"))
    XCTAssertTrue(satellites.caption.contains(/measured/))
  }
  func testFramesTheLocalGroupFromTheSunAndromedaMidpointWithAllSixGalaxiesInView() throws {
    let stop = try XCTUnwrap(zoomOut.stops.first { $0.target.kind == .localgroup }), m31 = try XCTUnwrap(nearby["m31"])
    let midpoint = cartesian(ra: m31.raDeg, dec: m31.decDeg, distance: m31.distanceMpc / 2)
    for i in 0..<3 { XCTAssertLessThan(abs(position(stop)[i] - midpoint[i]), 1e-12) }
    let reach = max(reference.nearby.entries.map { separation(cartesian(ra: $0.raDeg, dec: $0.decDeg, distance: $0.distanceMpc), midpoint) }.max()!, separation([0, 0, 0], midpoint))
    let distance = try XCTUnwrap(stop.distanceMpc)
    XCTAssertGreaterThanOrEqual(distance, frame(reach))
    XCTAssertLessThan(distance, frame(reach) * 2)
    XCTAssertEqual(stop.cites, "m31")
    XCTAssertEqual(reference.nearby.entries.count, 6); XCTAssertTrue(stop.caption.contains("Six nearby galaxies"))
  }
  func testOrdersTheZoomOutByStrictlyIncreasingFramingDistance() throws {
    let root = try XCTUnwrap(manifest.nodes.first { $0.id == manifest.root })
    let overviewRadius = simd_length(root.max - root.min) / 2
    let framing = zoomOut.stops.map { stop -> Double in
      switch stop.target.kind {
      case .overview: overviewRadius * OVERVIEW_FACTOR
      case .cmb: frame(cmb)
      default: stop.distanceMpc!
      }
    }
    XCTAssertEqual(framing[0], 0.003); XCTAssertEqual(framing[1], 0.06)
    for i in 1..<framing.count { XCTAssertGreaterThan(framing[i], framing[i - 1], zoomOut.stops[i].title) }
  }
  func testPlacesTheComaClusterStopAtItsCitedNEDPositionOnPlanck18AxesWithDESIRowsAroundIt() throws {
    let stop = try XCTUnwrap(roadTrip.stops.first { $0.target.kind == .cluster }), cluster = try XCTUnwrap(sources.clusters.first { $0.key == stop.target.key })
    XCTAssertTrue(cluster.aliases.contains("ABELL 1656")); XCTAssertFalse(cluster.redshiftRefCode?.isEmpty ?? true); XCTAssertFalse(cluster.positionRefCode?.isEmpty ?? true)
    let distance = simd_length(position(stop)), expected = cartesian(ra: cluster.raDeg, dec: cluster.decDeg, distance: distance)
    for i in 0..<3 { XCTAssertLessThan(abs(position(stop)[i] - expected[i]), 1e-9) }
    // The distance must be Planck18 comoving at the cited redshift: interpolate the lookback table's redshift column.
    let redshift = reference.lookback.table.redshift, comovingMpc = reference.lookback.table.comovingMpc
    var low = 0; while redshift[low + 1] < cluster.redshift { low += 1 }
    let t = (cluster.redshift - redshift[low]) / (redshift[low + 1] - redshift[low]), interpolated = comovingMpc[low] + t * (comovingMpc[low + 1] - comovingMpc[low])
    XCTAssertLessThan(abs(interpolated - distance) / distance, 1e-3)
    XCTAssertGreaterThanOrEqual(cluster.desiMembers.count, 200)
    XCTAssertEqual(cluster.desiMembers.catalogId, manifest.id); XCTAssertEqual(cluster.desiMembers.catalogSourceSha256, manifest.source.sha256)
    XCTAssertTrue(stop.caption.contains("z = \(JSNumber.format(cluster.redshift, precision: 2))"))
    XCTAssertTrue(stop.caption.contains("Abell 1656"))
  }
  func testDisclosesWhatIsIllustrativeAssumedOrOnlyInferredAtEveryStop() throws {
    let required: [StopKind: [String]] = [
      .view: [#"saved camera view"#, #"checked against this catalog"#],
      .sun: [#"illustrative"#, #"not to scale"#, #"origin"#],
      .core: [#"illustrative"#, #"adopted"#],
      .localgroup: [#"independently measured"#, #"hidden by default"#, #"not as corrected"#],
      .overview: [#"\{catalogCount\} accepted DESI DR1 observations in this dataset"#, #"inferred from redshift"#, #"not confirmed empty"#],
      .cmb: [#"illustrative"#, #"approximate"#, #"comoving"#, #"1090"#, #"not a physical edge"#],
      .nearby: [#"illustrative"#, #"measured|assumed"#],
      .catalog: [#"measured redshift"#, #"illustrative|inferred"#],
      .cluster: [#"redshift"#, #"line of sight"#, #"NED"#, #"rather than true membership"#],
    ]
    for stop in stops { for pattern in required[stop.target.kind]! { XCTAssertTrue(stop.caption.contains(try Regex(pattern)), "\(stop.title) needs \(pattern)") } }
    for stop in stops where stop.target.kind == .nearby {
      let entry = try XCTUnwrap(nearby[stop.target.key!])
      if !entry.shapeMeasured { XCTAssertTrue(stop.caption.contains(/assumed/), stop.title) }
      if !entry.orientationMeasured { XCTAssertTrue(stop.caption.contains(/orientation is not measured/), stop.title) }
      if stop.cites == nil, entry.shapeNote.contains(/disk approximation/.ignoresCase()) { XCTAssertTrue(stop.caption.contains(/single-disk/), stop.title) } // the satellites stop is about M32/M110, not the M31 disk
    }
    let lmc = try XCTUnwrap(nearby["lmc"]), lmcStop = try XCTUnwrap(roadTrip.stops.first { $0.target.key == "lmc" })
    let radiusKpc = try XCTUnwrap(Self.radii.entries.first { $0.key == "lmc" }?.radiusKpc)
    XCTAssertFalse(lmc.shapeMeasured); XCTAssertTrue(lmcStop.caption.contains("\(JSNumber.toString(radiusKpc)) kpc size are assumed"))
  }
}
