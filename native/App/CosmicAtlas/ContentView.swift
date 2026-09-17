import SwiftUI
import AtlasCore
import AtlasRender

struct AtlasView: UIViewControllerRepresentable {
  let session: AtlasSession
  func makeUIViewController(context: Context) -> AtlasViewController { AtlasViewController(session: session) }
  func updateUIViewController(_ controller: AtlasViewController, context: Context) {}
}

/// Phase 2 shell: the map, a loading overlay, the footer counts and detail switch, a toast and a minimal inspector.
/// The full product UI (search, share, tours, trips, photos, About the data) arrives in Phase 5.
struct ContentView: View {
  @State private var model: AtlasModel? = try? AtlasModel()
  var body: some View {
    if let model { AtlasScreen(model: model) }
    else { Text("This device has no Metal GPU.").foregroundStyle(.white).frame(maxWidth: .infinity, maxHeight: .infinity).background(Color(red: 6 / 255, green: 9 / 255, blue: 13 / 255)) }
  }
}

struct AtlasScreen: View {
  @Bindable var model: AtlasModel
  var body: some View {
    ZStack(alignment: .bottom) {
      AtlasView(session: model.session).ignoresSafeArea()
        .onLongPressGesture { model.diagnostics.toggle() }
      RingLabelsOverlay(labels: model.ringLabels)
      if !model.ready { LoadingOverlay(error: model.loadError) { Task { await model.open() } } }
      VStack { HeaderBar(model: model); Spacer() }.padding(.horizontal, 12)
      VStack(alignment: .leading, spacing: 6) {
        if let toast = model.toast { Text(toast).font(.footnote).padding(8).background(.black.opacity(0.7)).clipShape(RoundedRectangle(cornerRadius: 8)) }
        if model.diagnostics { DiagnosticsLine(stats: model.stats) }
        if let galaxy = model.selected { InspectorCard(galaxy: galaxy, units: model.units, onClose: { model.session.clearSelection() }) }
        FooterBar(model: model)
      }
      .padding(.horizontal, 12).padding(.bottom, 8)
    }
    .foregroundStyle(.white)
    .sheet(isPresented: $model.showSettings) { SettingsSheet(model: model) }
    .task { if ProcessInfo.processInfo.environment["XCTestSessionIdentifier"] == nil { await model.open() } } // hosted tests drive their own session
    .statusBarHidden(false)
  }
}

struct HeaderBar: View {
  @Bindable var model: AtlasModel
  var body: some View {
    HStack(spacing: 8) {
      Text("Cosmic Atlas").font(.headline)
      Spacer()
      Button { model.session.reset(seconds: 1.5) } label: { Image(systemName: "scope") }.accessibilityLabel("Overview")
      Button { model.settings.cosmicHorizon.toggle(); model.session.cosmicHorizon = model.settings.cosmicHorizon; model.settings.save(to: UserDefaults.standard) } label: { Image(systemName: "circle.dashed") }
        .accessibilityLabel("CMB shell").foregroundStyle(model.settings.cosmicHorizon ? .cyan : .white)
      Button { model.showSettings = true } label: { Image(systemName: "gearshape") }.accessibilityLabel("Settings")
    }
    .padding(10).background(.black.opacity(0.5)).clipShape(RoundedRectangle(cornerRadius: 10))
  }
}

struct LoadingOverlay: View {
  let error: String?
  let retry: () -> Void
  var body: some View {
    ZStack {
      Color(red: 6 / 255, green: 9 / 255, blue: 13 / 255).ignoresSafeArea()
      VStack(spacing: 12) {
        if let error {
          Text(error).multilineTextAlignment(.center)
          Button("Retry opening atlas", action: retry).buttonStyle(.borderedProminent)
        } else {
          ProgressView().tint(.white)
          Text("Opening the galaxy catalog…").font(.footnote)
        }
      }.padding(24)
    }.foregroundStyle(.white)
  }
}

struct DiagnosticsLine: View {
  let stats: AtlasStats
  var body: some View {
    Text(String(format: "%.0f FPS · p95 %.1f ms · gpu %.1f ms / %d draw calls · %d close-up models / %.0f MiB managed / budget %d", stats.fps, stats.p95, stats.gpuMs, stats.calls, stats.models, stats.managedMiB, stats.budget))
      .font(.system(.caption2, design: .monospaced)).padding(6).background(.black.opacity(0.6)).clipShape(RoundedRectangle(cornerRadius: 6))
  }
}

struct FooterBar: View {
  @Bindable var model: AtlasModel
  var detailStatus: String {
    let s = model.stats
    let mode = s.mode == .full ? "Full detail" : "Adaptive detail"
    let note = s.blocked ? " · memory limit reached" : s.failed > 0 ? " · some data unavailable" : s.pending > 0 ? " · loading \(s.pending) chunks" : s.complete ? " · all detail in view" : s.drawn == 0 ? " · outside survey view" : " · sampled positions"
    return mode + note
  }
  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      VStack(alignment: .leading, spacing: 2) {
        Text("\(model.session.manifest?.count.formatted() ?? "…") catalog observations · \(model.stats.drawn.formatted()) submitted").font(.caption)
        Text(detailStatus).font(.caption2).foregroundStyle(.secondary)
      }
      Spacer()
      Picker("Detail", selection: Binding(get: { model.stats.mode }, set: { model.setMode($0) })) {
        Text("Adaptive").tag(DetailMode.adaptive); Text("Full").tag(DetailMode.full)
      }.pickerStyle(.segmented).frame(width: 160)
      if model.stats.failed > 0 || model.stats.blocked { Button("Retry") { model.session.retry() }.font(.caption) }
    }
    .padding(10).background(.black.opacity(0.6)).clipShape(RoundedRectangle(cornerRadius: 10))
  }
}

/// Minimal inspector: exact identity and the measured values. Disclosure wording and the profile section come with Phase 5.
struct InspectorCard: View {
  let galaxy: Galaxy
  let units: Units
  let onClose: () -> Void
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack { Text(galaxy.nearby == nil ? Strings.sourceObservation : Strings.sourceNearby).font(.caption).foregroundStyle(.secondary); Spacer(); Button("Close", action: onClose).font(.caption) }
      Text(galaxy.nearby?.name ?? "DESI \(galaxy.targetId)").font(.headline).textSelection(.enabled)
      Text(uncertainLocalPosition(galaxy) ? Strings.distanceCaptionUncertain : galaxy.nearby != nil ? Strings.distanceCaptionNearby : Strings.distanceCaptionComoving).font(.caption2).foregroundStyle(.secondary)
      Text(formatDistance(galaxy.distance, units: units)).font(.title3)
      Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 2) {
        GridRow { Text("RA").foregroundStyle(.secondary); Text(String(format: "%.5f°", galaxy.ra)) }
        GridRow { Text("Dec").foregroundStyle(.secondary); Text(String(format: "%@%.5f°", galaxy.dec >= 0 ? "+" : "", galaxy.dec)) }
        GridRow { Text("Redshift").foregroundStyle(.secondary); Text(galaxy.z.map { $0 < 0.0001 ? String(format: "%.3e", $0) : String(format: "%.6f", $0) } ?? Strings.redshiftNotUsed) }
      }.font(.caption)
    }
    .padding(10).background(.black.opacity(0.7)).clipShape(RoundedRectangle(cornerRadius: 10))
  }
}
