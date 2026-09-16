import XCTest
import AtlasTestSupport
@testable import AtlasCore

/// The link contract rests on reproducing JavaScript's number formatting; the fixture is generated from the web code.
final class JSCompatTests: XCTestCase {
  struct Fixture: Decodable { var format: [[FormatCase]]; var views: [[ViewCase]] }
  enum FormatCase: Decodable { case number(Double), text(String)
    init(from decoder: Decoder) throws { let c = try decoder.singleValueContainer(); if let d = try? c.decode(Double.self) { self = .number(d) } else { self = .text(try c.decode(String.self)) } } }
  enum ViewCase: Decodable { case view(ViewState), text(String?)
    init(from decoder: Decoder) throws { let c = try decoder.singleValueContainer(); if let v = try? c.decode(ViewState.self) { self = .view(v) } else { self = .text(try c.decode(String?.self)) } } }

  func testNumberFormatMatchesJavaScriptFixture() throws {
    let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Fixtures/js-number-format.json")))
    XCTAssertGreaterThan(fixture.format.count, 400)
    for pair in fixture.format {
      guard case .number(let v) = pair[0], case .text(let expected) = pair[1] else { XCTFail("bad fixture"); continue }
      XCTAssertEqual(JSNumber.format(v), expected, "\(v)")
    }
    for pair in fixture.views {
      guard case .view(let state) = pair[0], case .text(let expected) = pair[1] else { XCTFail("bad fixture"); continue }
      XCTAssertEqual(ViewLink.encode(state), expected)
    }
  }

  func testToStringLayouts() {
    XCTAssertEqual(JSNumber.toString(1e21), "1e+21")
    XCTAssertEqual(JSNumber.toString(1e20), "100000000000000000000")
    XCTAssertEqual(JSNumber.toString(0.000001), "0.000001")
    XCTAssertEqual(JSNumber.toString(1e-7), "1e-7")
    XCTAssertEqual(JSNumber.toString(1.5e-7), "1.5e-7")
    XCTAssertEqual(JSNumber.toString(-0.5), "-0.5")
    XCTAssertEqual(JSNumber.toString(123.0), "123")
  }

  func testQueryParsing() {
    let params = JSQuery.parse("x=9&t=1,2,3&c=1,2,3&t=7,8,9&g=")
    XCTAssertEqual(JSQuery.first(params, "t"), "1,2,3")
    XCTAssertEqual(JSQuery.first(params, "g"), "")
    XCTAssertNil(JSQuery.first(params, "missing"))
    XCTAssertEqual(JSQuery.parse("a=1+2%20&b")[0].value, "1 2 ")
    XCTAssertEqual(JSQuery.parse("a=1+2%20&b")[1].value, "")
  }
}
