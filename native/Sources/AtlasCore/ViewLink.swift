import Foundation
import simd

// Port of src/view-link.ts. Byte-identical grammar so links round-trip with the web app.

/// What the view is looking at; DESI identities keep the exact 64-bit target ID as a string. The dense id is derived from data, never trusted from a link.
public enum ViewIdentity: Sendable, Equatable, Hashable {
  case sun, core
  case nearby(String)
  case desi(node: String, row: Int, targetId: String)
  public var text: String {
    switch self {
    case .sun: "sun"
    case .core: "core"
    case .nearby(let key): "nearby:\(key)"
    case .desi(let node, let row, let targetId): "desi:\(node):\(row):\(targetId)"
    }
  }
  /// The public identity the photo and view-history code compare: `sun`, `core`, `nearby:key` or the DESI target id.
  public var publicId: String {
    if case .desi(_, _, let targetId) = self { return targetId }
    return text
  }
  static var grammar: Regex<(Substring, Substring, Substring?, Substring?, Substring?)> { /^(sun|core|nearby:[a-z0-9]{1,16}|desi:(\d{1,6}):(\d{1,5}):(-?\d{1,20}))$/ }
  public init?(_ text: String) {
    guard let match = text.wholeMatch(of: Self.grammar) else { return nil }
    if let node = match.2, let row = match.3, let targetId = match.4 {
      self = .desi(node: String(node), row: Int(row)!, targetId: String(targetId))
    } else if text == "sun" { self = .sun } else if text == "core" { self = .core } else { self = .nearby(String(text.dropFirst("nearby:".count))) }
  }
}

public struct ViewState: Sendable, Equatable {
  public var target: SIMD3<Double>, camera: SIMD3<Double>, identity: ViewIdentity?
  public init(target: SIMD3<Double>, camera: SIMD3<Double>, identity: ViewIdentity?) { self.target = target; self.camera = camera; self.identity = identity }
}

public enum ViewLink {
  static func inRange(_ v: Double) -> Bool { abs(v) < 1e6 }

  /// `#t=x,y,z&c=dx,dy,dz[&g=identity]`; `c` is the camera relative to the target so close orbits survive 12 digits. Nil when a value is non-finite or beyond 1e6 Mpc.
  public static func encode(_ state: ViewState) -> String? {
    let offset = state.camera - state.target
    let values = [state.target.x, state.target.y, state.target.z, offset.x, offset.y, offset.z]
    guard values.allSatisfy({ $0.isFinite && inRange($0) }) else { return nil }
    let t = [state.target.x, state.target.y, state.target.z].map { JSNumber.format($0) }.joined(separator: ",")
    let c = [offset.x, offset.y, offset.z].map { JSNumber.format($0) }.joined(separator: ",")
    let g = state.identity.map { "&g=\($0.text)" } ?? ""
    return "#t=\(t)&c=\(c)\(g)"
  }

  /// Returns nil for anything outside the grammar; never throws. Unknown keys are ignored, duplicates use the first.
  public static func decode(_ hash: String) -> ViewState? {
    let params = JSQuery.parse(hash.hasPrefix("#") ? String(hash.dropFirst()) : hash)
    func triple(_ key: String) -> SIMD3<Double>? {
      let parts = (JSQuery.first(params, key) ?? "").split(separator: ",", omittingEmptySubsequences: false)
      guard parts.count == 3 else { return nil }
      let values = parts.compactMap { JSNumber.parse(String($0)) }
      guard values.count == 3, values.allSatisfy(inRange) else { return nil }
      return SIMD3(values[0], values[1], values[2])
    }
    guard let target = triple("t"), let offset = triple("c") else { return nil }
    var identity: ViewIdentity? = nil
    if let g = JSQuery.first(params, "g") {
      guard let parsed = ViewIdentity(g) else { return nil }
      identity = parsed
    }
    return ViewState(target: target, camera: target + offset, identity: identity)
  }

  /// A tour invitation carries no camera/selection and always starts at stop one.
  public static let roadTripHash = "#tour=road-trip"
  public static func decodeTourLink(_ hash: String) -> String? { hash == roadTripHash ? "road-trip" : nil }
}
