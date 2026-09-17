import SwiftUI
import AtlasCore
import AtlasRender

/// The web's Guided tours dialog: one Start per route; the trip editor arrives later in Phase 5.
struct ToursSheet: View {
  @Bindable var model: AtlasModel
  var body: some View {
    NavigationStack {
      List {
        Text("A tour moves the camera between real destinations and explains each one. Drag, pinch or any navigation control pauses it. Nothing about the catalog or your saved settings changes.")
          .font(.footnote).foregroundStyle(.secondary)
        ForEach(model.session.reference.tours, id: \.key) { tour in
          VStack(alignment: .leading, spacing: 6) {
            Text(tour.title).font(.headline)
            Text(tour.summary).font(.footnote).foregroundStyle(.secondary)
            Button("Start") { model.startTour(tour) }.buttonStyle(.borderedProminent).disabled(!model.ready).accessibilityLabel("Start \(tour.title)")
          }.padding(.vertical, 4)
        }
      }
      .navigationTitle("Guided tours")
      .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Close") { model.showTours = false } } }
    }
  }
}

/// The tour panel (src/app.ts renderTour): progress, stop text, Prev / Play / Next, status, and the stops & pace menu.
struct TourPanel: View {
  @Bindable var model: AtlasModel
  var body: some View {
    if let tour = model.tour {
      let state = model.tourState, stops = tour.tour.stops
      let playing = state.autoplay && state.status != .finished && state.status != .paused && state.status != .partial
      let action = tour.pace == .manual ? "Manual" : playing ? "Pause" : state.status == .finished ? "Restart" : "Continue"
      VStack(alignment: .leading, spacing: 4) {
        HStack {
          Menu {
            Section("Jump to a stop") {
              ForEach(Array(stops.enumerated()), id: \.element.id) { index, stop in Button("\(index + 1). \(stop.title)") { model.pausedByInput = false; tour.jump(stop.id) } }
            }
            Picker("Tour pace", selection: Binding(get: { model.tourPace }, set: { model.setTourPace($0) })) {
              Text("Quick · shorter stops").tag(TourPace.quick); Text("Relaxed · more time to look").tag(TourPace.relaxed); Text("Manual · advance with Next").tag(TourPace.manual)
            }
            Button("Return to stop") { model.pausedByInput = false; tour.returnToStop() }
          } label: { Text("Guided tour · \(state.index + 1) / \(stops.count)").font(.caption).foregroundStyle(.secondary) }
          Spacer()
          Button("Exit") { model.exitTour() }.font(.caption)
        }
        Text(tour.tour.title).font(.caption2).foregroundStyle(.secondary)
        Text(state.stop?.title ?? "").font(.headline)
        Text(state.stop?.cue ?? "").font(.subheadline)
        Text(state.stop?.caption ?? "").font(.caption).foregroundStyle(.secondary)
        if let note = state.stop?.note { Text("Trip note: " + note).font(.caption).italic() }
        HStack(spacing: 12) {
          Button("Prev") { model.pausedByInput = false; tour.previous() }.disabled(state.index <= 0)
          Button(action) { model.pausedByInput = false; if state.autoplay && state.status != .finished { tour.pause() } else { tour.play() } }.disabled(tour.pace == .manual)
          Button("Next") { model.pausedByInput = false; tour.next() }.disabled(state.status == .finished)
          if state.status == .partial { Button("Retry this stop") { model.session.retry(); model.pausedByInput = false; tour.returnToStop() } }
        }.font(.caption).buttonStyle(.bordered)
        Text(status(state)).font(.caption2).foregroundStyle(.secondary)
      }
      .padding(10).background(.black.opacity(0.7)).clipShape(RoundedRectangle(cornerRadius: 10))
    }
  }
  func status(_ state: TourState) -> String {
    switch state.status {
    case .preparing: "Preparing the arrival view…"
    case .partial: "Partial data · Retry, Continue, or choose Next"
    case .travelling: "Travelling…"
    case .dwelling: "Arrived · continuing shortly"
    case .finished: "Finished · Exit returns to the map"
    default: model.pausedByInput ? "Paused · drag or pinch moved the view" : "Paused"
    }
  }
}
