import XCTest
import AtlasTestSupport
@testable import AtlasCore

/// Ports tests/galaxy-looks.test.ts, plus a guard that the Metal constants match lookDisc.
final class GalaxyLooksTests: XCTestCase {
  func testPutsEveryLooksSmoothDiscHalfLightRadiusAtTheAdoptedCatalogRadius() {
    let d = lookDisc, steps = 200000
    func smooth(_ a: Double, _ b: Double, _ x: Double) -> Double { let t = max(0, min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
    for (key, look) in galaxyLooks {
      let outer = d.fadeEnd * look.extent
      var total = 0.0, cumulative = [Double](); cumulative.reserveCapacity(steps)
      for i in 0..<steps { let r = (Double(i) + 0.5) / Double(steps) * outer; total += exp(-r / d.scale) * smooth(outer, d.fadeStart * look.extent, r) * r; cumulative.append(total) }
      let half = (Double(cumulative.firstIndex { $0 >= total / 2 }!) + 0.5) / Double(steps) * outer
      XCTAssertEqual(half / look.unitsPerRe, 1, accuracy: 5e-4, key.rawValue)
    }
  }
  func testKeepsTheMilkyWayBarLengthAngleAndHandednessFromTheSourcedReference() throws {
    let reference = try ReferenceData(directory: RepoPaths.file("src/data")).milkyWay, look = try XCTUnwrap(galaxyLooks[.milkyWay])
    XCTAssertEqual(look.bar, reference.barHalfLengthMpc / reference.radiusMpc * look.unitsPerRe, accuracy: 5e-5)
    XCTAssertEqual(look.phaseDegrees, 180 - reference.barAngleDeg)
    // milky-way-light winds its arms anticlockwise outward in the model frame; the look mirrors to match.
    XCTAssertEqual(look.spin, -1)
  }
  func testSeedsStructureFromTheExactPublicIdentityOnly() {
    XCTAssertEqual(lookSeed("39633325333155389"), lookSeed("39633325333155389"))
    XCTAssertNotEqual(lookSeed("39633325333155389"), lookSeed("39633325333155388"))
    for value in [lookSeed("nearby:m31").x, lookSeed("nearby:m31").y] { XCTAssertGreaterThanOrEqual(value, 0); XCTAssertLessThan(value, 100) }
  }
  func testMetalConstantsMatchTheDiscProfile() throws {
    let shader = try String(contentsOf: RepoPaths.file("native/Sources/AtlasRender/Shaders/Atlas.metal"), encoding: .utf8)
    XCTAssertTrue(shader.contains("SCALE = \(lookDisc.scale), FADE_START = \(lookDisc.fadeStart), FADE_END = \(lookDisc.fadeEnd),"))
  }
  func testChoosesCatalogLooksFromRecordedHubbleTypesBarsFirst() {
    let cases: [(String, GalaxyLookKey)] = [("Sa", .tight), ("Sab", .tight), ("Sb", .grand), ("Sbc", .multi), ("Sc", .multi), ("Scd", .flocculent), ("Sd", .flocculent), ("Sm", .flocculent),
                                            ("SABa", .weakBar), ("SABc", .weakBar), ("SBa", .barred), ("SBbc", .barred), ("SBm", .barred)]
    for (type, key) in cases { XCTAssertEqual(catalogLook("any-identity", morphology: type), CatalogLookChoice(key: key, fromType: true), type) }
    for type in ["S?", "E", "S0", nil] { XCTAssertFalse(catalogLook("any-identity", morphology: type).fromType) }
  }
  func testSpreadsUntypedGalaxiesOverEveryCatalogLookByExactIdentity() {
    let seen = Set((0..<512).map { catalogLook("look-test:\($0)").key })
    XCTAssertEqual(seen, Set(catalogLookLabels.keys))
  }
  func testTurnsMirrorsAndTintsCatalogLooksByIdentityAtFixedLuminance() {
    let a = lookAppearance(.grand, identity: "look-test:a", palette: galaxyColors("look-test:a")), b = lookAppearance(.grand, identity: "look-test:b", palette: galaxyColors("look-test:b"))
    XCTAssertNotEqual(a.phase, b.phase)
    XCTAssertEqual(luminance(a.disc), luminance(galaxyLooks[.grand]!.disc), accuracy: 1e-9); XCTAssertEqual(luminance(a.young), luminance(galaxyLooks[.grand]!.young), accuracy: 1e-9)
    XCTAssertNotEqual(a.disc, b.disc); XCTAssertEqual(a.core, galaxyLooks[.grand]!.core)
    XCTAssertEqual(Set((0..<64).map { lookAppearance(.barred, identity: "look-test:\($0)").spin }), [1, -1])
    let named = lookAppearance(.milkyWay, identity: "milky-way"); XCTAssertEqual(named.spin, -1); XCTAssertEqual(named.disc, galaxyLooks[.milkyWay]!.disc)
  }
  func testMatchesTheWebForPinnedIdentities() {
    // From src/galaxy-looks.ts: catalogLook(id) and lookAppearance('grand', id, galaxyColors(id)).
    let pins: [(String, GalaxyLookKey, Double, Double, RGB)] = [
      ("39633263488141603", .multi, 0.5890433794496901, -1, RGB(0.9790225730583073, 0.8935615158871252, 0.8188726427331318)),
      ("look-test:1", .weakBar, 4.599611431912832, -1, RGB(0.9484236534153483, 0.8986101490897064, 0.8589633331708993)),
      ("look-test:2", .grand, 5.956159403455188, 1, RGB(0.8431586124192363, 0.9159782322522885, 0.9968815414519895)),
      ("look-test:3", .multi, 1.9385562364655737, 1, RGB(0.8365238865374219, 0.9170729211422167, 1.0055743562497323))]
    for (id, key, phase, spin, disc) in pins {
      XCTAssertEqual(catalogLook(id), CatalogLookChoice(key: key, fromType: false), id)
      let a = lookAppearance(.grand, identity: id, palette: galaxyColors(id))
      XCTAssertEqual(a.phase, phase, accuracy: 1e-12); XCTAssertEqual(a.spin, spin)
      for (x, y) in zip(a.disc.array, disc.array) { XCTAssertEqual(x, y, accuracy: 1e-12) }
    }
  }
}
