import XCTest
import Metal
@testable import AtlasRender

/// The SwiftPM-built Metal library must exist and expose the point pass on the host GPU.
final class LibraryTests: XCTestCase {
  func testDefaultLibraryContainsPointPass() throws {
    guard MTLCreateSystemDefaultDevice() != nil else { throw XCTSkip("No Metal device") }
    let renderer = try AtlasRenderer()
    XCTAssertNotNil(renderer.library.makeFunction(name: "atlas_point_vertex"))
    XCTAssertNotNil(renderer.library.makeFunction(name: "atlas_point_fragment"))
  }
}
