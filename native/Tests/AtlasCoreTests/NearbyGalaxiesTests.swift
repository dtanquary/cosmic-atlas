import XCTest
import simd
import AtlasTestSupport
@testable import AtlasCore

// Port of tests/nearby-galaxies.test.ts (data cases; the projected-ellipse geometry case ports with the volume passes).
final class NearbyGalaxiesTests: XCTestCase {
  static let reference = try! ReferenceData(directory: RepoPaths.file("src/data"))

  func testRetainsCitedLocalDistancesAndSeparateIdentities() throws {
    let details = try nearbyDetails(Self.reference.nearby)
    XCTAssertEqual(details.count, 10)
    XCTAssertEqual(Set(details.map(\.galaxy.id)).count, 10)
    for (i, distance) in [0.785, 0.809, 0.04959, 0.06244, pow(10, (24.53 + 5) / 5) / 1e6, 0.824, 8.58, 8.58, 6.52, pow(10, (30.715 + 5) / 5) / 1e6].enumerated() { XCTAssertEqual(details[i].galaxy.distance, distance, accuracy: 5e-14) }
    for d in details {
      XCTAssertLessThan(d.galaxy.id, 0); XCTAssertTrue(d.galaxy.targetId.hasPrefix("nearby:")); XCTAssertNil(d.galaxy.z)
      XCTAssertEqual(simd_length(d.galaxy.position), d.galaxy.distance, accuracy: 5e-14)
      XCTAssertTrue(d.galaxy.nearby?.distanceSource.hasPrefix("https://") ?? false)
      XCTAssertFalse(uncertainLocalPosition(d.galaxy))
      var plain = d.galaxy; plain.nearby = nil
      // Only the Local Group entries would fall under the redshift-only 1 Mpc guard without their citation.
      XCTAssertEqual(uncertainLocalPosition(plain), d.galaxy.distance < 1)
    }
    XCTAssertEqual(details[0].galaxy.ra, 10.6845833333, accuracy: 5e-9); XCTAssertEqual(details[0].galaxy.dec, 41.2691666667, accuracy: 5e-9)
    XCTAssertEqual(details[2].galaxy.nearby?.orientationMeasured, false)
    XCTAssertEqual(details[3].model?.shapeMeasured, false)
    XCTAssertEqual(details.filter { $0.cloud != nil }.map(\.galaxy.targetId), ["nearby:lmc", "nearby:smc"])
  }
}
