import XCTest
@testable import AtlasCore

// Port of tests/core.test.ts (scientific coordinate and identifier contracts).
final class FormatTests: XCTestCase {
  func testEquatorialRightHandedAxesWithoutDistanceCompression() {
    XCTAssertEqual(cartesian(ra: 0, dec: 0, distance: 10), SIMD3(10, 0, 0))
    XCTAssertEqual(cartesian(ra: 90, dec: 0, distance: 10).y, 10, accuracy: 1e-12)
    XCTAssertEqual(cartesian(ra: 0, dec: 90, distance: 10).z, 10, accuracy: 1e-12)
    XCTAssertEqual(separation(cartesian(ra: 0, dec: 0, distance: 100), cartesian(ra: 180, dec: 0, distance: 100)), 200, accuracy: 1e-12)
  }

  func testPreservesSigned64BitIdentifiers() throws {
    var buffer = Data(count: 72)
    func put<T>(_ value: T, at offset: Int) { withUnsafeBytes(of: value) { buffer.replaceSubrange(offset..<offset + $0.count, with: $0) } }
    put(UInt32(0x43414d31), at: 0); put(UInt32(1), at: 4); put(UInt32(1), at: 8)
    put(Int64(9007199254740993), at: 16); put(90.0, at: 24); put(0.0, at: 32); put(0.2, at: 40); put(0.0001, at: 48); put(800.0, at: 56)
    let galaxy = try decodeGalaxy(buffer, row: 0, id: 123)
    XCTAssertEqual(galaxy.targetId, "9007199254740993")
    XCTAssertEqual(galaxy.position.y, 800, accuracy: 1e-10)
    put(Int64(-9007199254740993), at: 16)
    XCTAssertEqual(try decodeGalaxy(buffer, row: 0, id: 123).targetId, "-9007199254740993")
    XCTAssertThrowsError(try decodeGalaxy(buffer, row: 1, id: 123)) { XCTAssertEqual($0 as? AtlasError, AtlasError("Invalid object reference")) }
  }

  func testRejectsTruncatedOversizedAndWrongVersionChunks() throws {
    var buffer = Data(count: 32)
    func put(_ value: UInt32, at offset: Int) { withUnsafeBytes(of: value) { buffer.replaceSubrange(offset..<offset + 4, with: $0) } }
    put(0x43415431, at: 0); put(1, at: 4); put(1, at: 8)
    XCTAssertEqual(try validateBinary(buffer, kind: .points, expectedCount: 1), 1)
    XCTAssertThrowsError(try validateBinary(buffer.prefix(31), kind: .points))
    put(2, at: 4)
    XCTAssertThrowsError(try validateBinary(buffer, kind: .points))
  }

  func testDistanceUnitsWithoutConfusingLightTravelTime() {
    XCTAssertEqual(formatDistance(1, units: .ly), "3.26 million ly")
    XCTAssertEqual(formatDistance(1000, units: .ly), "3.26 billion ly")
    XCTAssertEqual(formatDistance(0, units: .ly), "0 ly")
    XCTAssertEqual(formatDistance(12.345, units: .mpc), "12.3 Mpc")
    XCTAssertEqual(formatDistance(.nan), "Unavailable")
    XCTAssertEqual(niceScale(7.2), 5)
  }
}
