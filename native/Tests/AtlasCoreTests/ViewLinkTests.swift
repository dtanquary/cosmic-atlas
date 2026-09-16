import XCTest
@testable import AtlasCore

// Port of tests/view-link.test.ts.
final class ViewLinkTests: XCTestCase {
  static let desi = ViewIdentity.desi(node: "42", row: 815, targetId: "39627670392150409")
  static let states: [ViewState] = [
    ViewState(target: [0, 0, 0], camera: [0, 0, 0.06], identity: .sun),
    ViewState(target: [-8.2e-3, 0, 0], camera: [-8.2e-3, 0.04, 0.03], identity: .core),
    ViewState(target: [0.785, 0, 0.1], camera: [0.8, -0.2, 0.3], identity: .nearby("m31")),
    ViewState(target: [4800, -1200, 300], camera: [4800 + 1.2345678901e-5, -1200 - 2.3456789012e-5, 300 + 3.4567890123e-5], identity: desi),
    ViewState(target: [1, 2, 3], camera: [100, 200, 300], identity: nil),
  ]

  func testRoundTripsEveryIdentityKindAndKeepsTinyOffsetsFarFromOrigin() throws {
    for state in Self.states {
      let decoded = try XCTUnwrap(ViewLink.decode(try XCTUnwrap(ViewLink.encode(state))))
      XCTAssertEqual(decoded.identity, state.identity)
      for i in 0..<3 {
        XCTAssertLessThanOrEqual(abs(decoded.target[i] - state.target[i]), abs(state.target[i]) * 1e-11)
        let offset = state.camera[i] - state.target[i]
        XCTAssertLessThanOrEqual(abs(decoded.camera[i] - decoded.target[i] - offset), abs(offset) * 1e-9)
      }
    }
  }

  func testWritesTheDocumentedGrammar() throws {
    XCTAssertEqual(ViewLink.encode(Self.states[0]), "#t=0,0,0&c=0,0,0.06&g=sun")
    XCTAssertEqual(ViewLink.encode(Self.states[4]), "#t=1,2,3&c=99,198,297")
    let encoded = try XCTUnwrap(ViewLink.encode(Self.states[3]))
    XCTAssertNotNil(encoded.wholeMatch(of: /^#t=4800,-1200,300&c=0\.00001\d{7,11},-0\.00002\d{7,11},0\.00003\d{7,11}&g=desi:42:815:39627670392150409$/), encoded)
  }

  func testRefusesNonFiniteOrOutOfRangeViews() {
    let cases: [(SIMD3<Double>, SIMD3<Double>)] = [([.nan, 0, 0], [0, 0, 1]), ([0, 0, 0], [0, .infinity, 0]), ([1e6, 0, 0], [0, 0, 1]), ([0, 0, 0], [0, 0, -1e6]), ([999999, 0, 0], [-2, 0, 0])]
    for (target, camera) in cases { XCTAssertNil(ViewLink.encode(ViewState(target: target, camera: camera, identity: nil))) }
    XCTAssertEqual(ViewLink.encode(ViewState(target: [999999, 0, 0], camera: [999999.5, 0, 0], identity: nil)), "#t=999999,0,0&c=0.5,0,0")
  }

  func testKeeps64BitTargetIdsAsExactStrings() throws {
    for targetId in ["39627670392150409", "12345678901234567890", "-39627670392150409"] {
      let identity = try XCTUnwrap(ViewLink.decode("#t=1,2,3&c=4,5,6&g=desi:2:3:\(targetId)")?.identity)
      XCTAssertEqual(identity, .desi(node: "2", row: 3, targetId: targetId))
    }
    XCTAssertNil(ViewLink.decode("#t=1,2,3&c=4,5,6&g=desi:2:3:123456789012345678901"))
  }

  func testRejectsAnythingOutsideTheGrammarAndIgnoresUnknownOrDuplicateKeys() {
    for hash in ["", "#", "#c=1,2,3", "#t=1,2&c=1,2,3", "#t=1,2,3&c=1,2", "#t=1,NaN,3&c=1,2,3", "#t=1,2,3&c=Infinity,2,3", "#t=1e7,2,3&c=1,2,3", "#t=1,2,3&c=1,2,1e6",
                 "#t=1,2,3&c=1,2,3,4", "#t=1,,3&c=1,2,3", "#t=0x10,2,3&c=1,2,3", "#t=1,2,3&c=1,2,3&g=desi:2:3", "#t=1,2,3&c=1,2,3&g=desi:1:2:3:4", "#t=1,2,3&c=1,2,3&g=desi:2:3:abc",
                 "#t=1,2,3&c=1,2,3&g=desi:2:-3:4", "#t=1,2,3&c=1,2,3&g=desi:2:123456:4", "#t=1,2,3&c=1,2,3&g=desi:1234567:3:4", "#t=1,2,3&c=1,2,3&g=nearby:M31",
                 "#t=1,2,3&c=1,2,3&g=nearby:abcdefghijklmnopq", "#t=1,2,3&c=1,2,3&g=milkyway", "#t=1,2,3&c=1,2,3&g="] {
      XCTAssertNil(ViewLink.decode(hash), hash)
    }
    XCTAssertEqual(ViewLink.decode("#x=9&t=1,2,3&c=1,2,3&t=7,8,9"), ViewState(target: [1, 2, 3], camera: [2, 4, 6], identity: nil))
    XCTAssertEqual(ViewLink.decode("#t=-999999,2e-7,3&c=999999,0,0&g=nearby:lmc"), ViewState(target: [-999999, 2e-7, 3], camera: [0, 2e-7, 3], identity: .nearby("lmc")))
    XCTAssertEqual(ViewLink.decode("#t=1,2,3&c=1,2,3&g=desi:123456:65535:0")?.identity, .desi(node: "123456", row: 65535, targetId: "0"))
  }

  func testRoadTripInvitationCarriesNoCameraOrSelection() throws {
    XCTAssertEqual(ViewLink.decodeTourLink(ViewLink.roadTripHash), "road-trip")
    XCTAssertNil(ViewLink.decode(ViewLink.roadTripHash))
    for hash in ["", "#tour=unknown", "#tour=road-trip&tour=road-trip", "#tour=road-trip&g=nearby:m31", "#tour=road-trip&t=0,0,0&c=0,0,1", "#tour=road-trip&speed=100", try XCTUnwrap(ViewLink.encode(Self.states[0]))] {
      XCTAssertNil(ViewLink.decodeTourLink(hash), hash)
    }
    XCTAssertEqual(ViewLink.decode(try XCTUnwrap(ViewLink.encode(Self.states[2])))?.identity, .nearby("m31"))
  }
}
