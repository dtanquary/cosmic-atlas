import XCTest
import AtlasTestSupport
@testable import AtlasCore

// Port of tests/galaxy-search.test.ts (name matching; the spiral-illustration case ports with the volume geometry).
final class GalaxySearchTests: XCTestCase {
  static let index = try! JSONDecoder().decode(NameIndex.self, from: RepoPaths.data("public/data/galaxy-search.json"))
  static let spiral = try! JSONDecoder().decode(GalaxyDetailData.self, from: RepoPaths.data("public/data/galaxy-spiral.json"))
  static let reference = try! ReferenceData(directory: RepoPaths.file("src/data"))
  var entries: [NamedGalaxy] { Self.index.entries }

  func testRecognizesSpacingCaseZeroPaddingAndMessierAliases() {
    for name in ["NGC3982", "ngc 03982", "NGC 3982"] { XCTAssertEqual(namedSuggestions(entries, query: name).first?.id, Self.spiral.galaxy.id, name) }
    for name in ["m109", "M 0109", "Messier 109"] { XCTAssertEqual(namedSuggestions(entries, query: name).first?.name, "NGC 3992", name) }
    XCTAssertEqual(normalizeName("PGC 037520"), normalizeName("pgc37520"))
  }
  func testOffersOnlyRealDestinationsInitially() {
    let suggestions = namedSuggestions(entries, query: "")
    XCTAssertGreaterThan(suggestions.count, 3)
    XCTAssertTrue(suggestions.allSatisfy { $0.kind == .observer || $0.id != nil })
    XCTAssertTrue(suggestions.contains { $0.id == Self.spiral.galaxy.id })
  }
  func testKeepsUnmatchedFamousNamesExplicitAndEmptyResultsEmpty() {
    let andromeda = namedSuggestions(entries, query: "Andromeda")
    XCTAssertEqual(andromeda.first?.name, "NGC 224"); XCTAssertNil(andromeda.first?.id)
    XCTAssertEqual(namedSuggestions(entries, query: "no-galaxy-by-this-name"), [])
  }
  func testPreservesUniqueIdentitiesAndCompleteVisitReferences() {
    let available = entries.filter { $0.id != nil }
    XCTAssertEqual(available.count, Self.index.matched)
    XCTAssertEqual(Set(available.map { $0.id! }).count, available.count)
    for entry in available {
      XCTAssertNotNil(entry.targetId?.wholeMatch(of: /^\d+$/)); XCTAssertNotNil(entry.node?.wholeMatch(of: /^\d+$/)); XCTAssertNotNil(entry.row); XCTAssertGreaterThan(entry.distance ?? 0, 0)
    }
    XCTAssertEqual(Self.spiral.galaxy.targetId, "39633325333155389")
    XCTAssertLessThan(Self.spiral.fitMaxRelativeError, 0.003)
  }
  func testNearbyNamesReplaceUnavailableAliases() {
    let entries = mergeNearbyNames([NamedGalaxy(name: "NGC 224", aliases: ["M 31", "Andromeda Galaxy"])], reference: Self.reference.nearby)
    XCTAssertEqual(entries.count, 10)
    for q in ["M31", "M 031", "Messier 31", "NGC224", "Andromeda"] { let hit = namedSuggestions(entries, query: q).first; XCTAssertEqual(hit?.kind, .nearby, q); XCTAssertEqual(hit?.id, -1, q) }
    for q in ["M33", "LMC", "SMC", "M32", "M110"] { XCTAssertEqual(namedSuggestions(entries, query: q).first?.kind, .nearby, q) }
    for (q, id) in [("M51", -7), ("Whirlpool", -7), ("NGC5194", -7), ("NGC 5195", -8), ("M101", -9), ("Pinwheel", -9), ("NGC1300", -10)] { XCTAssertEqual(namedSuggestions(entries, query: q).first?.id, id, q) }
    let initial = namedSuggestions(entries, query: "")
    XCTAssertEqual(initial.count, 11); XCTAssertTrue(initial.allSatisfy { $0.kind == .observer || $0.kind == .nearby })
  }
}
