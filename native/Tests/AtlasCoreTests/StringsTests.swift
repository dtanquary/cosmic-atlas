import XCTest
import AtlasTestSupport
@testable import AtlasCore

/// Drift guard: every disclosure sentence the native client shows must still exist verbatim in the web source.
final class StringsTests: XCTestCase {
  func testEverySentenceAppearsInTheWebSource() throws {
    let sources = try ["src/app.ts", "src/explorer.ts", "src/galaxy-search.ts"].map { try String(contentsOf: RepoPaths.file($0), encoding: .utf8) }.joined(separator: "\n")
    for sentence in Strings.all { XCTAssertTrue(sources.contains(sentence), "missing in web source: \(sentence)") }
    XCTAssertEqual(Strings.uncertainLocalWarning(shown: false), "Uncertain local position. This redshift does not establish a reliable nearby distance. Position hidden; no physical model is available.")
  }
}
