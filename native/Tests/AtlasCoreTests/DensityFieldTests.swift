import XCTest
import simd
import AtlasTestSupport
@testable import AtlasCore

// Ports of the field cases in tests/milky-way, galaxy-portraits and magellanic-clouds.
final class DensityFieldTests: XCTestCase {
  static let reference = try! ReferenceData(directory: RepoPaths.file("src/data"))

  func testMilkyWayFieldIsDeterministicFiniteAndBounded() {
    let size = 128, data = milkyWayDensityField(Self.reference.milkyWay, size: size)
    XCTAssertEqual(data, milkyWayDensityField(Self.reference.milkyWay, size: size))
    var inner = 0.0, outer = 0.0, innerCount = 0.0, outerCount = 0.0, dustPixels = 0, emissionPixels = 0
    for y in 0..<size { for x in 0..<size {
      let r = hypot(((Double(x) + 0.5) / Double(size) * 2 - 1) * HOME_EXTENT_RE, ((Double(y) + 0.5) / Double(size) * 2 - 1) * HOME_EXTENT_RE), i = (y * size + x) * 4
      if r >= HOME_EXTENT_RE { XCTAssertEqual(Array(data[i..<i + 4]), [0, 0, 0, 0]) }
      if r < 0.5 { inner += Double(data[i]) * Double(data[i]); innerCount += 1 }
      if r > 2 && r < 3 { outer += Double(data[i]) * Double(data[i]); outerCount += 1 }
      if data[i + 2] > 64 { dustPixels += 1 }; if data[i + 3] > 0 { emissionPixels += 1 }
    } }
    XCTAssertGreaterThan(inner / innerCount, outer / outerCount * 10)
    XCTAssertGreaterThan(dustPixels, 100); XCTAssertGreaterThan(emissionPixels, 10)
  }
  func testMilkyWayPlacesTheObserverAtTheSun() {
    let frame = MilkyWayFrame(Self.reference.milkyWay), sun = -frame.center
    XCTAssertEqual(simd_length(frame.center), 0.008122, accuracy: 1e-14)
    XCTAssertEqual(simd_dot(sun, frame.major), -(0.008122 * 0.008122 - 0.0000208 * 0.0000208).squareRoot(), accuracy: 1e-14)
    XCTAssertEqual(simd_dot(sun, frame.minor), 0, accuracy: 1e-14)
    XCTAssertEqual(simd_dot(sun, frame.normal), 0.0000208, accuracy: 1e-14)
    XCTAssertEqual((atan2(frame.center.y, frame.center.x) * 180 / .pi + 360).truncatingRemainder(dividingBy: 360), 266.4051, accuracy: 1e-9)
    XCTAssertEqual(asin(frame.center.z / simd_length(frame.center)) * 180 / .pi, -28.936175, accuracy: 1e-9)
    XCTAssertEqual(simd_dot(simd_cross(frame.major, frame.minor), frame.normal), 1, accuracy: 1e-12)
    for axis in [frame.major, frame.minor, frame.normal] { XCTAssertEqual(simd_length(axis), 1, accuracy: 1e-12) }
    XCTAssertEqual(Self.reference.milkyWay.diskScaleMpc, 0.0026)
  }
  func testPortraitFieldsAreDeterministicDistinctAndBounded() {
    let fields = [DiskPortrait.m31, .m33, .ngc3982].map { kind -> [UInt8] in
      let size = 96, field = portraitDensityField(kind, size: size)
      XCTAssertEqual(field, portraitDensityField(kind, size: size))
      var dust = 0, emission = 0
      for y in 0..<size { for x in 0..<size {
        let i = (y * size + x) * 4, r = hypot(((Double(x) + 0.5) / Double(size) * 2 - 1) * 4.5, ((Double(y) + 0.5) / Double(size) * 2 - 1) * 4.5)
        if r >= 4.45 { XCTAssertEqual(Array(field[i..<i + 4]), [0, 0, 0, 0]) }
        dust += Int(field[i + 2]); emission += Int(field[i + 3])
      } }
      XCTAssertGreaterThan(dust, 10000); XCTAssertGreaterThan(emission, 100)
      return field
    }
    XCTAssertNotEqual(fields[0], fields[1]); XCTAssertNotEqual(fields[1], fields[2])
    XCTAssertEqual(portraitMemoryBytes, 384 * 384 * 4 + (0...8).reduce(0) { $0 + (384 >> $1) * (384 >> $1) * 4 })
  }
  func testCloudFieldsAreDistinctDeterministicWithEmptyBoundaries() {
    let size = CLOUD_FIELD_SIZE, lmc = cloudDensityField(.lmc), smc = cloudDensityField(.smc)
    XCTAssertEqual(lmc, cloudDensityField(.lmc)); XCTAssertNotEqual(smc, lmc)
    for field in [lmc, smc] {
      XCTAssertEqual(field.count, 48 * 48 * 48 * 2)
      var light = 0, dust = 0
      for z in 0..<size { for y in 0..<size { for x in 0..<size {
        let i = ((z * size + y) * size + x) * 2; light += Int(field[i]); dust += Int(field[i + 1])
        if [x, y, z].contains(where: { $0 == 0 || $0 == size - 1 }) { XCTAssertEqual(field[i], 0); XCTAssertEqual(field[i + 1], 0) }
      } } }
      XCTAssertGreaterThan(light, 100000); XCTAssertGreaterThan(dust, 10000)
    }
    let samples = cloudLightSamples(.lmc, field: lmc)
    XCTAssertEqual(samples, cloudLightSamples(.lmc, field: lmc))
    XCTAssertEqual(samples.sizes.count, 4096)
    for i in 0..<samples.sizes.count {
      XCTAssertLessThan(hypot(hypot(Double(samples.positions[i * 3]), Double(samples.positions[i * 3 + 1])), Double(samples.positions[i * 3 + 2])), 4.5)
      XCTAssertGreaterThan(samples.sizes[i], 0.02); XCTAssertLessThan(samples.sizes[i], 0.06)
    }
  }
}
