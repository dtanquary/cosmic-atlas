import Foundation

/// Error text matches the web app's thrown messages so validation notes read the same.
public struct AtlasError: Error, Equatable, CustomStringConvertible, Sendable {
  public let message: String
  public init(_ message: String) { self.message = message }
  public var description: String { message }
}
