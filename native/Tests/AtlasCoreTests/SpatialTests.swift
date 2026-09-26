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

  func testKeepsLoadedAncestorsDrawnBeneathChildren() {
    let required: Set = ["0", "1", "2"]
    var result = layeredFrontier(root: "0", nodes: nodes, required: required, loaded: { $0 != "2" })
    XCTAssertEqual(result.layers, ["0", "1"]); XCTAssertEqual(result.surface, ["0"])
    result = layeredFrontier(root: "0", nodes: nodes, required: required, loaded: { _ in true })
    XCTAssertEqual(result.layers, ["0", "1", "2"]); XCTAssertEqual(result.surface, ["1", "2"])
    result = layeredFrontier(root: "0", nodes: nodes, required: required, loaded: { $0 != "0" })
    XCTAssertEqual(result.layers, []); XCTAssertEqual(result.surface, [])
  }

  func testFindsRowsSharedWithAnAncestorInHashOrder() {
    let ancestor: [UInt32] = [9, 4, 7, 1, 8]
    XCTAssertEqual(sharedPrefix([4, 1, 3, 5], ancestor), 2)
    XCTAssertEqual(sharedPrefix([9, 7], ancestor), 2)
    XCTAssertEqual(sharedPrefix([3, 9], ancestor), 0)
    XCTAssertEqual(sharedPrefix([], ancestor), 0)
  }

  func testCullsUnobservedDirectionsWithoutInventingPoints() {
    XCTAssertEqual(chooseFrontier(FrontierOptions(root: "0", nodes: nodes, mode: .full, budget: 0, visible: { $0.id != "2" }, projectedSize: { _ in 1000 })), ["1"])
    XCTAssertEqual(chooseFrontier(FrontierOptions(root: "0", nodes: nodes, mode: .full, budget: 0, visible: { _ in false }, projectedSize: { _ in 1000 })), [])
  }
}
