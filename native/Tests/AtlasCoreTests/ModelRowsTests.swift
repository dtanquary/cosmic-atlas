import XCTest
@testable import AtlasCore

// Port of tests/model-rows.test.ts.
final class ModelRowsTests: XCTestCase {
  func testPreservesRowsAndAbsentIdentitiesWithoutRepeatedScans() throws {
    let ids: [UInt32] = [42, 14140374, 17, 0]
    var lookup = ModelRows(limit: 3)
    XCTAssertEqual(try lookup.resolve(ids, [17, 14140374, 999]), [2, 1, -1]); XCTAssertEqual(lookup.scans, 3)
    XCTAssertEqual(try lookup.resolve(ids, [999, 17, 14140374]), [-1, 2, 1]); XCTAssertEqual(lookup.scans, 3)
    XCTAssertEqual(try lookup.resolve(ids, [42, 17, 14140374]), [0, 2, 1]); XCTAssertEqual(lookup.scans, 4)
    XCTAssertEqual(try lookup.resolve(ids, [42, 17, 14140374]), [0, 2, 1]); XCTAssertEqual(lookup.scans, 4)
    XCTAssertEqual(lookup.memoryBytes, 24)
  }
  func testRecyclesOnlyRetiredIdentities() throws {
    let ids: [UInt32] = [42, 0, 17]
    var lookup = ModelRows(limit: 2)
    for n in 0..<50 { XCTAssertEqual(try lookup.resolve(ids, [n, 42]), [ids.firstIndex(of: UInt32(n)) ?? -1, 0]); XCTAssertEqual(lookup.memoryBytes, 16) }
    var fresh = ModelRows(limit: 2)
    XCTAssertEqual(try fresh.resolve([17, 42, 0], [42, 0]), [1, 2])
    XCTAssertThrowsError(try lookup.resolve(ids, [1, 2, 3])) { XCTAssertTrue("\($0)".contains("limit")) }
  }
}
