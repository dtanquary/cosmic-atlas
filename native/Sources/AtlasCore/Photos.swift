import Foundation
import simd

// Port of src/photos.ts.

let namedPhotoIdentities: [String: String] = ["NGC 3982": "39633325333155389", "NGC 4026": "39633263488141603"]

public func photosForStop(_ stop: TourStop?, photos: [Photograph]) -> [Photograph] {
  guard let stop else { return [] }
  if (stop.sourceStop?.id ?? stop.id) == "andromeda-companions" { return photos.filter { ["nearby:m32", "nearby:m110"].contains($0.identity) } }
  let target = stop.target
  if target.kind == .view { return photosForIdentity(target.view?.identity?.publicId, photos: photos) }
  let key: String? = switch target.kind {
    case .sun, .core: "core"
    case .nearby: "nearby:\(target.key ?? "")"
    case .catalog: namedPhotoIdentities[target.name ?? ""]
    case .cluster: "cluster:\(target.key ?? "")"
    default: nil
  }
  return photos.filter { $0.identity == key }
}

public func photosForIdentity(_ identity: String?, photos: [Photograph]) -> [Photograph] {
  photos.filter { $0.identity == (identity == "sun" ? "core" : identity) }
}

/// Observer-facing, with the calibrated photograph's vertical angular field. The atlas can have a different aspect ratio.
public func matchedPhotoView(_ photo: Photograph, state: ViewState, verticalFovDegrees: Double) -> ViewState? {
  guard let match = photo.match, let fov = photo.fovArcmin, fov.count == 2, state.identity?.publicId == photo.identity, verticalFovDegrees > 0, verticalFovDegrees < 180 else { return nil }
  _ = match
  let distance = simd_length(state.target)
  guard distance > 0 else { return nil }
  let viewDistance = distance * tan(fov[1] * .pi / (180 * 60 * 2)) / tan(verticalFovDegrees * .pi / 360)
  var view = state
  view.camera = state.target * (1 - viewDistance / distance)
  return view
}
