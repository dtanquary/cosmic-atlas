import XCTest
import AtlasCore

/// Hosted on the app so it runs on the paired iPhone/iPad. Performance journeys arrive in Phase 2.
final class DeviceSmokeTests: XCTestCase {
  func testBundledReferenceDataIsReachable() throws {
    let url = try XCTUnwrap(Bundle.main.url(forResource: "tours", withExtension: "json", subdirectory: "data"))
    XCTAssertGreaterThan(try Data(contentsOf: url).count, 0)
  }
  func testCoreLinks() {
    XCTAssertEqual(formatDistance(1, units: .ly), "3.26 million ly")
  }
}
