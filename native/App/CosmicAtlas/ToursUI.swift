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

/// The tour panel (src/app.ts renderTour) as one glass card that minimizes to a single row: progress, stop title,
/// play and next. Expanded it adds the cue, a bounded scrolling caption, Prev and Exit. Phones start minimized so the
/// stop text never covers the map; iPads start expanded. The stops & pace menu and Exit live under the ellipsis.
struct TourPanel: View {
  @Bindable var model: AtlasModel
  @Environment(\.horizontalSizeClass) private var sizeClass
  @State private var expandedChoice: Bool?
  private var expanded: Bool { expandedChoice ?? (sizeClass == .regular) }
  var body: some View {
    if let tour = model.tour {
      let state = model.tourState, stops = tour.tour.stops
      let playing = state.autoplay && state.status != .finished && state.status != .paused && state.status != .partial
      let action = tour.pace == .manual ? "Manual" : playing ? "Pause" : state.status == .finished ? "Restart" : "Continue"
      VStack(alignment: .leading, spacing: 6) {
        HStack(spacing: 10) {
          Button { withAnimation(.snappy) { expandedChoice = !expanded } } label: {
            HStack(spacing: 6) {
              Image(systemName: expanded ? "chevron.down" : "chevron.up").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
              Text("\(state.index + 1)/\(stops.count)").font(.caption).monospacedDigit().foregroundStyle(.secondary)
              Text(state.stop?.title ?? tour.tour.title).font(.subheadline.weight(.semibold)).lineLimit(1)
            }.contentShape(Rectangle())
          }.buttonStyle(.plain).accessibilityLabel(expanded ? "Minimize tour details" : "Show tour details")
          Spacer(minLength: 4)
          Button { model.pausedByInput = false; if state.autoplay && state.status != .finished { tour.pause() } else { tour.play() } } label: { Image(systemName: playing ? "pause.fill" : "play.fill") }
            .disabled(tour.pace == .manual).accessibilityLabel(tour.pace == .manual ? "Manual pace: choose Previous or Next stop" : "\(action) the tour")
          Button { model.pausedByInput = false; tour.next() } label: { Image(systemName: "forward.end.fill") }.disabled(state.status == .finished).accessibilityLabel("Next stop")
          Menu {
            Section("Jump to a stop") {
              ForEach(Array(stops.enumerated()), id: \.element.id) { index, stop in Button("\(index + 1). \(stop.title)") { model.pausedByInput = false; tour.jump(stop.id) } }
            }
            Picker("Tour pace", selection: Binding(get: { model.tourPace }, set: { model.setTourPace($0) })) {
              Text("Quick · shorter stops").tag(TourPace.quick); Text("Relaxed · more time to look").tag(TourPace.relaxed); Text("Manual · advance with Next").tag(TourPace.manual)
            }
            Button("Return to stop") { model.pausedByInput = false; tour.returnToStop() }
            Button("Exit the tour", role: .destructive) { model.exitTour() }
          } label: { Image(systemName: "ellipsis.circle") }.accessibilityLabel("Tour stops and pace")
        }
        .font(.body)
        if expanded {
          Text("\(tour.tour.title) · \(status(state))").font(.caption2).foregroundStyle(.secondary)
          if let cue = state.stop?.cue, !cue.isEmpty { Text(cue).font(.subheadline) }
          ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 4) {
              Text(state.stop?.caption ?? "").font(.caption).foregroundStyle(.secondary)
              if let note = state.stop?.note { Text("Trip note: " + note).font(.caption).italic() }
            }.frame(maxWidth: .infinity, alignment: .leading)
          }
          .fixedSize(horizontal: false, vertical: true)
          .frame(maxHeight: sizeClass == .regular ? 220 : 110)
          HStack(spacing: 12) {
            Button("Prev") { model.pausedByInput = false; tour.previous() }.disabled(state.index <= 0)
            if state.status == .partial { Button("Retry this stop") { model.session.retry(); model.pausedByInput = false; tour.returnToStop() } }
            Spacer()
            Button("Exit") { model.exitTour() }
          }.font(.caption).buttonStyle(.bordered)
        } else if state.status == .partial || state.status == .preparing {
          Text(status(state)).font(.caption2).foregroundStyle(.secondary)
        }
      }
      .padding(12)
      .glassEffect(.regular, in: .rect(cornerRadius: 20))
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
