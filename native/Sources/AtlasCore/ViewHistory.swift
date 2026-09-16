import Foundation

/// A small session history of deliberate navigation, independent of tour Prev.
/// Stores the validated link grammar so later camera mutations cannot alter it. (Port of src/view-history.ts.)
public struct ViewHistory: Sendable {
  private var views: [String] = []
  public let limit: Int
  public init(limit: Int = 32) { self.limit = limit }
  public mutating func remember(_ view: ViewState) {
    guard let hash = ViewLink.encode(view), hash != views.last else { return }
    views.append(hash)
    if views.count > limit { views.removeFirst() }
  }
  public func available(_ current: ViewState) -> Bool {
    let hash = ViewLink.encode(current)
    return views.contains { $0 != hash }
  }
  public mutating func back(_ current: ViewState) -> ViewState? {
    let hash = ViewLink.encode(current)
    while let previous = views.popLast() { if previous != hash { return ViewLink.decode(previous) } }
    return nil
  }
}
