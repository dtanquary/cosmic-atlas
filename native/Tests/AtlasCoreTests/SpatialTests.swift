import XCTest
@testable import AtlasCore

// Port of tests/core.test.ts (spatial coverage and detail completeness).
final class SpatialTests: XCTestCase {
  static func node(_ id: String, _ count: Int, _ children: [String] = []) -> CatalogNode {
    let empty = Asset(url: "", bytes: 0, decodedBytes: 0, sha256: "")
    return CatalogNode(id: id, count: count, storedCount: children.isEmpty ? count : 2, center: .zero, min: SIMD3(repeating: -1), max: SIMD3(repeating: 1), children: children, points: empty, metadata: empty)
  }
  let nodes = Dictionary(uniqueKeysWithValues: [node("0", 8, ["1", "2"]), node("1", 4), node("2", 4)].map { ($0.id, $0) })

  func testLimitsAdaptiveDetailWhileFullKeepsEveryVisibleLeaf() {
    let options = FrontierOptions(root: "0", nodes: nodes, mode: .adaptive, budget: 4, visible: { _ in true }, projectedSize: { _ in 1000 })
    XCTAssertEqual(chooseFrontier(options), ["0"])
    var full = options; full.mode = .full
    XCTAssertEqual(chooseFrontier(full), ["1", "2"])
    var wide = options; wide.budget = 8
    XCTAssertEqual(chooseFrontier(wide), ["1", "2"])
  }

  func testUsesParentUntilAllRequiredChildrenLoad() {
    let desired: Set = ["1", "2"], required: Set = ["0", "1", "2"]
    XCTAssertEqual(coveredFrontier(root: "0", nodes: nodes, desired: desired, required: required, loaded: { $0 != "2" }), ["0"])
    XCTAssertEqual(coveredFrontier(root: "0", nodes: nodes, desired: desired, required: required, loaded: { _ in true }), ["1", "2"])
    XCTAssertEqual(coveredFrontier(root: "0", nodes: nodes, desired: desired, required: required, loaded: { _ in false }), [])
  }

  func testCullsUnobservedDirectionsWithoutInventingPoints() {
    XCTAssertEqual(chooseFrontier(FrontierOptions(root: "0", nodes: nodes, mode: .full, budget: 0, visible: { $0.id != "2" }, projectedSize: { _ in 1000 })), ["1"])
    XCTAssertEqual(chooseFrontier(FrontierOptions(root: "0", nodes: nodes, mode: .full, budget: 0, visible: { _ in false }, projectedSize: { _ in 1000 })), [])
  }
}
