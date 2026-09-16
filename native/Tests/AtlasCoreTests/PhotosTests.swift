import XCTest
import CryptoKit
import AtlasTestSupport
@testable import AtlasCore

// Port of tests/photos.test.ts.
final class PhotosTests: XCTestCase {
  static let reference = try! ReferenceData(directory: RepoPaths.file("src/data"))
  static let names = try! JSONDecoder().decode(NameIndex.self, from: RepoPaths.data("public/data/galaxy-search.json")).entries
  var photographs: [Photograph] { Self.reference.photos.photos }
  var roadTrip: TourData { Self.reference.tours.first { $0.key == "road-trip" }! }

  func testPinsExactSourceBytesDimensionsCreditsAndRights() throws {
    XCTAssertEqual(Set(photographs.map(\.identity)).count, photographs.count)
    for p in photographs {
      let bytes = try RepoPaths.data("public" + p.asset)
      XCTAssertEqual(bytes.count, p.bytes, p.key)
      XCTAssertEqual(SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined(), p.sha256, p.key)
      XCTAssertEqual(bytes[0], 255); XCTAssertEqual(bytes[1], 216)
      XCTAssertLessThanOrEqual(p.bytes, Self.reference.photos.maxEncodedBytes); XCTAssertLessThanOrEqual(p.width * p.height * 4, Self.reference.photos.maxDecodedBytes)
      XCTAssertGreaterThan(p.credit.count, 2); XCTAssertEqual(p.license, "https://creativecommons.org/licenses/by/4.0/")
      XCTAssertTrue(p.source.hasPrefix("https://")); XCTAssertTrue(p.rights.hasPrefix("https://"))
    }
  }
  func testMatchesSupportedRouteTargets() {
    for stop in roadTrip.stops {
      let photos = photosForStop(stop, photos: photographs)
      if stop.target.kind == .overview { XCTAssertEqual(photos, []); continue }
      XCTAssertGreaterThan(photos.count, 0, stop.id)
      if stop.target.kind == .catalog { XCTAssertEqual(photos[0].identity, Self.names.first { $0.name == stop.target.name }!.targetId) }
      if stop.target.kind == .nearby && stop.id != "andromeda-companions" { XCTAssertEqual(photos[0].identity, "nearby:\(stop.target.key!)") }
    }
    XCTAssertEqual(photosForIdentity("unverified-name", photos: photographs), [])
    XCTAssertTrue(photosForIdentity("core", photos: photographs)[0].note.contains("inside the Milky Way"))
    XCTAssertEqual(photosForStop(roadTrip.stops.first { $0.id == "andromeda-companions" }!, photos: photographs).map(\.identity), ["nearby:m32", "nearby:m110"])
  }
  func testOffersFramingOnlyForTheCheckedCutout() throws {
    let photo = photographs.first { $0.key == "ngc4026" }!
    XCTAssertEqual(photographs.filter { $0.match != nil }.count, 1)
    XCTAssertEqual(photo.match!.cdDegPerPixel, [-0.000173611111111111, 0, 0, 0.000173611111111111]); XCTAssertEqual(photo.fovArcmin, [8, 8])
    let state = ViewState(target: [0, 0, 20], camera: [0, 0, 21], identity: .desi(node: "512", row: 1, targetId: photo.identity))
    let view = try XCTUnwrap(matchedPhotoView(photo, state: state, verticalFovDegrees: 50))
    XCTAssertEqual(view.identity, state.identity); XCTAssertEqual(view.target, state.target); XCTAssertLessThan(view.camera.z, 20)
    let span = 2 * (20 - view.camera.z) * tan(25 * Double.pi / 180)
    XCTAssertEqual(span, 40 * tan(4 / 60 * Double.pi / 180), accuracy: 1e-12)
    var anonymous = state; anonymous.identity = nil
    XCTAssertNil(matchedPhotoView(photo, state: anonymous, verticalFovDegrees: 50)); XCTAssertNil(matchedPhotoView(photographs[0], state: state, verticalFovDegrees: 50))
  }
}
