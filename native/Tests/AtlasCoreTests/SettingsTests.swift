import XCTest
@testable import AtlasCore

final class SettingsTests: XCTestCase {
  func testDefaultsRoundTripAndValidation() {
    let store = MemoryStore()
    XCTAssertEqual(Settings.load(from: store), Settings())
    var s = Settings(); s.cosmicHorizon = true; s.galaxyAppearance = .catalog; s.modelDisplay = .focused; s.minimumOpacityPercent = 12.5; s.enlargePoints = true
    s.save(to: store)
    XCTAssertEqual(store.values["atlas-cosmic-horizon"], "true"); XCTAssertEqual(store.values["atlas-galaxy-appearance"], "catalog"); XCTAssertEqual(store.values["atlas-minimum-opacity"], "12.5")
    XCTAssertEqual(Settings.load(from: store), s)
    store.values["atlas-galaxy-appearance"] = "weird"; store.values["atlas-model-display"] = "x"; store.values["atlas-minimum-opacity"] = "101"; store.values["atlas-cosmic-horizon"] = "TRUE"
    let loaded = Settings.load(from: store)
    XCTAssertEqual(loaded.galaxyAppearance, .spiral); XCTAssertEqual(loaded.modelDisplay, .automatic); XCTAssertEqual(loaded.minimumOpacityPercent, 0.5); XCTAssertFalse(loaded.cosmicHorizon)
    store.values["atlas-minimum-opacity"] = " 0 "; XCTAssertEqual(Settings.load(from: store).minimumOpacityPercent, 0)
  }
  func testSavedViewsKeepTheWebShapeAndBounds() {
    let store = MemoryStore()
    XCTAssertEqual(SavedViews.read(from: store), [])
    let views = (0..<60).map { SavedView(name: "v\($0)", hash: "#t=\($0),0,0&c=0,0,1", savedAt: "2026-09-16T00:00:00.000Z") }
    XCTAssertTrue(SavedViews.write(views, to: store))
    XCTAssertEqual(SavedViews.read(from: store).count, 50)
    XCTAssertTrue(store.values["atlas-saved-views"]!.contains("\"version\":1"))
    store.values["atlas-saved-views"] = ##"{"version":1,"views":[{"name":"ok","hash":"#t=1,2,3&c=0,0,1&g=sun","savedAt":"x"},{"name":"bad","hash":"#t=1,2","savedAt":"x"},{"name":"missing"}]}"##
    XCTAssertEqual(SavedViews.read(from: store).map(\.name), ["ok"])
    store.values["atlas-saved-views"] = #"{"version":2,"views":[]}"#; XCTAssertEqual(SavedViews.read(from: store), [])
    store.values["atlas-saved-views"] = "broken"; XCTAssertEqual(SavedViews.read(from: store), [])
    store.throwsOnWrite = true; XCTAssertFalse(SavedViews.write(views, to: store))
  }
}
