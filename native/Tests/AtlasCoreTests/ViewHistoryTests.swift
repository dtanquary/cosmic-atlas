import XCTest
@testable import AtlasCore

// Port of tests/view-history.test.ts.
final class ViewHistoryTests: XCTestCase {
  func view(_ x: Double) -> ViewState { ViewState(target: [x, 0, 0], camera: [x, 0, 1], identity: .nearby("m31")) }

  func testRestoresCopiedCameraAndExactPublicIdentity() {
    var history = ViewHistory()
    var original = view(1); original.identity = .desi(node: "512", row: 20296, targetId: "39633325333155389")
    history.remember(original)
    original.target.x = 42; original.identity = .desi(node: "512", row: 20296, targetId: "1")
    XCTAssertEqual(history.back(view(2)), ViewState(target: [1, 0, 0], camera: [1, 0, 1], identity: .desi(node: "512", row: 20296, targetId: "39633325333155389")))
    XCTAssertFalse(history.available(view(2)))
  }
  func testSkipsCurrentPoseAndDuplicatesAndBoundsThePast() {
    var history = ViewHistory(limit: 2)
    history.remember(view(0)); history.remember(view(1)); history.remember(view(1)); history.remember(view(2))
    XCTAssertTrue(history.available(view(2)))
    XCTAssertEqual(history.back(view(2)), view(1))
    XCTAssertNil(history.back(view(1)))
  }
  func testIgnoresViewsOutsideTheGrammarAndNoOpBack() {
    var history = ViewHistory()
    history.remember(view(.infinity)); XCTAssertFalse(history.available(view(0)))
    history.remember(view(0)); XCTAssertFalse(history.available(view(0))); XCTAssertNil(history.back(view(0)))
  }
}
