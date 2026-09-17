import SwiftUI
import AtlasCore
import AtlasRender

struct AtlasView: UIViewControllerRepresentable {
  let session: AtlasSession
  func makeUIViewController(context: Context) -> AtlasViewController { AtlasViewController(session: session) }
  func updateUIViewController(_ controller: AtlasViewController, context: Context) {}
}

/// The map with its floating functional layer. Every panel, bar and toast is regular Liquid Glass (iOS 26): the map is
/// the content layer and stays untouched, the glass elements are few and grouped in two containers so they morph
/// together, and nothing inside a glass panel is glass again. The map is always dark, so the app renders dark.
/// The full product UI (search, share, trips, photos, About the data) arrives with the rest of Phase 5.
struct ContentView: View {
  @State private var model: AtlasModel? = try? AtlasModel()
  var body: some View {
    Group {
      if let model { AtlasScreen(model: model) }
      else { Text("This device has no Metal GPU.").frame(maxWidth: .infinity, maxHeight: .infinity).background(Color(red: 6 / 255, green: 9 / 255, blue: 13 / 255)) }
    }
    .preferredColorScheme(.dark)
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
      GlassEffectContainer(spacing: 12) {
        VStack(alignment: .leading, spacing: 8) {
          if let toast = model.toast { Text(toast).font(.footnote).padding(.horizontal, 14).padding(.vertical, 8).glassEffect() }
          if model.diagnostics { DiagnosticsLine(stats: model.stats) }
          if model.tourActive { TourPanel(model: model) }
          else if let galaxy = model.selected { InspectorCard(galaxy: galaxy, units: model.units, onClose: { model.session.clearSelection() }) }
          FooterBar(model: model)
        }
      }
      .padding(.horizontal, 12).padding(.bottom, 8)
    }
    .sheet(isPresented: $model.showSettings) { SettingsSheet(model: model) }
    .sheet(isPresented: $model.showTours) { ToursSheet(model: model).presentationDetents([.medium, .large]) }
    .task { if ProcessInfo.processInfo.environment["XCTestSessionIdentifier"] == nil { await model.open() } } // hosted tests drive their own session
    .statusBarHidden(false)
  }
}

/// A 44-point glass icon button; `on` tints it so a toggle shows its state without a second layer of glass.
struct GlassIconButton: View {
  let symbol: String, label: String
  var on = false
  let action: () -> Void
  var body: some View {
    Button(action: action) { Image(systemName: symbol).font(.body.weight(.medium)).frame(width: 44, height: 44).contentShape(Circle()) }
      .buttonStyle(.plain)
      .glassEffect(.regular.tint(on ? Color.cyan.opacity(0.55) : nil).interactive())
      .accessibilityLabel(label)
      .accessibilityAddTraits(on ? .isSelected : [])
  }
}

struct HeaderBar: View {
  @Bindable var model: AtlasModel
  var body: some View {
    GlassEffectContainer(spacing: 8) {
      HStack(spacing: 8) {
        Text("Cosmic Atlas").font(.headline).padding(.horizontal, 14).padding(.vertical, 10).glassEffect()
        Spacer()
        GlassIconButton(symbol: "scope", label: "Overview") { model.session.reset(seconds: 1.5) }
        GlassIconButton(symbol: "circle.dashed", label: "CMB shell", on: model.settings.cosmicHorizon) {
          model.settings.cosmicHorizon.toggle(); model.session.cosmicHorizon = model.settings.cosmicHorizon; model.settings.save(to: UserDefaults.standard)
        }
        GlassIconButton(symbol: "map", label: "Guided tours") { model.showTours = true }
        GlassIconButton(symbol: "gearshape", label: "Settings") { model.showSettings = true }
      }
    }
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
          Button("Retry opening atlas", action: retry).buttonStyle(.glassProminent)
        } else {
          ProgressView()
          Text("Opening the galaxy catalog…").font(.footnote)
        }
      }.padding(24)
    }
  }
}

struct DiagnosticsLine: View {
  let stats: AtlasStats
  var body: some View {
    Text(String(format: "%.0f FPS · p95 %.1f ms · gpu %.1f ms / %d draw calls · %d close-up models / %.0f MiB managed / budget %d", stats.fps, stats.p95, stats.gpuMs, stats.calls, stats.models, stats.managedMiB, stats.budget))
      .font(.system(.caption2, design: .monospaced)).lineLimit(1).minimumScaleFactor(0.7)
      .padding(.horizontal, 12).padding(.vertical, 6).glassEffect()
  }
}

/// One-line footer: counts and detail status, with the detail mode in a menu so the bar stays short on a phone.
struct FooterBar: View {
  @Bindable var model: AtlasModel
  var detailStatus: String {
    let s = model.stats
    let mode = s.mode == .full ? "Full detail" : "Adaptive detail"
    let note = s.blocked ? " · memory limit reached" : s.failed > 0 ? " · some data unavailable" : s.pending > 0 ? " · loading \(s.pending) chunks" : s.complete ? " · all detail in view" : s.drawn == 0 ? " · outside survey view" : " · sampled positions"
    return mode + note
  }
  var body: some View {
    HStack(spacing: 8) {
      VStack(alignment: .leading, spacing: 1) {
        Text("\(model.session.manifest?.count.formatted() ?? "…") catalog observations · \(model.stats.drawn.formatted()) submitted")
        Text(detailStatus).foregroundStyle(.secondary)
      }.font(.caption2).lineLimit(1).minimumScaleFactor(0.8)
      Spacer(minLength: 4)
      if model.stats.failed > 0 || model.stats.blocked { Button("Retry") { model.session.retry() }.font(.caption).buttonStyle(.bordered) }
      Menu {
        Picker("Detail", selection: Binding(get: { model.stats.mode }, set: { model.setMode($0) })) { Text("Adaptive detail").tag(DetailMode.adaptive); Text("Full detail").tag(DetailMode.full) }
      } label: { Label(model.stats.mode == .full ? "Full" : "Adaptive", systemImage: "slider.horizontal.3").font(.caption) }
    }
    .padding(.horizontal, 12).padding(.vertical, 8)
    .glassEffect(.regular, in: .rect(cornerRadius: 16))
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
    .padding(12)
    .glassEffect(.regular, in: .rect(cornerRadius: 20))
  }
}
