import SwiftUI
import AtlasCore

/// Phase 0 placeholder: proves the app links AtlasCore and reaches the bundled reference data.
/// The Metal view, session loop and product UI arrive in Phases 2–5.
struct ContentView: View {
  private var toursBundled: Bool { Bundle.main.url(forResource: "tours", withExtension: "json", subdirectory: "data") != nil }
  var body: some View {
    ZStack {
      Color(red: 6 / 255, green: 9 / 255, blue: 13 / 255).ignoresSafeArea()
      VStack(spacing: 8) {
        Text("Cosmic Atlas").font(.title2.weight(.semibold))
        Text("Native client scaffold · \(formatDistance(1000))").font(.footnote)
        Text(toursBundled ? "Reference data bundled" : "Reference data missing").font(.footnote)
      }.foregroundStyle(.white)
    }
  }
}
