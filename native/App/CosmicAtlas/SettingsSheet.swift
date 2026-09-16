import SwiftUI
import AtlasCore
import AtlasRender

/// The web's Settings dialog: overlays, galaxy appearance and close-ups (applied when the models land), the local
/// guard, point enlargement, distance fading (session-only), the minimum opacity floor, and units (session-only).
struct SettingsSheet: View {
  @Bindable var model: AtlasModel
  var body: some View {
    NavigationStack {
      Form {
        Section("Cosmic overlays") {
          Toggle("CMB shell", isOn: binding(\.cosmicHorizon) { model.session.cosmicHorizon = $0 })
          Toggle("Lookback time rings", isOn: binding(\.lookbackRings) { model.session.lookbackRings = $0 })
          Toggle("Survey footprint", isOn: binding(\.surveyFootprint) { model.session.surveyFootprint = $0 })
          if model.settings.surveyFootprint { Text(Strings.footprintHint).font(.footnote).foregroundStyle(.secondary) }
          Button("View cosmic scale") { model.settings.cosmicHorizon = true; model.session.cosmicHorizon = true; model.session.viewCosmicHorizon(seconds: 1.5); model.showSettings = false }
        }
        Section("Galaxies") {
          Picker("Galaxy appearance", selection: binding(\.galaxyAppearance) { _ in }) { Text("All spirals").tag(GalaxyAppearance.spiral); Text("Catalog types").tag(GalaxyAppearance.catalog) }
          Picker("Galaxy close-ups", selection: binding(\.modelDisplay) { _ in }) { Text("Automatic").tag(ModelDisplay.automatic); Text("Focused only").tag(ModelDisplay.focused); Text("Points").tag(ModelDisplay.points) }
          Text(model.settings.modelDisplay == .points ? Strings.modelDisplayPoints : model.settings.modelDisplay == .focused ? Strings.modelDisplayFocused : "Nearby galaxies resolve automatically.").font(.footnote).foregroundStyle(.secondary)
        }
        Section("Points & distance") {
          Toggle("Show uncertain local positions", isOn: binding(\.showUncertainLocal) { model.session.showUncertainLocal = $0 })
          Toggle("Enlarge nearby points", isOn: binding(\.enlargePoints) { model.session.enlargePoints = $0 })
          Toggle("Distance fading", isOn: Binding(get: { model.session.depthCues }, set: { model.session.depthCues = $0 }))
          VStack(alignment: .leading) {
            Text("Minimum distant opacity · \(JSNumber.toString(model.settings.minimumOpacityPercent))%")
            Slider(value: binding(\.minimumOpacityPercent) { model.session.minOpacity = $0 / 100 }, in: 0...100, step: 0.5).disabled(!model.session.depthCues)
          }
          Picker("Units", selection: $model.units) { Text("light years").tag(Units.ly); Text("Mpc").tag(Units.mpc) }
        }
      }
      .navigationTitle("Settings")
      .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { model.showSettings = false } } }
    }
  }
  /// Every persisted setting writes through the model so the web's localStorage keys stay in step.
  func binding<T>(_ keyPath: WritableKeyPath<Settings, T>, apply: @escaping (T) -> Void) -> Binding<T> {
    Binding(get: { model.settings[keyPath: keyPath] }, set: { value in model.settings[keyPath: keyPath] = value; apply(value); model.settings.save(to: UserDefaults.standard) })
  }
}

/// Ring labels anchored where the shader drew each ring's top silhouette point.
struct RingLabelsOverlay: View {
  let labels: [AtlasSession.RingLabel]
  var body: some View {
    GeometryReader { _ in
      ForEach(labels.indices, id: \.self) { i in
        let label = labels[i]
        if label.visible {
          Text("\(formatLookback(label.lookbackGyr)) ago").font(.caption2).foregroundStyle(Color(red: 0.31, green: 0.61, blue: 0.72).opacity(0.9))
            .position(x: label.x, y: label.y - 10)
        }
      }
    }.allowsHitTesting(false)
  }
}
